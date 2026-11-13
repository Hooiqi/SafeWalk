import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { buildTestContainer, createStaff, createTestDatabase, createUser, fakeOsrmFetch } from './helpers/env.js';

// TEST FIXTURE COORDINATES ONLY - not real positions of these places.
const ORIGIN = { lat: 5.356, lng: 100.302 };
const FIXTURES = {
  'Jabatan Keselamatan HQ (Main Security Command)': { lat: 5.3587, lng: 100.302 }, // 300 m north, open 24 h
  'Pintu Kawalan Minden (Minden Security Gate)': { lat: 5.356, lng: 100.3029 }, // 100 m east, weekdays only
  '24-Hour Reading Foyer (PHS & PHS 1)': { lat: 5.356, lng: 100.3002 }, // 200 m west, but a long walk around
};
const SLOW = FIXTURES['24-Hour Reading Foyer (PHS & PHS 1)'];
const slowWalk = ({ lat, lng }) =>
  Math.abs(lat - SLOW.lat) < 1e-6 && Math.abs(lng - SLOW.lng) < 1e-6 ? 900 : undefined;

let deps;
let app;
let migrated; // positions set by the 20261113000100 migration, read before the fixtures replace them
let student;
let officer;
const ids = {};
const auth = (u) => ({ Authorization: `Bearer ${u.token}` });
const SAT_10AM = '2026-11-07T10:00:00+08:00';
const MON_10AM = '2026-11-09T10:00:00+08:00';

function build(url, opts = {}) {
  return buildTestContainer(url, {
    fetch: fakeOsrmFetch({
      tableDuration: (d) => slowWalk(d) ?? Math.hypot((d.lat - ORIGIN.lat) * 111_320, (d.lng - ORIGIN.lng) * 111_320) / 1.25,
      ...opts,
    }),
  });
}

before(async () => {
  const url = await createTestDatabase('safepoints');
  deps = await build(url);
  app = createApp(deps);
  migrated = (
    await deps.pool.query(
      `select name, extensions.st_y(location::extensions.geometry) as lat, extensions.st_x(location::extensions.geometry) as lng
         from public.safe_point order by name`,
    )
  ).rows;
  // The navigator tests below use fixture positions, independent of the real map.
  await deps.pool.query('update public.safe_point set location = null');
  student = await createUser(deps.pool, { name: 'Aina Sample' });
  officer = await createStaff(deps.pool);
  const list = await request(app).get('/api/staff/safe-points').set(auth(officer));
  for (const p of list.body.safe_points) ids[p.name] = p.safe_point_id;
  for (const [name, location] of Object.entries(FIXTURES)) {
    const res = await request(app).patch(`/api/staff/safe-points/${ids[name]}`).set(auth(officer)).send({ location });
    assert.equal(res.status, 200, JSON.stringify(res.body));
  }
});

after(async () => deps.pool.end());
beforeEach(() => deps.clock.set(SAT_10AM));

const nearest = (a = app) => request(a).get(`/api/safe-points/nearest?lat=${ORIGIN.lat}&lng=${ORIGIN.lng}`).set(auth(student));

describe('safe point data', () => {
  it('the location migration pins all 21 places; 20 inside USM Minden, the Sungai Nibong police station south of it', () => {
    assert.equal(migrated.length, 21);
    assert.deepEqual(migrated.filter((p) => p.lat == null).map((p) => p.name), [], 'every point has a position');
    const outside = migrated.filter((p) => !(p.lat > 5.352 && p.lat < 5.363 && p.lng > 100.288 && p.lng < 100.307));
    assert.deepEqual(outside.map((p) => p.name), ['Balai Polis Sungai Nibong']);
    const foyer = migrated.find((p) => p.name.startsWith('24-Hour Reading Foyer'));
    assert.ok(Math.abs(foyer.lat - 5.358776) < 1e-6 && Math.abs(foyer.lng - 100.302848) < 1e-6);
  });

  it('loads the 21 supplied safe points without inventing locations', async () => {
    const res = await request(app).get('/api/staff/safe-points').set(auth(officer));
    assert.equal(res.body.safe_points.length, 21);
    const hq = res.body.safe_points.find((p) => p.name.startsWith('Jabatan Keselamatan HQ'));
    assert.equal(hq.contact_phone, '+6046534999');
    assert.deepEqual(hq.opening_schedule, { always: true });
    const masjid = res.body.safe_points.find((p) => p.name.startsWith('Masjid'));
    assert.equal(masjid.location, null, 'unpinned points have no location');
  });

  it('the app only shows pinned points and reports how many still need a location', async () => {
    const res = await request(app).get('/api/safe-points').set(auth(student));
    assert.equal(res.body.safe_points.length, 3);
    assert.equal(res.body.pending_location_count, 18);
    const gate = res.body.safe_points.find((p) => p.name.startsWith('Pintu Kawalan Minden'));
    assert.equal(gate.opening.is_open, false, 'closed on Saturday');
    assert.equal(gate.opening_schedule, undefined, 'admin fields are not exposed to students');
  });
});

describe('nearest safe point navigator', () => {
  it('filters by opening hours, finds k nearest with PostGIS, then ranks by walking time', async () => {
    const res = await nearest();
    assert.equal(res.status, 200);
    const names = res.body.safe_points.map((p) => p.name);
    // Minden gate is nearest in a straight line but closed on Saturday.
    // The foyer is nearer than HQ in a straight line, but a much longer walk.
    assert.deepEqual(names, ['Jabatan Keselamatan HQ (Main Security Command)', '24-Hour Reading Foyer (PHS & PHS 1)']);
    const [hq, foyer] = res.body.safe_points;
    assert.equal(hq.walking.source, 'OSRM');
    assert.ok(Math.abs(hq.walking.duration_s - 240) <= 2);
    assert.equal(foyer.walking.duration_s, 900);
    assert.ok(foyer.straight_line_m < hq.straight_line_m);
    assert.equal(hq.contact_phone, '+6046534999');
  });

  it('includes the weekday gate during its opening hours', async () => {
    deps.clock.set(MON_10AM);
    const res = await nearest();
    assert.equal(res.body.safe_points[0].name, 'Pintu Kawalan Minden (Minden Security Gate)');
    assert.equal(res.body.safe_points[0].opening.closes_at, new Date('2026-11-09T17:10:00+08:00').toISOString());
  });

  it('falls back to straight-line estimates when OSRM is unreachable', async () => {
    const offline = await build(deps.config.DATABASE_URL, { fail: true });
    offline.clock.set(SAT_10AM);
    const res = await nearest(createApp(offline));
    assert.equal(res.body.safe_points[0].name, '24-Hour Reading Foyer (PHS & PHS 1)');
    assert.equal(res.body.safe_points[0].walking.source, 'STRAIGHT_LINE_ESTIMATE');
    await offline.pool.end();
  });

  it('gives walking directions with readable steps', async () => {
    const res = await request(app)
      .get(`/api/safe-points/${ids['Jabatan Keselamatan HQ (Main Security Command)']}/directions?lat=${ORIGIN.lat}&lng=${ORIGIN.lng}`)
      .set(auth(student));
    assert.equal(res.status, 200);
    assert.deepEqual(res.body.route.steps.map((s) => s.instruction), [
      'Start on Persiaran Sample',
      'Turn left onto Jalan Sample',
      'Arrive at your destination',
    ]);
    const unpinned = await request(app)
      .get(`/api/safe-points/${ids['Balai Polis Gelugor']}/directions?lat=${ORIGIN.lat}&lng=${ORIGIN.lng}`)
      .set(auth(student));
    assert.equal(unpinned.status, 404);
  });

  it('validates coordinates', async () => {
    const res = await request(app).get('/api/safe-points/nearest?lat=abc&lng=100').set(auth(student));
    assert.equal(res.status, 400);
  });
});

describe('safe point management (security staff)', () => {
  it('students cannot manage safe points', async () => {
    assert.equal((await request(app).get('/api/staff/safe-points').set(auth(student))).status, 403);
    const res = await request(app)
      .patch(`/api/staff/safe-points/${ids['Balai Polis Gelugor']}`)
      .set(auth(student))
      .send({ is_active: false });
    assert.equal(res.status, 403);
  });

  it('staff add a point, edit its hours and deactivate it; changes reach the app immediately', async () => {
    const bad = await request(app)
      .post('/api/staff/safe-points')
      .set(auth(officer))
      .send({ name: 'X', category: 'MEDICAL', location: null, operating_hours: 'x', opening_schedule: { weekly: {} }, is_active: true });
    assert.equal(bad.status, 400);

    const created = await request(app)
      .post('/api/staff/safe-points')
      .set(auth(officer))
      .send({
        name: 'Test kiosk (sample)',
        category: 'PUBLIC_BUILDING',
        location: { lat: 5.3561, lng: 100.3021 },
        operating_hours: '9 AM - 5 PM, Saturday',
        opening_schedule: { weekly: { sat: [['09:00', '17:00']] } },
        contact_phone: '+6041234567',
        is_active: true,
      });
    assert.equal(created.status, 201, JSON.stringify(created.body));
    let first = (await nearest()).body.safe_points[0];
    assert.equal(first.name, 'Test kiosk (sample)');

    const id = created.body.safe_point_id;
    await request(app).patch(`/api/staff/safe-points/${id}`).set(auth(officer)).send({ opening_schedule: { weekly: { sun: [['09:00', '17:00']] } } });
    first = (await nearest()).body.safe_points[0];
    assert.notEqual(first.name, 'Test kiosk (sample)', 'now closed on Saturday');

    await request(app).patch(`/api/staff/safe-points/${id}`).set(auth(officer)).send({ opening_schedule: { always: true }, is_active: false });
    const list = await request(app).get('/api/safe-points').set(auth(student));
    assert.ok(!list.body.safe_points.some((p) => p.safe_point_id === id), 'inactive points are hidden');

    const { rows } = await deps.pool.query('select updated_by from public.safe_point where safe_point_id = $1', [id]);
    assert.ok(rows[0].updated_by, 'records which officer changed it');
  });
});
