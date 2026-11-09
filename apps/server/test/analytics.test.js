import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, it } from 'node:test';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { durationStats } from '../src/modules/analytics/analyticsService.js';
import { CAMPUS, buildTestContainer, createStaff, createTestDatabase, createUser } from './helpers/env.js';

// TEST FIXTURE DATA ONLY. Positions are offsets in metres from one point.
const BASE = { lat: 5.3561, lng: 100.3021 };
const at = (northM, eastM = 0) => ({
  lat: BASE.lat + northM / 111_320,
  lng: BASE.lng + eastM / (111_320 * Math.cos((BASE.lat * Math.PI) / 180)),
});

let deps;
let app;
let officer;
const students = [];
const auth = (u) => ({ Authorization: `Bearer ${u.token}` });
// "Now" for the analytics: Wednesday 11 Nov 2026, 23:00 Malaysia time.
const NOW = Date.parse('2026-11-11T23:00:00+08:00');
const set = (msBeforeNow) => deps.clock.set(NOW - msBeforeNow);
const H = 3_600_000;
const D = 24 * H;

async function sosWithResponse(user, startAgo, steps) {
  set(startAgo);
  const res = await request(app).post('/api/sos').set(auth(user)).send({ trigger_type: 'HOLD', client_request_id: randomUUID(), location: at(0), accuracy_m: 5 });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  for (const [afterSeconds, status] of steps) {
    set(startAgo - afterSeconds * 1000);
    const s = await request(app).post(`/api/staff/alerts/${res.body.alert_id}/status`).set(auth(officer)).send({ status });
    assert.equal(s.status, 200, JSON.stringify(s.body));
  }
  return res.body.alert_id;
}

const report = (user, location, extra = {}) =>
  request(app)
    .post('/api/incidents')
    .set(auth(user))
    .send({ category: 'BROKEN_LIGHTING', severity_level: 'MEDIUM', description: 'Street light out (sample)', location, ...extra });

const analytics = (days, user = officer) => request(app).get('/api/staff/analytics').query(days ? { days } : {}).set(auth(user));

before(async () => {
  deps = await buildTestContainer(await createTestDatabase('analytics'), { configExtra: { INCIDENT_REQUESTS_PER_MINUTE: '1000' } });
  app = createApp(deps);
  officer = await createStaff(deps.pool);
  for (const name of ['Aina Sample', 'Wei Sample', 'Siti Sample', 'Raj Sample']) students.push(await createUser(deps.pool, { name }));

  // SOS alerts in the last week, with the officer's response times.
  await sosWithResponse(students[0], 2 * D, [[60, 'RECEIVED'], [300, 'ARRIVED'], [600, 'RESOLVED']]);
  await sosWithResponse(students[1], 3 * D, [[120, 'RECEIVED'], [420, 'ARRIVED'], [900, 'RESOLVED']]);
  await sosWithResponse(students[2], 4 * D, [[30, 'RESOLVED']]); // false alarm, resolved straight away
  await sosWithResponse(students[3], 1 * H, []); // still not acknowledged
  // Ten days ago: outside a 7-day range, inside 30 days.
  await sosWithResponse(students[0], 10 * D, [[45, 'RECEIVED'], [500, 'RESOLVED']]);

  // Journeys: one arrived safely, one still walking.
  const contact = async (u) =>
    (await request(app).post('/api/contacts').set(auth(u)).send({ contact_name: 'Ali (sample)', phone_number: '+60111111111' })).body.contact_id;
  const c0 = await contact(students[0]);
  const c1 = await contact(students[1]);
  set(5 * D);
  const t1 = await request(app).post('/api/trips').set(auth(students[0])).send({ ...CAMPUS, contact_ids: [c0] });
  assert.equal(t1.status, 201, JSON.stringify(t1.body));
  await request(app).post(`/api/trips/${t1.body.trip_id}/arrive`).set(auth(students[0]));
  set(10 * 60_000);
  const t2 = await request(app).post('/api/trips').set(auth(students[1])).send({ ...CAMPUS, contact_ids: [c1] });
  assert.equal(t2.status, 201, JSON.stringify(t2.body));

  // Incidents two days ago.
  // A dark path confirmed by three people (auto-verified) ...
  set(2 * D);
  for (const s of students.slice(0, 3)) assert.equal((await report(s, at(0, 5000))).status, 201);
  // ... a harassment report 40 m away that security verifies (same hotspot) ...
  set(2 * D - 60 * 60_000);
  const h = await report(students[3], at(40, 5000), { category: 'HARASSMENT', severity_level: 'HIGH', description: 'Followed by a stranger (sample)' });
  set(2 * D - 70 * 60_000);
  assert.equal((await request(app).post(`/api/staff/incidents/${h.body.group_id}/verify`).set(auth(officer)).send({})).status, 200);
  // ... one rejected as false, far away ...
  set(2 * D - 80 * 60_000);
  const f = await report(students[3], at(0, 9000), { category: 'THEFT' });
  set(2 * D - 90 * 60_000);
  assert.equal((await request(app).post(`/api/staff/incidents/${f.body.group_id}/reject`).set(auth(officer)).send({})).status, 200);
  // ... and one still pending.
  set(1 * D);
  assert.equal((await report(students[0], at(0, 12000), { category: 'STRAY_ANIMAL', severity_level: 'LOW' })).status, 201);

  deps.clock.set(NOW);
});
after(async () => deps.pool.end());

describe('campus safety analytics', () => {
  it('counts alerts by type and measures response times from the status log', async () => {
    const res = await analytics(7);
    assert.equal(res.status, 200, JSON.stringify(res.body));
    const a = res.body.alerts;
    assert.equal(a.total, 4, 'the alert from 10 days ago is outside the range');
    assert.deepEqual(a.by_trigger, { HOLD: 4, SILENT: 0, ETA: 0 });
    assert.equal(a.unacknowledged, 1);
    assert.equal(a.open, 1);
    // First staff action: 60, 120, 30 s -> median 60.
    assert.deepEqual(a.response.acknowledge, { n: 3, median_s: 60, p90_s: 108 });
    // Only two alerts were attended on site: not enough for a median.
    assert.deepEqual(a.response.arrive, { n: 2, median_s: null, p90_s: null });
    assert.equal(a.response.resolve.n, 3);
    assert.equal(a.response.resolve.median_s, 600);

    const month = (await analytics(30)).body;
    assert.equal(month.alerts.total, 5);
  });

  it('counts journeys and their outcomes', async () => {
    const j = (await analytics(7)).body.journeys;
    assert.equal(j.started, 2);
    assert.equal(j.arrived_safely, 1);
    assert.equal(j.in_progress, 1);
    assert.equal(j.escalated, 0);
    assert.equal(j.escalation_rate, 0);
  });

  it('summarises reports by category and the review outcome', async () => {
    const r = (await analytics(7)).body.reports;
    assert.equal(r.reports, 6);
    assert.equal(r.incidents, 4);
    assert.deepEqual(r.by_status, { PENDING: 1, VERIFIED: 2, REJECTED: 1, RESOLVED: 0 });
    const lighting = r.by_category.find((c) => c.category === 'BROKEN_LIGHTING');
    assert.deepEqual(lighting, { category: 'BROKEN_LIGHTING', reports: 3, incidents: 1, verified: 1, rejected: 0, resolved: 0, pending: 0 });
    assert.equal(r.by_category[0].category, 'BROKEN_LIGHTING', 'most reported first');
    assert.equal(r.review.decided, 3);
    assert.equal(r.review.rejected_rate, 0.333);
    // Staff decisions only (the auto-verified one is excluded): 10 min each.
    assert.equal(r.review.time_to_review.n, 2);
    assert.equal(r.review.time_to_review.median_s, null, 'fewer than 3 values');
  });

  it('finds hotspots of confirmed incidents and lists open lighting and path problems for repair', async () => {
    const body = (await analytics(7)).body;
    assert.equal(body.hotspots.length, 1, 'only confirmed incidents; the two 40 m apart form one hotspot');
    const [spot] = body.hotspots;
    assert.equal(spot.incidents, 2);
    assert.deepEqual(spot.categories, { BROKEN_LIGHTING: 1, HARASSMENT: 1 });
    assert.ok(Math.abs(spot.location.lat - at(20, 5000).lat) < 0.0002);
    assert.equal(body.points.incidents.length, 2);
    assert.equal(body.points.alerts.length, 4);

    assert.equal(body.repairs.length, 1);
    assert.equal(body.repairs[0].category, 'BROKEN_LIGHTING');
    assert.equal(body.repairs[0].report_count, 3);
    assert.equal(body.repairs[0].open_days, 2);
  });

  it('buckets the trend by day and by hour in Malaysia time', async () => {
    const body = (await analytics(7)).body;
    assert.equal(body.range.bucket, 'day');
    assert.equal(body.trend.length, 8, 'partial first day plus seven days');
    assert.equal(body.trend.reduce((t, d) => t + d.sos, 0), 4);
    assert.equal(body.trend.reduce((t, d) => t + d.reports, 0), 6);
    const nine = body.trend.find((d) => d.start === '2026-11-09');
    assert.equal(nine.reports, 3, 'the three lighting reports on 9 Nov (MYT)');
    assert.equal(body.by_hour.length, 24);
    // Alerts were raised at 23:00 and 22:00 MYT.
    assert.equal(body.by_hour[23].alerts, 3);
    assert.equal(body.by_hour[22].alerts, 1);
    assert.equal((await analytics(90)).body.range.bucket, 'week');
  });

  it('is for security staff only and accepts the listed ranges', async () => {
    assert.equal((await analytics(7, students[0])).status, 403);
    assert.equal((await analytics(14)).status, 400);
    assert.equal((await analytics()).body.range.days, 30);
  });

  it('medians need at least three values', () => {
    assert.deepEqual(durationStats([10, 20]), { n: 2, median_s: null, p90_s: null });
    assert.deepEqual(durationStats([10, null, 30, 20]), { n: 3, median_s: 20, p90_s: 28 });
  });
});
