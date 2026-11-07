import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, beforeEach, describe, it } from 'node:test';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { CAMPUS, buildTestContainer, createStaff, createTestDatabase, createUser } from './helpers/env.js';

let deps;
let app;
let student;
let other;
let officer;

const auth = (u) => ({ Authorization: `Bearer ${u.token}` });
const HERE = { lat: 5.3571, lng: 100.3031 };
const eventsTo = (room, event) => deps.publisher.sent.filter((e) => e.room === room && e.event === event);
const settle = () => new Promise((r) => setTimeout(r, 30)); // fire-and-forget notifications

function sos(user, body = {}) {
  return request(app)
    .post('/api/sos')
    .set(auth(user))
    .send({ trigger_type: 'HOLD', client_request_id: randomUUID(), location: HERE, accuracy_m: 9, battery_level: 40, ...body });
}
const setStatus = (alertId, status, note, by = officer) =>
  request(app).post(`/api/staff/alerts/${alertId}/status`).set(auth(by)).send({ status, ...(note ? { note } : {}) });

before(async () => {
  deps = await buildTestContainer(await createTestDatabase('sos'));
  app = createApp(deps);
  officer = await createStaff(deps.pool);
});

after(async () => deps.pool.end());

beforeEach(async () => {
  await deps.pool.query('truncate public.trip, public.trusted_contact, public.sos_alert cascade');
  deps.clock.set(new Date('2026-11-07T22:30:00+08:00'));
  deps.deliveries.length = 0;
  deps.publisher.sent.length = 0;
  student = await createUser(deps.pool, { name: 'Aina Sample' });
  other = await createUser(deps.pool, { name: 'Other Sample' });
  await request(app).post('/api/contacts').set(auth(student)).send({ contact_name: 'Ali (sample)', phone_number: '+60111111111', email: 'ali@example.com' });
});

describe('hold-to-confirm SOS', () => {
  it('stores the alert with identity, GPS and time, and alerts security and contacts', async () => {
    const res = await sos(student);
    assert.equal(res.status, 201, JSON.stringify(res.body));
    assert.equal(res.body.status, 'NEW');
    assert.equal(res.body.trigger_type, 'HOLD');
    assert.match(res.body.tracking_url, /^http:\/\/tracking\.test\/t\/[A-Za-z0-9_-]{43}$/);
    assert.equal(res.body.status_history[0].new_status, 'NEW');

    // Security dashboard gets it immediately with identity and location.
    const [event] = eventsTo('staff', 'alert:new');
    const alert = event.payload.alert;
    assert.equal(alert.trigger_type, 'HOLD');
    assert.equal(alert.user.full_name, 'Aina Sample');
    assert.equal(alert.user.phone_number, '+60123456789');
    assert.deepEqual([alert.last_location.lat, alert.last_location.lng], [HERE.lat, HERE.lng]);
    assert.equal(alert.triggered_at, deps.clock().toISOString());
    assert.equal(alert.trail.length, 1);

    await settle();
    const texts = deps.deliveries.map((d) => `${d.channel}:${d.to}`).sort();
    assert.deepEqual(texts, ['email:ali@example.com', 'sms:+60111111111']);
    assert.ok(deps.deliveries[0].text.includes(res.body.tracking_url));
    assert.ok(deps.deliveries[0].text.includes('openstreetmap.org/?mlat=5.357100'));
  });

  it('a retried request never creates a second alert', async () => {
    const id = randomUUID();
    const first = await sos(student, { client_request_id: id });
    const retry = await sos(student, { client_request_id: id });
    assert.equal(first.status, 201);
    assert.equal(retry.status, 200);
    assert.equal(retry.body.existing, true);
    assert.equal(retry.body.alert_id, first.body.alert_id);
    // A second press while one SOS is open also returns the open one.
    const again = await sos(student);
    assert.equal(again.body.alert_id, first.body.alert_id);
    // Concurrent presses: still one alert.
    await Promise.all([sos(other), sos(other), sos(other)]);
    const { rows } = await deps.pool.query('select user_id, count(*)::int as n from public.sos_alert group by user_id');
    assert.ok(rows.every((r) => r.n === 1));
    assert.equal(eventsTo('staff', 'alert:new').length, 2, 'security is alerted once per person');
  });

  it('goes through without GPS; the first location received becomes the alert location', async () => {
    const res = await sos(student, { location: undefined, accuracy_m: undefined });
    assert.equal(res.status, 201);
    await settle();
    assert.ok(deps.deliveries.some((d) => d.text.includes('had not found a GPS position yet')));
    const t = new Date(deps.clock().getTime() + 5000).toISOString();
    const up = await request(app)
      .post(`/api/sos/${res.body.alert_id}/locations`)
      .set(auth(student))
      .send({ samples: [{ lat: 5.358, lng: 100.304, recorded_at: t, accuracy_m: 12 }] });
    assert.deepEqual(up.body, { accepted: 1, duplicates: 0, rejected: 0 });
    const detail = await request(app).get(`/api/staff/alerts/${res.body.alert_id}`).set(auth(officer));
    assert.deepEqual(detail.body.alert_location, { lat: 5.358, lng: 100.304, accuracy_m: 12 });
    const live = eventsTo('staff', 'alert:position');
    assert.equal(live.at(-1).payload.lat, 5.358);
    assert.ok(eventsTo(`alert:${res.body.alert_id}`, 'alert:position').length === 1, 'the SOS link viewers get it too');
  });

  it('silent SOS is recorded as SILENT and warns contacts not to call', async () => {
    const res = await sos(student, { trigger_type: 'SILENT' });
    assert.equal(res.body.trigger_type, 'SILENT');
    await settle();
    assert.ok(deps.deliveries.every((d) => d.text.includes('a silent SOS') && d.text.includes('do not call')));
  });

  it('an SOS during a journey is linked to the journey', async () => {
    const c = (await request(app).get('/api/contacts').set(auth(student))).body[0];
    const trip = (await request(app).post('/api/trips').set(auth(student)).send({ ...CAMPUS, contact_ids: [c.contact_id] })).body;
    const res = await sos(student);
    assert.equal(res.body.trip_id, trip.trip_id);
    const view = await request(app).get(`/api/track/${trip.tracking_url.split('/t/')[1]}`);
    assert.equal(view.body.sos.status, 'NEW', 'the journey link shows the SOS too');
  });

  it('rejects malformed requests and other users', async () => {
    assert.equal((await sos(student, { trigger_type: 'ETA' })).status, 400);
    assert.equal((await sos(student, { client_request_id: 'not-a-uuid' })).status, 400);
    const mine = await sos(student);
    const res = await request(app)
      .post(`/api/sos/${mine.body.alert_id}/locations`)
      .set(auth(other))
      .send({ samples: [{ lat: 5.3, lng: 100.3, recorded_at: deps.clock().toISOString() }] });
    assert.equal(res.status, 404);
    assert.equal((await request(app).post(`/api/sos/${mine.body.alert_id}/safe`).set(auth(other))).status, 404);
    assert.equal((await request(app).post('/api/sos').send({})).status, 401);
  });
});

describe('SOS live link for trusted contacts', () => {
  it('shows the live position without private details and expires 30 minutes after the SOS ends', async () => {
    const res = await sos(student);
    const token = res.body.tracking_url.split('/t/')[1];
    const view = await request(app).get(`/api/track/${token}`);
    assert.equal(view.status, 200);
    assert.equal(view.body.kind, 'SOS');
    assert.equal(view.body.traveller_name, 'Aina Sample');
    assert.equal(view.body.last_location.lat, HERE.lat);
    const text = JSON.stringify(view.body);
    for (const secret of ['+60123456789', 'student.usm.my', '23300000', 'ali@example.com', token]) {
      assert.ok(!text.includes(secret), `must not contain ${secret}`);
    }
    await setStatus(res.body.alert_id, 'RESOLVED');
    deps.clock.advance(29 * 60);
    assert.equal((await request(app).get(`/api/track/${token}`)).body.status, 'RESOLVED');
    deps.clock.advance(61);
    assert.equal((await request(app).get(`/api/track/${token}`)).status, 410);
  });
});

describe('security response workflow', () => {
  it('moves forward through Received, On the way, Arrived, Resolved with a timeline', async () => {
    const res = await sos(student);
    const id = res.body.alert_id;

    const received = await setStatus(id, 'RECEIVED');
    assert.equal(received.status, 200);
    assert.equal(received.body.status, 'RECEIVED');

    // The person sees it live, and on their phone.
    const userEvents = eventsTo(`user:${student.id}`, 'alert:status');
    assert.equal(userEvents.at(-1).payload.status, 'RECEIVED');
    assert.equal(userEvents.at(-1).payload.latest.staff_name, 'Test Officer');

    deps.clock.advance(60);
    await setStatus(id, 'ON_THE_WAY', 'Patrol unit 2 dispatched');
    assert.equal((await setStatus(id, 'RECEIVED')).status, 409, 'cannot go backwards');
    assert.equal((await setStatus(id, 'ON_THE_WAY')).status, 409, 'cannot repeat');
    await setStatus(id, 'ARRIVED');
    const resolved = await setStatus(id, 'RESOLVED', 'Student escorted to hostel');
    assert.ok(resolved.body.resolved_at);
    assert.deepEqual(
      resolved.body.status_history.map((h) => [h.new_status, h.note]),
      [['NEW', null], ['RECEIVED', null], ['ON_THE_WAY', 'Patrol unit 2 dispatched'], ['ARRIVED', null], ['RESOLVED', 'Student escorted to hostel']],
    );
    const mine = await request(app).get(`/api/sos/${id}`).set(auth(student));
    assert.equal(mine.body.status_history.at(2).staff_name, 'Test Officer');
    assert.equal((await request(app).get('/api/sos/active').set(auth(student))).body.alert, null);
  });

  it('staff may skip straight to Resolved (false alarm); students cannot change status', async () => {
    const id = (await sos(student)).body.alert_id;
    assert.equal((await setStatus(id, 'RESOLVED', null, student)).status, 403);
    assert.equal((await setStatus(id, 'NEW')).status, 400);
    assert.equal((await setStatus(id, 'RESOLVED', 'False alarm, pocket press')).body.status, 'RESOLVED');
  });

  it('resolving an overdue-journey alert also closes the escalated journey', async () => {
    const c = (await request(app).get('/api/contacts').set(auth(student))).body[0];
    const trip = (await request(app).post('/api/trips').set(auth(student)).send({ ...CAMPUS, contact_ids: [c.contact_id] })).body;
    deps.clock.advance(480);
    await deps.watchdog.tick();
    deps.clock.advance(180);
    await deps.watchdog.tick();
    const { rows } = await deps.pool.query(`select alert_id from public.sos_alert where trigger_type = 'ETA'`);
    await setStatus(rows[0].alert_id, 'RESOLVED', 'Found safe at library');
    const after = await request(app).get(`/api/trips/${trip.trip_id}`).set(auth(student));
    assert.equal(after.body.status, 'COMPLETED');
    assert.equal(after.body.end_reason, 'RESOLVED_BY_SECURITY');
    assert.ok(eventsTo(`trip:${trip.trip_id}`, 'alert:status').length > 0, 'contacts on the journey link see it');
  });
});

describe('user marks themselves safe', () => {
  it('stops sharing, tells contacts and security, keeps the alert open for security', async () => {
    const id = (await sos(student)).body.alert_id;
    deps.deliveries.length = 0;
    const res = await request(app).post(`/api/sos/${id}/safe`).set(auth(student));
    assert.equal(res.status, 200);
    assert.ok(res.body.user_safe_at);
    assert.equal(res.body.status, 'NEW');
    await settle();
    assert.ok(deps.deliveries.some((d) => d.subject.includes('is safe')));
    assert.ok(eventsTo('staff', 'alert:status').at(-1).payload.user_safe_at);

    const late = await request(app)
      .post(`/api/sos/${id}/locations`)
      .set(auth(student))
      .send({ samples: [{ lat: 5.3, lng: 100.3, recorded_at: deps.clock().toISOString() }] });
    assert.equal(late.status, 409);
    // A new emergency later creates a new alert.
    const next = await sos(student);
    assert.equal(next.status, 201);
    assert.notEqual(next.body.alert_id, id);
  });
});

describe('row level security for SOS data', () => {
  async function asUser(user, sql) {
    const client = await deps.pool.connect();
    try {
      await client.query('begin');
      await client.query('set local role authenticated');
      await client.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: user.id, email: user.email })]);
      return (await client.query(sql)).rows;
    } finally {
      await client.query('rollback');
      client.release();
    }
  }

  it('SOS location history is visible to its owner and security only', async () => {
    await sos(student);
    assert.equal((await asUser(student, 'select count(*)::int as n from public.location_log'))[0].n, 1);
    assert.equal((await asUser(other, 'select count(*)::int as n from public.location_log'))[0].n, 0);
    assert.equal((await asUser(other, 'select count(*)::int as n from public.sos_alert'))[0].n, 0);
    assert.equal((await asUser(officer, 'select count(*)::int as n from public.location_log'))[0].n, 1);
    assert.equal((await asUser(student, 'select count(*)::int as n from public.safe_point'))[0].n, 21);
  });
});
