import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { CAMPUS, buildTestContainer, createStaff, createTestDatabase, createUser } from './helpers/env.js';

let deps;
let app;
let student;
let trip;

const auth = (u) => ({ Authorization: `Bearer ${u.token}` });
const eventsTo = (room, event) => deps.publisher.sent.filter((e) => e.room === room && e.event === event);
const tripRow = async () => (await deps.pool.query('select * from public.trip where trip_id = $1', [trip.trip_id])).rows[0];

before(async () => {
  const url = await createTestDatabase('watchdog');
  deps = await buildTestContainer(url);
  app = createApp(deps);
});

after(async () => deps.pool.end());

beforeEach(async () => {
  await deps.pool.query('truncate public.trip, public.trusted_contact, public.sos_alert cascade');
  deps.clock.set('2026-11-06T22:00:00Z');
  student = await createUser(deps.pool, { name: 'Aina Sample' });
  await deps.pool.query(`update public.app_user set device_fcm_token = 'fcm-test-token' where user_id = $1`, [student.id]);
  const contacts = [];
  for (const body of [
    { contact_name: 'Ali (sample)', phone_number: '+60111111111', email: 'ali@example.com' },
    { contact_name: 'Mei (sample)', telegram_chat_id: '987654' },
  ]) {
    contacts.push((await request(app).post('/api/contacts').set(auth(student)).send(body)).body.contact_id);
  }
  trip = (await request(app).post('/api/trips').set(auth(student)).send({ ...CAMPUS, destination_label: 'Sample hostel', contact_ids: contacts })).body;
  deps.deliveries.length = 0;
  deps.publisher.sent.length = 0;
});

// Keep the device "alive" so heartbeat-loss detection does not interfere.
async function heartbeat(lat = 5.3575, lng = 100.3035) {
  const res = await request(app)
    .post(`/api/trips/${trip.trip_id}/locations`)
    .set(auth(student))
    .send({ samples: [{ lat, lng, recorded_at: deps.clock().toISOString(), is_heartbeat: true, battery_level: 41 }] });
  assert.equal(res.status, 200, JSON.stringify(res.body));
}

describe('server-side ETA watchdog', () => {
  it('does nothing before the ETA', async () => {
    deps.clock.advance(479);
    await heartbeat();
    assert.deepEqual(await deps.watchdog.tick(), { graced: 0, escalated: 0, signalLost: 0 });
    assert.equal((await tripRow()).status, 'ACTIVE');
  });

  it('Stage 1: when the ETA expires it opens a 3-minute grace period and prompts the user', async () => {
    deps.clock.advance(480); // OSRM duration 480 s
    await heartbeat();
    const result = await deps.watchdog.tick();
    assert.equal(result.graced, 1);
    const row = await tripRow();
    assert.equal(row.status, 'GRACE_PROMPT');
    assert.equal(row.grace_expires_at - deps.clock(), 180_000);

    assert.equal(eventsTo(`user:${student.id}`, 'trip:grace_prompt').length, 1);
    assert.equal(eventsTo(`trip:${trip.trip_id}`, 'trip:status')[0].payload.status, 'GRACE_PROMPT');
    const push = deps.deliveries.filter((d) => d.channel === 'push');
    assert.equal(push.length, 1);
    assert.equal(push[0].to, 'fcm-test-token');
    // Contacts are NOT alerted at Stage 1.
    assert.equal(deps.deliveries.filter((d) => d.channel !== 'push').length, 0);
  });

  it('the user can extend during the grace period, which returns the trip to ACTIVE', async () => {
    deps.clock.advance(480);
    await deps.watchdog.tick();
    deps.clock.advance(60);
    const res = await request(app).post(`/api/trips/${trip.trip_id}/extend`).set(auth(student)).send({ minutes: 5 });
    assert.equal(res.body.status, 'ACTIVE');
    deps.clock.advance(200); // past the original grace deadline
    await heartbeat();
    const result = await deps.watchdog.tick();
    assert.equal(result.escalated, 0);
    assert.equal((await tripRow()).status, 'ACTIVE');
  });

  it('confirming safety during the grace period ends the trip without an alert', async () => {
    deps.clock.advance(480);
    await deps.watchdog.tick();
    const res = await request(app).post(`/api/trips/${trip.trip_id}/confirm-safe`).set(auth(student));
    assert.equal(res.body.status, 'COMPLETED');
    deps.clock.advance(400);
    assert.equal((await deps.watchdog.tick()).escalated, 0);
    assert.equal((await deps.pool.query('select count(*)::int as n from public.sos_alert')).rows[0].n, 0);
  });

  it('Stage 2: no response within the grace period escalates to security and trusted contacts', async () => {
    deps.clock.advance(120);
    await heartbeat(5.3570, 100.3030);
    deps.clock.advance(360);
    await heartbeat(5.3578, 100.3038); // last known position
    await deps.watchdog.tick(); // -> GRACE_PROMPT
    deps.clock.advance(179);
    assert.equal((await deps.watchdog.tick()).escalated, 0, 'not before 3 minutes');
    deps.clock.advance(1);
    assert.equal((await deps.watchdog.tick()).escalated, 1);

    const row = await tripRow();
    assert.equal(row.status, 'ESCALATED');
    assert.ok(row.escalated_at);

    // One ETA alert at the last known GPS position, with a status-log entry.
    const { rows: alerts } = await deps.pool.query(
      `select alert_id, trigger_type, status, user_id, st_y(alert_location::geometry) as lat, st_x(alert_location::geometry) as lng
         from public.sos_alert where trip_id = $1`,
      [trip.trip_id],
    );
    assert.equal(alerts.length, 1);
    assert.equal(alerts[0].trigger_type, 'ETA');
    assert.equal(alerts[0].status, 'NEW');
    assert.equal(alerts[0].user_id, student.id);
    assert.deepEqual([alerts[0].lat, alerts[0].lng], [5.3578, 100.3038]);
    const log = await deps.pool.query('select new_status, staff_id from public.alert_status_log where alert_id = $1', [alerts[0].alert_id]);
    assert.deepEqual(log.rows, [{ new_status: 'NEW', staff_id: null }]);

    // Security dashboard receives the alert with identity, route history and last location.
    const [dashboard] = eventsTo('staff', 'alert:new');
    const alert = dashboard.payload.alert;
    assert.equal(alert.trigger_type, 'ETA');
    assert.equal(alert.user.full_name, 'Aina Sample');
    assert.equal(alert.user.phone_number, '+60123456789');
    assert.equal(alert.trip.trail.length, 3, 'origin + two samples');
    assert.equal(alert.trip.last_location.lat, 5.3578);
    assert.equal(alert.trip.route_geometry.type, 'LineString');

    // Trusted contacts are alerted on every channel they have, in parallel.
    const contactMsgs = deps.deliveries.filter((d) => d.channel !== 'push');
    assert.deepEqual(contactMsgs.map((d) => `${d.channel}:${d.to}`).sort(), [
      'email:ali@example.com', 'sms:+60111111111', 'telegram:987654',
    ]);
    for (const m of contactMsgs) {
      assert.ok(m.text.includes('openstreetmap.org/?mlat=5.357800'), 'includes last known location');
      assert.ok(m.text.includes(trip.tracking_url), 'includes the live route link');
    }
    // The tracking page is told too.
    assert.ok(eventsTo(`trip:${trip.trip_id}`, 'trip:status').some((e) => e.payload.status === 'ESCALATED'));
  });

  it('escalates even when the phone went silent (dead battery), using the last known position', async () => {
    deps.clock.advance(30);
    await heartbeat(5.3566, 100.3027);
    // Phone dies. No more requests from the device.
    deps.clock.advance(450);
    await deps.watchdog.tick();
    deps.clock.advance(180);
    const result = await deps.watchdog.tick();
    assert.equal(result.escalated, 1);
    const { rows } = await deps.pool.query('select st_y(alert_location::geometry) as lat from public.sos_alert');
    assert.equal(rows[0].lat, 5.3566);
    assert.ok((await tripRow()).signal_lost_at, 'heartbeat loss was detected along the way');
  });

  it('never escalates the same trip twice, even with concurrent ticks', async () => {
    deps.clock.advance(480);
    await deps.watchdog.tick();
    deps.clock.advance(180);
    const second = await buildTestContainer(deps.config.DATABASE_URL, { clock: deps.clock });
    const results = await Promise.all([deps.watchdog.tick(), second.watchdog.tick()]);
    assert.equal(results.reduce((n, r) => n + r.escalated, 0), 1);
    assert.equal((await deps.watchdog.tick()).escalated, 0);
    assert.equal((await deps.pool.query('select count(*)::int as n from public.sos_alert')).rows[0].n, 1);
    await second.pool.end();
  });

  it('after escalation the user can confirm safety; contacts are told and the alert stays for security', async () => {
    deps.clock.advance(480);
    await deps.watchdog.tick();
    deps.clock.advance(180);
    await deps.watchdog.tick();
    deps.deliveries.length = 0;
    assert.equal((await request(app).post(`/api/trips/${trip.trip_id}/cancel`).set(auth(student))).status, 409);
    const res = await request(app).post(`/api/trips/${trip.trip_id}/confirm-safe`).set(auth(student));
    assert.equal(res.body.status, 'COMPLETED');
    assert.equal(res.body.end_reason, 'SAFE_CONFIRMED');
    await new Promise((r) => setTimeout(r, 20)); // notification is fire-and-forget
    assert.ok(deps.deliveries.some((d) => d.subject.includes('confirmed they are safe')));
    assert.ok(eventsTo('staff', 'trip:status').some((e) => e.payload.status === 'COMPLETED'));
    const { rows } = await deps.pool.query('select status from public.sos_alert');
    assert.equal(rows[0].status, 'NEW', 'security still has to close the alert (Module 4)');
  });

  it('flags lost heartbeats and clears the flag when the device reconnects', async () => {
    deps.clock.advance(61);
    assert.equal((await deps.watchdog.tick()).signalLost, 1);
    assert.equal(eventsTo(`trip:${trip.trip_id}`, 'trip:signal')[0].payload.signal_lost, true);
    assert.equal((await deps.watchdog.tick()).signalLost, 0, 'reported once');
    await heartbeat();
    assert.equal((await tripRow()).signal_lost_at, null);
    assert.equal(eventsTo(`trip:${trip.trip_id}`, 'trip:signal').at(-1).payload.signal_lost, false);
  });

  it('the staff alert list and detail return the escalation for security only', async () => {
    deps.clock.advance(480);
    await deps.watchdog.tick();
    deps.clock.advance(180);
    await deps.watchdog.tick();
    const officer = await createStaff(deps.pool);
    const list = await request(app).get('/api/staff/alerts').set(auth(officer));
    assert.equal(list.body.alerts.length, 1);
    const detail = await request(app).get(`/api/staff/alerts/${list.body.alerts[0].alert_id}`).set(auth(officer));
    assert.equal(detail.body.trip.trail.length, 1);
    assert.equal((await request(app).get('/api/staff/alerts').set(auth(student))).status, 403);
  });
});
