import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';
import request from 'supertest';
import { SOCKET_EVENTS as E } from '@safewalk/shared';
import { createApp } from '../src/app.js';
import { rooms } from '../src/realtime/publisher.js';
import { buildTestContainer, createStaff, createTestDatabase, createUser } from './helpers/env.js';

let deps;
let app;
let officer;
let student;
let withPhone;
let otherPhone;

const auth = (u) => ({ Authorization: `Bearer ${u.token}` });
const sent = (event, room) => deps.publisher.sent.filter((s) => s.event === event && (!room || s.room === room));
const publish = (body, by = officer) =>
  request(app)
    .post('/api/staff/announcements')
    .set(auth(by))
    .send({ title: 'Path closed near the sample hall', message_body: 'Use the main road after 10 pm (sample).', ...body });
const live = (user = student) => request(app).get('/api/announcements').set(auth(user));
const NOW = Date.parse('2026-11-11T20:00:00+08:00');
const later = (minutes) => new Date(NOW + minutes * 60_000).toISOString();

before(async () => {
  deps = await buildTestContainer(await createTestDatabase('announcements'));
  app = createApp(deps);
  officer = await createStaff(deps.pool);
  student = await createUser(deps.pool, { name: 'Aina Sample' });
  withPhone = await createUser(deps.pool, { name: 'Wei Sample' });
  otherPhone = await createUser(deps.pool, { name: 'Siti Sample' });
  await request(app).patch('/api/me').set(auth(withPhone)).send({ device_fcm_token: 'fcm-token-wei' });
  await request(app).patch('/api/me').set(auth(otherPhone)).send({ device_fcm_token: 'fcm-token-siti' });
});
after(async () => deps.pool.end());
beforeEach(async () => {
  await deps.pool.query('truncate public.announcement');
  deps.clock.set(NOW);
  deps.publisher.sent.length = 0;
  deps.deliveries.length = 0;
});

describe('publishing', () => {
  it('a published announcement is live for every app user at once, with no staff names', async () => {
    const res = await publish({ priority: 'ADVISORY' });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    assert.equal(res.body.state, 'LIVE');
    assert.equal(res.body.staff_name, 'Test Officer');
    assert.ok(res.body.announced_at);

    const list = await live();
    assert.equal(list.status, 200);
    assert.equal(list.body.announcements.length, 1);
    const [a] = list.body.announcements;
    assert.equal(a.title, 'Path closed near the sample hall');
    assert.equal(a.priority, 'ADVISORY');
    assert.equal(a.staff_name, undefined);
    assert.equal((await request(app).get(`/api/announcements/${a.announce_id}`).set(auth(student))).status, 200);

    // Apps and the dashboard are told; only URGENT ones are pushed.
    assert.equal(sent(E.ANNOUNCEMENT_LIVE, rooms.appUsers).length, 1);
    assert.equal(sent(E.ANNOUNCEMENT_LIVE, rooms.staff).length, 1);
    assert.equal(deps.deliveries.length, 0);
  });

  it('an URGENT announcement is pushed once to every phone that registered for notifications', async () => {
    const res = await publish({ priority: 'URGENT', title: 'Avoid the sample car park now' });
    assert.equal(res.status, 201);
    const pushes = deps.deliveries.filter((d) => d.channel === 'push');
    assert.deepEqual(pushes.map((d) => d.to).sort(), ['fcm-token-siti', 'fcm-token-wei']);
    assert.equal(pushes[0].subject, 'USM Security: Avoid the sample car park now');
    assert.deepEqual(res.body.push_summary, { recipients: 2, sent: 2, failed: 0, skipped: 0 });

    // Later ticks never push it again.
    await deps.announcementService.announceDue();
    assert.equal(deps.deliveries.length, 2);
  });

  it('urgent ones are listed first, then newest first', async () => {
    await publish({ title: 'Older info' });
    deps.clock.set(NOW + 60_000);
    await publish({ title: 'Urgent one', priority: 'URGENT' });
    deps.clock.set(NOW + 120_000);
    await publish({ title: 'Newest info' });
    const titles = (await live()).body.announcements.map((a) => a.title);
    assert.deepEqual(titles, ['Urgent one', 'Newest info', 'Older info']);
  });
});

describe('scheduling and expiry', () => {
  it('a scheduled announcement stays hidden until its time, then goes live exactly once', async () => {
    const res = await publish({ published_at: later(60), priority: 'URGENT' });
    assert.equal(res.body.state, 'SCHEDULED');
    assert.equal(res.body.announced_at, null);
    assert.equal((await live()).body.announcements.length, 0);
    assert.equal((await request(app).get(`/api/announcements/${res.body.announce_id}`).set(auth(student))).status, 404);
    assert.equal(deps.deliveries.length, 0);

    deps.clock.set(NOW + 61 * 60_000);
    assert.equal(await deps.announcementService.announceDue(), 1);
    assert.equal(await deps.announcementService.announceDue(), 0);
    assert.equal((await live()).body.announcements.length, 1);
    assert.equal(sent(E.ANNOUNCEMENT_LIVE, rooms.appUsers).length, 1);
    assert.equal(deps.deliveries.length, 2);
  });

  it('disappears after its end time; staff still see it as expired', async () => {
    const res = await publish({ expires_at: later(30) });
    deps.clock.set(NOW + 31 * 60_000);
    assert.equal((await live()).body.announcements.length, 0);
    const staff = await request(app).get('/api/staff/announcements').set(auth(officer));
    assert.equal(staff.body.announcements.find((a) => a.announce_id === res.body.announce_id).state, 'EXPIRED');
    const expired = await request(app).get('/api/staff/announcements?state=EXPIRED').set(auth(officer));
    assert.equal(expired.body.announcements.length, 1);
  });

  it('refuses an end time before the start or in the past', async () => {
    assert.equal((await publish({ published_at: later(60), expires_at: later(30) })).status, 400);
    assert.equal((await publish({ expires_at: later(-5) })).status, 400);
  });
});

describe('editing and withdrawing', () => {
  it('edits a live announcement and tells the apps; raising it to URGENT pushes it once', async () => {
    const res = await publish({});
    const id = res.body.announce_id;
    const edit = await request(app).patch(`/api/staff/announcements/${id}`).set(auth(officer)).send({ message_body: 'Updated (sample).', priority: 'URGENT' });
    assert.equal(edit.status, 200, JSON.stringify(edit.body));
    assert.equal(edit.body.message_body, 'Updated (sample).');
    assert.equal(sent(E.ANNOUNCEMENT_UPDATED, rooms.appUsers).length, 1);
    assert.equal(deps.deliveries.length, 2);

    await request(app).patch(`/api/staff/announcements/${id}`).set(auth(officer)).send({ title: 'Edited again (sample)' });
    assert.equal(deps.deliveries.length, 2, 'not pushed a second time');

    // A live announcement already went out: its start time cannot move.
    const move = await request(app).patch(`/api/staff/announcements/${id}`).set(auth(officer)).send({ published_at: later(10) });
    assert.equal(move.status, 409);
  });

  it('a scheduled announcement can be moved', async () => {
    const res = await publish({ published_at: later(60) });
    const move = await request(app).patch(`/api/staff/announcements/${res.body.announce_id}`).set(auth(officer)).send({ published_at: later(120) });
    assert.equal(move.status, 200);
    assert.equal(move.body.published_at, later(120));
  });

  it('withdrawing hides it everywhere and records who did it', async () => {
    const res = await publish({});
    const id = res.body.announce_id;
    const w = await request(app).post(`/api/staff/announcements/${id}/withdraw`).set(auth(officer));
    assert.equal(w.status, 200);
    assert.equal(w.body.state, 'WITHDRAWN');
    assert.equal(w.body.withdrawn_by_name, 'Test Officer');
    assert.equal((await live()).body.announcements.length, 0);
    const update = sent(E.ANNOUNCEMENT_UPDATED, rooms.appUsers);
    assert.equal(update.at(-1).payload.state, 'WITHDRAWN');

    assert.equal((await request(app).post(`/api/staff/announcements/${id}/withdraw`).set(auth(officer))).status, 409);
    assert.equal((await request(app).patch(`/api/staff/announcements/${id}`).set(auth(officer)).send({ title: 'Too late' })).status, 409);
  });

  it('a withdrawn scheduled announcement never goes live', async () => {
    const res = await publish({ published_at: later(5), priority: 'URGENT' });
    await request(app).post(`/api/staff/announcements/${res.body.announce_id}/withdraw`).set(auth(officer));
    deps.clock.set(NOW + 10 * 60_000);
    assert.equal(await deps.announcementService.announceDue(), 0);
    assert.equal(deps.deliveries.length, 0);
    assert.equal(sent(E.ANNOUNCEMENT_UPDATED).length, 0, 'apps never saw it, so nothing to retract');
  });
});

describe('access control', () => {
  it('only security staff can publish, edit, withdraw or see drafts', async () => {
    assert.equal((await publish({}, student)).status, 403);
    assert.equal((await request(app).get('/api/staff/announcements').set(auth(student))).status, 403);
    const res = await publish({});
    assert.equal((await request(app).post(`/api/staff/announcements/${res.body.announce_id}/withdraw`).set(auth(student))).status, 403);
    assert.equal((await request(app).get('/api/announcements')).status, 401);
  });

  it('validates the input', async () => {
    assert.equal((await publish({ title: 'Hi' })).status, 400);
    assert.equal((await publish({ message_body: '   ' })).status, 400);
    assert.equal((await publish({ priority: 'PANIC' })).status, 400);
    assert.equal((await publish({ staff_id: officer.id })).status, 400, 'unknown fields refused');
  });

  it('row level security: users read live announcements only, staff read all, users cannot write', async () => {
    // RLS compares with the database clock, so these rows use real time.
    const { rows: s } = await deps.pool.query('select staff_id from public.security_staff limit 1');
    await deps.pool.query(
      `insert into public.announcement (staff_id, title, message_body, published_at, expires_at, withdrawn_at) values
         ($1, 'Live (sample)', 'x', now() - interval '1 hour', null, null),
         ($1, 'Scheduled (sample)', 'x', now() + interval '1 hour', null, null),
         ($1, 'Expired (sample)', 'x', now() - interval '2 hours', now() - interval '1 hour', null),
         ($1, 'Withdrawn (sample)', 'x', now() - interval '1 hour', null, now())`,
      [s[0].staff_id],
    );
    async function asUser(user, sql) {
      const client = await deps.pool.connect();
      try {
        await client.query('begin');
        await client.query('set local role authenticated');
        await client.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: user.id, email: user.email, role: 'authenticated' })]);
        return (await client.query(sql)).rows;
      } catch (err) {
        return err;
      } finally {
        await client.query('rollback');
        client.release();
      }
    }
    const seen = await asUser(student, 'select title from public.announcement order by title');
    assert.deepEqual(seen.map((r) => r.title), ['Live (sample)']);
    assert.equal((await asUser(officer, 'select count(*)::int as n from public.announcement'))[0].n, 4);
    const write = await asUser(student, `insert into public.announcement (title, message_body) values ('Fake (sample)', 'x')`);
    assert.ok(write instanceof Error, 'students cannot insert');
  });
});
