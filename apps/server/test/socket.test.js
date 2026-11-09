import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { after, before, describe, it } from 'node:test';
import { io as connect } from 'socket.io-client';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { attachSocketServer } from '../src/realtime/socketServer.js';
import { CAMPUS, buildTestContainer, createStaff, createTestDatabase, createUser, signToken } from './helpers/env.js';

let deps;
let server;
let baseUrl;
let student;
let officer;
let trip;
const sockets = [];

const open = (auth) =>
  new Promise((resolve, reject) => {
    const s = connect(baseUrl, { auth, transports: ['websocket'], reconnection: false });
    sockets.push(s);
    s.once('connect', () => resolve(s));
    s.once('connect_error', (err) => reject(err));
  });
const next = (socket, event, ms = 2000) =>
  new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`timeout waiting for ${event}`)), ms);
    socket.once(event, (p) => {
      clearTimeout(t);
      resolve(p);
    });
  });
const silent = (socket, event, ms = 300) =>
  new Promise((resolve, reject) => {
    const handler = () => reject(new Error(`unexpected ${event}`));
    socket.once(event, handler);
    setTimeout(() => {
      socket.off(event, handler);
      resolve();
    }, ms);
  });

before(async () => {
  deps = await buildTestContainer(await createTestDatabase('socket'));
  deps.clock.set(new Date()); // sockets use real timers; keep the server clock near real time
  const app = createApp(deps);
  server = createServer(app);
  attachSocketServer(server, deps);
  await new Promise((r) => server.listen(0, r));
  baseUrl = `http://localhost:${server.address().port}`;

  student = await createUser(deps.pool, { name: 'Aina Sample' });
  officer = await createStaff(deps.pool);
  const c = (await request(app).post('/api/contacts').set({ Authorization: `Bearer ${student.token}` }).send({ contact_name: 'Ali', email: 'a@example.com' })).body;
  trip = (await request(app).post('/api/trips').set({ Authorization: `Bearer ${student.token}` }).send({ ...CAMPUS, contact_ids: [c.contact_id] })).body;
});

after(async () => {
  sockets.forEach((s) => s.close());
  await new Promise((r) => server.close(r));
  await deps.pool.end();
});

describe('Socket.io real-time channel', () => {
  it('rejects connections without credentials or with a bad tracking token', async () => {
    await assert.rejects(open({}), /UNAUTHORIZED/);
    await assert.rejects(open({ shareToken: 'A'.repeat(43) }), /NOT_FOUND/);
    await assert.rejects(open({ token: 'garbage' }), /UNAUTHORIZED/);
  });

  it('streams the owner GPS to the trusted contact page, not to staff while the trip is normal', async () => {
    const viewer = await open({ shareToken: trip.tracking_url.split('/t/')[1] });
    const staff = await open({ token: officer.token });
    const phone = await open({ token: student.token });

    const received = next(viewer, 'trip:position');
    const staffQuiet = silent(staff, 'alert:position');
    const ack = await phone.emitWithAck('trip:location', {
      trip_id: trip.trip_id,
      sample: { lat: 5.3571, lng: 100.3031, recorded_at: new Date().toISOString(), battery_level: 77 },
    });
    assert.deepEqual(ack, { ok: true, accepted: 1, duplicates: 0, rejected: 0 });
    const position = await received;
    assert.equal(position.lat, 5.3571);
    assert.ok(position.event_id, 'events carry an id for de-duplication');
    await staffQuiet;
  });

  it('other users cannot stream into someone else trip', async () => {
    const intruder = await createUser(deps.pool);
    const s = await open({ token: intruder.token });
    const ack = await s.emitWithAck('trip:location', {
      trip_id: trip.trip_id,
      sample: { lat: 5.3, lng: 100.3, recorded_at: new Date().toISOString() },
    });
    assert.deepEqual(ack, { ok: false, error: 'NOT_FOUND' });
    const bad = await s.emitWithAck('trip:location', { trip_id: 'nope', sample: {} });
    assert.deepEqual(bad, { ok: false, error: 'BAD_REQUEST' });
  });

  it('pushes the overdue escalation to the security dashboard and the tracking page', async () => {
    const viewer = await open({ shareToken: trip.tracking_url.split('/t/')[1] });
    const staff = await open({ token: officer.token });
    const phone = await open({ token: student.token });

    const graced = next(phone, 'trip:grace_prompt');
    deps.clock.advance(480);
    await deps.watchdog.tick();
    assert.equal((await graced).trip_id, trip.trip_id);

    const alarm = next(staff, 'alert:new');
    const viewerStatus = new Promise((resolve) => {
      viewer.on('trip:status', (p) => p.status === 'ESCALATED' && resolve(p));
    });
    deps.clock.advance(180);
    await deps.watchdog.tick();
    const { alert } = await alarm;
    assert.equal(alert.trigger_type, 'ETA');
    assert.equal(alert.user.full_name, 'Aina Sample');
    await viewerStatus;

    // After escalation, live positions also reach security.
    const live = next(staff, 'alert:position');
    await phone.emitWithAck('trip:location', {
      trip_id: trip.trip_id,
      sample: { lat: 5.358, lng: 100.304, recorded_at: deps.clock().toISOString() },
    });
    assert.equal((await live).lat, 5.358);
  });

  it('streams SOS positions to security and the SOS link, and status updates to the phone', async () => {
    const sosUser = await createUser(deps.pool, { name: 'SOS Sample' });
    const res = await fetch(`${baseUrl}/api/sos`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${sosUser.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ trigger_type: 'SILENT', client_request_id: crypto.randomUUID() }),
    });
    const alert = await res.json();
    assert.equal(res.status, 201);

    const viewer = await open({ shareToken: alert.tracking_url.split('/t/')[1] });
    const staff = await open({ token: officer.token });
    const phone = await open({ token: sosUser.token });

    const toStaff = next(staff, 'alert:position');
    const toViewer = next(viewer, 'alert:position');
    const ack = await phone.emitWithAck('sos:location', {
      alert_id: alert.alert_id,
      sample: { lat: 5.3577, lng: 100.3033, recorded_at: deps.clock().toISOString(), battery_level: 31 },
    });
    assert.deepEqual(ack, { ok: true, accepted: 1, duplicates: 0, rejected: 0 });
    assert.equal((await toStaff).alert_id, alert.alert_id);
    assert.equal((await toViewer).lat, 5.3577);

    // Someone else cannot stream into this SOS.
    const intruder = await open({ token: student.token });
    const denied = await intruder.emitWithAck('sos:location', {
      alert_id: alert.alert_id,
      sample: { lat: 5.3, lng: 100.3, recorded_at: deps.clock().toISOString() },
    });
    assert.deepEqual(denied, { ok: false, error: 'NOT_FOUND' });

    const update = next(phone, 'alert:status');
    await fetch(`${baseUrl}/api/staff/alerts/${alert.alert_id}/status`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${officer.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'ON_THE_WAY' }),
    });
    const status = await update;
    assert.equal(status.status, 'ON_THE_WAY');
    assert.equal(status.latest.staff_name, 'Test Officer');
  });

  it('delivers incident reports to security, status to the reporter and map updates to every app user', async () => {
    const app = createApp(deps);
    const viewer = await createUser(deps.pool, { name: 'Viewer Sample' });
    const staffSocket = await open({ token: officer.token });
    const reporterSocket = await open({ token: student.token });
    const viewerSocket = await open({ token: viewer.token });

    const fresh = next(staffSocket, 'incident:new');
    const report = await request(app)
      .post('/api/incidents')
      .set({ Authorization: `Bearer ${student.token}` })
      .send({ category: 'BROKEN_LIGHTING', severity_level: 'LOW', description: 'Light out', location: CAMPUS.destination });
    assert.equal(report.status, 201, JSON.stringify(report.body));
    assert.equal((await fresh).incident.group_id, report.body.group_id);
    await silent(viewerSocket, 'incident:map'); // pending reports are not on the map

    const status = next(reporterSocket, 'incident:status');
    const map = next(viewerSocket, 'incident:map');
    await request(app).post(`/api/staff/incidents/${report.body.group_id}/verify`).set({ Authorization: `Bearer ${officer.token}` }).send({});
    assert.deepEqual(
      { report: (await status).report_id, state: (await status).status },
      { report: report.body.report_id, state: 'VERIFIED' },
    );
    assert.equal((await map).group_id, report.body.group_id);
  });

  it('disconnects a socket when its session token expires', async () => {
    const shortLived = await signToken({ sub: student.id, email: student.email, expiresInSeconds: 1 });
    const s = await open({ token: shortLived });
    await next(s, 'auth:expired', 2500);
  });
});
