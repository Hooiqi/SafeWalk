import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { CAMPUS, buildTestContainer, createStaff, createTestDatabase, createUser } from './helpers/env.js';

let deps;
let app;
let student;
let other;
let trip;

const auth = (u) => ({ Authorization: `Bearer ${u.token}` });
const tokenOf = (t) => t.tracking_url.split('/t/')[1];

before(async () => {
  const url = await createTestDatabase('tracking');
  deps = await buildTestContainer(url);
  app = createApp(deps);
});

after(async () => deps.pool.end());

beforeEach(async () => {
  await deps.pool.query('truncate public.trip, public.trusted_contact, public.sos_alert cascade');
  deps.clock.set('2026-11-06T22:00:00Z');
  student = await createUser(deps.pool, { name: 'Aina Sample' });
  other = await createUser(deps.pool, { name: 'Other Sample' });
  const c = (await request(app).post('/api/contacts').set(auth(student)).send({ contact_name: 'Ali', email: 'ali@example.com' })).body;
  trip = (await request(app).post('/api/trips').set(auth(student)).send({ ...CAMPUS, contact_ids: [c.contact_id] })).body;
});

describe('trusted-contact tracking link', () => {
  it('shows the live journey without exposing private details', async () => {
    const res = await request(app).get(`/api/track/${tokenOf(trip)}`);
    assert.equal(res.status, 200);
    assert.equal(res.headers['cache-control'], 'no-store');
    const view = res.body;
    assert.equal(view.traveller_name, 'Aina Sample');
    assert.equal(view.status, 'ACTIVE');
    assert.deepEqual(view.destination, { ...CAMPUS.destination, label: null });
    assert.equal(view.trail.length, 1);
    assert.ok(view.eta_deadline);
    const text = JSON.stringify(view);
    for (const secret of ['+60123456789', 'student.usm.my', '23300000', 'ali@example.com', tokenOf(trip)]) {
      assert.ok(!text.includes(secret), `tracking view must not contain ${secret}`);
    }
  });

  it('rejects unknown and malformed tokens', async () => {
    assert.equal((await request(app).get('/api/track/short')).status, 404);
    assert.equal((await request(app).get(`/api/track/${'A'.repeat(43)}`)).status, 404);
    assert.equal((await request(app).get(`/api/track/${tokenOf(trip)}' or 1=1--`)).status, 404);
  });

  it('a link only ever shows its own journey', async () => {
    const c = (await request(app).post('/api/contacts').set(auth(other)).send({ contact_name: 'B', email: 'b@example.com' })).body;
    const otherTrip = (await request(app).post('/api/trips').set(auth(other)).send({ ...CAMPUS, contact_ids: [c.contact_id] })).body;
    const view = (await request(app).get(`/api/track/${tokenOf(trip)}`)).body;
    assert.equal(view.trip_id, trip.trip_id);
    assert.notEqual(view.trip_id, otherTrip.trip_id);
  });

  it('stays readable 30 minutes after arrival, then expires', async () => {
    await request(app).post(`/api/trips/${trip.trip_id}/arrive`).set(auth(student));
    deps.clock.advance(29 * 60);
    const ended = await request(app).get(`/api/track/${tokenOf(trip)}`);
    assert.equal(ended.body.status, 'COMPLETED');
    assert.equal(ended.body.end_reason, 'ARRIVED');
    deps.clock.advance(61);
    const expired = await request(app).get(`/api/track/${tokenOf(trip)}`);
    assert.equal(expired.status, 410);
    assert.equal(expired.body.error.code, 'LINK_EXPIRED');
  });
});

/**
 * RLS is tested as Supabase would apply it: switch to the `authenticated`
 * (or `anon`) role and set the JWT claims that auth.uid() reads.
 */
async function asRole(role, user, sql, params = []) {
  const client = await deps.pool.connect();
  try {
    await client.query('begin');
    await client.query(`set local role ${role}`);
    if (user) await client.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: user.id, email: user.email, role })]);
    const res = await client.query(sql, params);
    return res;
  } finally {
    await client.query('rollback');
    client.release();
  }
}

describe('row level security', () => {
  it('users see only their own profile, contacts, trips and location history', async () => {
    for (const table of ['app_user', 'trusted_contact', 'trip', 'location_log', 'trip_trusted_contact']) {
      const mine = await asRole('authenticated', student, `select count(*)::int as n from public.${table}`);
      const theirs = await asRole('authenticated', other, `select count(*)::int as n from public.${table}`);
      assert.ok(mine.rows[0].n >= 1, `${table}: owner sees own rows`);
      // `other` has a profile but no contacts/trips.
      assert.equal(theirs.rows[0].n, table === 'app_user' ? 1 : 0, `${table}: other user sees none of the student's rows`);
    }
  });

  it('the anon key reads nothing', async () => {
    for (const table of ['app_user', 'trusted_contact', 'trip', 'location_log', 'sos_alert', 'security_staff']) {
      const res = await asRole('anon', null, `select count(*)::int as n from public.${table}`);
      assert.equal(res.rows[0].n, 0, table);
    }
  });

  it('clients cannot create, alter or forge trips and alerts directly', async () => {
    await assert.rejects(
      asRole('authenticated', student, `update public.trip set status = 'COMPLETED' where trip_id = $1 returning trip_id`, [trip.trip_id])
        .then((r) => { if (r.rowCount === 0) throw new Error('no rows updated'); }),
    );
    await assert.rejects(asRole('authenticated', student, `insert into public.sos_alert (user_id, trigger_type) values ($1, 'HOLD')`, [student.id]));
    await assert.rejects(asRole('authenticated', student, `insert into public.security_staff (admin_email, full_name) values ('me@x.com', 'Me')`));
    const del = await asRole('authenticated', other, `delete from public.trusted_contact returning contact_id`);
    assert.equal(del.rowCount, 0, 'cannot delete another user contacts');
  });

  it('security staff see escalated trips and alerts, but not ordinary journeys', async () => {
    const officer = await createStaff(deps.pool);
    let res = await asRole('authenticated', officer, 'select count(*)::int as n from public.trip');
    assert.equal(res.rows[0].n, 0, 'normal journeys stay private');
    assert.equal((await asRole('authenticated', student, 'select count(*)::int as n from public.security_staff')).rows[0].n, 0);

    deps.clock.advance(480);
    await deps.watchdog.tick();
    deps.clock.advance(180);
    await deps.watchdog.tick();
    res = await asRole('authenticated', officer, 'select count(*)::int as n from public.trip');
    assert.equal(res.rows[0].n, 1);
    res = await asRole('authenticated', officer, 'select count(*)::int as n from public.location_log');
    assert.equal(res.rows[0].n, 1);
    res = await asRole('authenticated', officer, `update public.sos_alert set status = 'RECEIVED' returning alert_id`);
    assert.equal(res.rowCount, 1, 'staff may update alert status (Module 4)');
    res = await asRole('authenticated', student, `update public.sos_alert set status = 'RESOLVED' returning alert_id`);
    assert.equal(res.rowCount, 0, 'the user cannot close their own alert');
    res = await asRole('authenticated', other, 'select count(*)::int as n from public.sos_alert');
    assert.equal(res.rows[0].n, 0);
  });

  it('an unconfirmed allow-listed email is not treated as staff by RLS', async () => {
    const pretender = await createStaff(deps.pool, { confirmed: false });
    const res = await asRole('authenticated', pretender, 'select public.is_security_staff(auth.uid()) as staff');
    assert.equal(res.rows[0].staff, false);
  });
});
