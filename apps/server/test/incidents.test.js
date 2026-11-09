import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, beforeEach, describe, it } from 'node:test';
import request from 'supertest';
import { SOCKET_EVENTS as E } from '@safewalk/shared';
import { createApp } from '../src/app.js';
import { cleanPhoto, createMemoryPhotoStorage } from '../src/modules/incidents/photoStorage.js';
import { buildTestContainer, createStaff, createTestDatabase, createUser } from './helpers/env.js';

// TEST FIXTURE COORDINATES ONLY. Positions are offsets in metres from one point.
const BASE = { lat: 5.3561, lng: 100.3021 };
const at = (northM, eastM = 0) => ({
  lat: BASE.lat + northM / 111_320,
  lng: BASE.lng + eastM / (111_320 * Math.cos((BASE.lat * Math.PI) / 180)),
});
// Each test works in its own patch of the fixture area so incidents never mix.
let area = 0;
const nextArea = () => {
  area += 1;
  return (northM, eastM = 0) => at(northM, eastM + area * 1000);
};

let deps;
let app;
let officer;
const students = [];
const storage = createMemoryPhotoStorage();
const auth = (u) => ({ Authorization: `Bearer ${u.token}` });

before(async () => {
  const url = await createTestDatabase('incidents');
  deps = await buildTestContainer(url, { photoStorage: storage, configExtra: { INCIDENT_REPORTS_PER_HOUR: '6', INCIDENT_REQUESTS_PER_MINUTE: '1000' } });
  app = createApp(deps);
  officer = await createStaff(deps.pool);
  for (const name of ['Aina Sample', 'Wei Sample', 'Siti Sample', 'Raj Sample', 'Mei Sample']) {
    students.push(await createUser(deps.pool, { name }));
  }
});
after(async () => deps.pool.end());
// Each test starts two hours after the previous one, so per-hour limits and
// the 30-minute window never carry over between tests.
let testHour = 0;
beforeEach(() => {
  deps.clock.set(Date.parse('2026-11-10T21:00:00+08:00') + testHour * 2 * 3_600_000);
  testHour += 1;
  deps.publisher.sent.length = 0;
});

const report = (user, location, extra = {}) =>
  request(app)
    .post('/api/incidents')
    .set(auth(user))
    .send({ category: 'SUSPICIOUS_ACTIVITY', severity_level: 'MEDIUM', description: 'Someone following students near the path', location, ...extra });

const mapBox = (user, around, half = 0.01) =>
  request(app)
    .get('/api/incidents/map')
    .query({ south: around.lat - half, north: around.lat + half, west: around.lng - half, east: around.lng + half })
    .set(auth(user));

const sentTo = (event, room) => deps.publisher.sent.filter((s) => s.event === event && (!room || s.room === room));

describe('submitting a report', () => {
  it('stores a pending report that only its reporter can follow, and alerts security', async () => {
    const p = nextArea();
    const res = await report(students[0], p(0), { severity_level: 'LOW', category: 'BROKEN_LIGHTING', description: 'Street light out' });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    assert.equal(res.body.status, 'PENDING');
    assert.equal(res.body.category, 'BROKEN_LIGHTING');
    assert.equal(res.body.report_count, 1);

    const mine = await request(app).get('/api/incidents/mine').set(auth(students[0]));
    assert.ok(mine.body.reports.some((r) => r.report_id === res.body.report_id));

    // Not on the shared map, and not visible to someone else.
    const map = await mapBox(students[1], p(0));
    assert.ok(!map.body.incidents.some((i) => i.group_id === res.body.group_id));
    assert.equal((await request(app).get(`/api/incidents/${res.body.group_id}`).set(auth(students[1]))).status, 404);
    assert.equal((await request(app).get(`/api/incidents/${res.body.group_id}`).set(auth(students[0]))).status, 200);

    // Security's review queue hears about it immediately.
    const news = sentTo(E.INCIDENT_NEW, 'staff');
    assert.equal(news.length, 1);
    assert.equal(news[0].payload.incident.group_id, res.body.group_id);
  });

  it('keeps anonymous reporters hidden from security, but lets them track the report', async () => {
    const p = nextArea();
    const anon = await report(students[0], p(0), { is_anonymous: true });
    const named = await report(students[1], p(10));
    assert.equal(named.body.group_id, anon.body.group_id, 'same place and category: one incident');

    const { rows } = await deps.pool.query(`select user_id from public.incident_report where report_id = $1`, [anon.body.report_id]);
    assert.equal(rows[0].user_id, null, 'no user id on an anonymous report');

    const detail = await request(app).get(`/api/staff/incidents/${anon.body.group_id}`).set(auth(officer));
    const byId = Object.fromEntries(detail.body.reports.map((r) => [r.report_id, r]));
    assert.equal(byId[anon.body.report_id].reporter, null);
    assert.equal(byId[anon.body.report_id].is_anonymous, true);
    assert.equal(byId[named.body.report_id].reporter.full_name, 'Wei Sample');
    assert.ok(!JSON.stringify(detail.body).includes('Aina Sample'), 'the anonymous name appears nowhere');

    const mine = await request(app).get('/api/incidents/mine').set(auth(students[0]));
    assert.ok(mine.body.reports.some((r) => r.report_id === anon.body.report_id && r.is_anonymous));
  });

  it('validates the report', async () => {
    const bad = await report(students[0], at(0), { category: 'ALIENS', description: '' });
    assert.equal(bad.status, 400);
    const paths = bad.body.error.details.map((d) => d.path);
    assert.ok(paths.includes('category') && paths.includes('description'));
    const unauth = await request(app).post('/api/incidents').send({});
    assert.equal(unauth.status, 401);
  });

  it('a retried request never creates a second report', async () => {
    const p = nextArea();
    const key = randomUUID();
    const first = await report(students[2], p(0), { client_request_id: key });
    const again = await report(students[2], p(0), { client_request_id: key });
    assert.equal(again.status, 201);
    assert.equal(again.body.report_id, first.body.report_id);
    assert.equal(again.body.report_count, 1);
  });

  it('one person cannot report the same incident twice in the window', async () => {
    const p = nextArea();
    await report(students[3], p(0));
    const dup = await report(students[3], p(5));
    assert.equal(dup.status, 409);
    assert.equal(dup.body.error.code, 'ALREADY_REPORTED');
  });

  it('limits how many reports one person sends in an hour', async () => {
    const p = nextArea();
    const user = await createUser(deps.pool, { name: 'Busy Sample' });
    for (let i = 0; i < 6; i += 1) {
      const res = await report(user, p(i * 500));
      assert.equal(res.status, 201, `report ${i}`);
    }
    const blocked = await report(user, p(5000));
    assert.equal(blocked.status, 429);
    deps.clock.advance(3601);
    assert.equal((await report(user, p(6000))).status, 201);
  });
});

describe('crowdsourced auto-verification (3 people, 50 m, 30 minutes)', () => {
  it('verifies an incident once three different people report it, and puts it on the map', async () => {
    const p = nextArea();
    const a = await report(students[0], p(0));
    deps.clock.advance(5 * 60);
    const b = await report(students[1], p(20, 10));
    assert.equal(b.body.status, 'PENDING', 'two reports are not enough');
    deps.clock.advance(10 * 60);
    const c = await report(students[2], p(-15, 20), { severity_level: 'HIGH' });
    assert.equal(c.body.status, 'VERIFIED');
    assert.equal(c.body.auto_verified, true);
    assert.equal(c.body.report_count, 3);
    assert.equal(new Set([a.body.group_id, b.body.group_id, c.body.group_id]).size, 1);

    const map = await mapBox(students[4], p(0));
    const pin = map.body.incidents.find((i) => i.group_id === c.body.group_id);
    assert.ok(pin, 'on the shared map');
    assert.equal(pin.severity_level, 'HIGH', 'highest reported severity');
    assert.equal(pin.description, undefined, 'the map never carries descriptions');

    // Every reporter is told; every app user reloads the map.
    const told = sentTo(E.INCIDENT_STATUS).map((s) => s.room);
    for (const s of students.slice(0, 3)) assert.ok(told.includes(`user:${s.id}`));
    assert.equal(sentTo(E.INCIDENT_MAP, 'app-users').length, 1);
  });

  it('does not count reports more than 50 m apart', async () => {
    const p = nextArea();
    await report(students[0], p(0));
    await report(students[1], p(30));
    const far = await report(students[2], p(110));
    assert.equal(far.body.status, 'PENDING');
    const near = await report(students[3], p(10));
    assert.equal(near.body.status, 'VERIFIED');
  });

  it('does not count reports spread over more than 30 minutes', async () => {
    const p = nextArea();
    await report(students[0], p(0));
    deps.clock.advance(20 * 60);
    await report(students[1], p(5));
    deps.clock.advance(15 * 60); // first report is now 35 minutes old
    const third = await report(students[2], p(10));
    assert.equal(third.body.status, 'PENDING');
  });

  it('keeps different categories apart', async () => {
    const p = nextArea();
    await report(students[0], p(0), { category: 'STRAY_ANIMAL' });
    await report(students[1], p(0), { category: 'STRAY_ANIMAL' });
    const other = await report(students[2], p(0), { category: 'THEFT' });
    assert.equal(other.body.status, 'PENDING');
    assert.equal(other.body.report_count, 1);
  });

  it('three reports sent at the same moment still form one verified incident', async () => {
    const p = nextArea();
    const results = await Promise.all(students.slice(0, 3).map((s, i) => report(s, p(i * 10))));
    assert.deepEqual(results.map((r) => r.status), [201, 201, 201]);
    assert.equal(new Set(results.map((r) => r.body.group_id)).size, 1);
    const { rows } = await deps.pool.query(`select status, auto_verified, report_count from public.incident_group where group_id = $1`, [
      results[0].body.group_id,
    ]);
    assert.deepEqual(rows[0], { status: 'VERIFIED', auto_verified: true, report_count: 3 });
  });
});

describe('the shared safety map', () => {
  it('returns only verified incidents inside the visible area', async () => {
    const p = nextArea();
    const inside = await report(students[0], p(0));
    const outside = await report(students[0], p(5000), { category: 'THEFT' });
    for (const g of [inside.body.group_id, outside.body.group_id]) {
      await request(app).post(`/api/staff/incidents/${g}/verify`).set(auth(officer)).send({});
    }
    const map = await mapBox(students[1], p(0), 0.005);
    const ids = map.body.incidents.map((i) => i.group_id);
    assert.ok(ids.includes(inside.body.group_id));
    assert.ok(!ids.includes(outside.body.group_id));
  });

  it('refuses an area that is too large', async () => {
    const res = await mapBox(students[0], at(0), 1);
    assert.equal(res.status, 400);
  });

  it('warns about verified incidents along a planned walk', async () => {
    const p = nextArea();
    const near = await report(students[0], p(500, 30), { category: 'HARASSMENT', severity_level: 'HIGH' });
    const away = await report(students[0], p(500, 400), { category: 'STRAY_ANIMAL' });
    for (const g of [near.body.group_id, away.body.group_id]) {
      await request(app).post(`/api/staff/incidents/${g}/verify`).set(auth(officer)).send({});
    }
    const res = await request(app)
      .post('/api/trips/route-preview')
      .set(auth(students[1]))
      .send({ origin: p(0), destination: p(1000) });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    const ids = res.body.hazards.map((h) => h.group_id);
    assert.ok(ids.includes(near.body.group_id));
    assert.ok(!ids.includes(away.body.group_id));
    assert.ok(res.body.hazards[0].distance_from_route_m <= 50);
  });
});

describe('security review', () => {
  it('verifies, then resolves, with notes the reporter and the map can see', async () => {
    const p = nextArea();
    const r = await report(students[0], p(0), { category: 'UNSAFE_PATH', severity_level: 'LOW' });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    const g = r.body.group_id;

    const verified = await request(app)
      .post(`/api/staff/incidents/${g}/verify`)
      .set(auth(officer))
      .send({ severity_level: 'MEDIUM', public_note: 'Fallen tree on the walkway', staff_note: 'Facilities informed' });
    assert.equal(verified.status, 200, JSON.stringify(verified.body));
    assert.equal(verified.body.status, 'VERIFIED');
    assert.equal(verified.body.auto_verified, false);
    assert.equal(verified.body.reviewed_by, 'Test Officer');
    assert.equal(verified.body.severity_level, 'MEDIUM');
    assert.ok(sentTo(E.INCIDENT_STATUS, `user:${students[0].id}`).length >= 1);

    const pub = await request(app).get(`/api/incidents/${g}`).set(auth(students[1]));
    assert.equal(pub.body.public_note, 'Fallen tree on the walkway');
    assert.equal(pub.body.staff_note, undefined, 'internal notes stay internal');

    const resolved = await request(app).post(`/api/staff/incidents/${g}/resolve`).set(auth(officer)).send({ public_note: 'Tree removed' });
    assert.equal(resolved.body.status, 'RESOLVED');
    const map = await mapBox(students[1], p(0));
    assert.ok(!map.body.incidents.some((i) => i.group_id === g), 'resolved incidents leave the map');
    const mine = await request(app).get('/api/incidents/mine').set(auth(students[0]));
    const mineRow = mine.body.reports.find((x) => x.report_id === r.body.report_id);
    assert.equal(mineRow.status, 'RESOLVED');
    assert.equal(mineRow.public_note, 'Tree removed');
  });

  it('removes a false report, and refuses impossible steps', async () => {
    const p = nextArea();
    const r = await report(students[1], p(0), { category: 'OTHER' });
    const rejected = await request(app).post(`/api/staff/incidents/${r.body.group_id}/reject`).set(auth(officer)).send({ staff_note: 'Prank' });
    assert.equal(rejected.body.status, 'REJECTED');
    const resolve = await request(app).post(`/api/staff/incidents/${r.body.group_id}/resolve`).set(auth(officer)).send({});
    assert.equal(resolve.status, 409);
    assert.equal(resolve.body.error.code, 'INVALID_TRANSITION');
    // A new report at the same place starts a fresh incident.
    const fresh = await report(students[2], p(0), { category: 'OTHER' });
    assert.notEqual(fresh.body.group_id, r.body.group_id);
  });

  it('groups duplicate reports into one incident', async () => {
    const p = nextArea();
    const a = await report(students[0], p(0), { category: 'THEFT' });
    deps.clock.advance(45 * 60); // outside the window: becomes a separate incident
    const b = await report(students[1], p(30), { category: 'THEFT', severity_level: 'HIGH' });
    assert.notEqual(a.body.group_id, b.body.group_id);

    const detail = await request(app).get(`/api/staff/incidents/${a.body.group_id}`).set(auth(officer));
    assert.ok(detail.body.nearby.some((n) => n.group_id === b.body.group_id), 'suggested for merging');

    const merged = await request(app).post(`/api/staff/incidents/${b.body.group_id}/merge`).set(auth(officer)).send({ into_group_id: a.body.group_id });
    assert.equal(merged.status, 200, JSON.stringify(merged.body));
    assert.equal(merged.body.report_count, 2);
    assert.equal(merged.body.severity_level, 'HIGH');
    assert.equal(merged.body.reports.length, 2);
    assert.equal((await request(app).get(`/api/staff/incidents/${b.body.group_id}`).set(auth(officer))).status, 404);
    const mine = await request(app).get('/api/incidents/mine').set(auth(students[1]));
    assert.equal(mine.body.reports.find((x) => x.report_id === b.body.report_id).group_id, a.body.group_id);
  });

  it('is for security staff only', async () => {
    assert.equal((await request(app).get('/api/staff/incidents').set(auth(students[0]))).status, 403);
    const list = await request(app).get('/api/staff/incidents').set(auth(officer));
    assert.equal(list.status, 200);
    assert.ok(list.body.incidents.length > 0);
    assert.ok(list.body.incidents.every((i) => ['PENDING', 'VERIFIED'].includes(i.status)));
  });
});

// A small JPEG-shaped file: JFIF header, an EXIF block with a GPS tag and an
// owner name, a comment, then image data.
function jpegWithExif() {
  const seg = (marker, body) => {
    const len = Buffer.alloc(2);
    len.writeUInt16BE(body.length + 2);
    return Buffer.concat([Buffer.from([0xff, marker]), len, body]);
  };
  return Buffer.concat([
    Buffer.from([0xff, 0xd8]),
    seg(0xe0, Buffer.from('JFIF\0\x01\x01\0\0\x01\0\x01\0\0', 'latin1')),
    seg(0xe1, Buffer.from('Exif\0\0GPSLatitude 5.3561 Owner Aina Sample', 'latin1')),
    seg(0xfe, Buffer.from('taken on Aina phone', 'latin1')),
    seg(0xdb, Buffer.alloc(65, 1)),
    seg(0xda, Buffer.from([0x01, 0x01, 0x00, 0x00, 0x3f, 0x00])),
    Buffer.from([0x12, 0x34, 0x56, 0xff, 0xd9]),
  ]);
}

describe('optional photo', () => {
  it('removes location and owner metadata before storing it', () => {
    const { buffer, contentType } = cleanPhoto(jpegWithExif());
    assert.equal(contentType, 'image/jpeg');
    const text = buffer.toString('latin1');
    assert.ok(!text.includes('GPSLatitude') && !text.includes('Aina'), 'EXIF and comments removed');
    assert.ok(text.includes('JFIF'), 'image header kept');
    assert.deepEqual([...buffer.subarray(-2)], [0xff, 0xd9]);
  });

  it('lets the reporter add one photo that security can view', async () => {
    const p = nextArea();
    const r = await report(students[0], p(0), { is_anonymous: true });
    const url = `/api/incidents/reports/${r.body.report_id}/photo`;

    const notMine = await request(app).post(url).set(auth(students[1])).set('Content-Type', 'image/jpeg').send(jpegWithExif());
    assert.equal(notMine.status, 404, JSON.stringify(notMine.body));
    const notImage = await request(app).post(url).set(auth(students[0])).set('Content-Type', 'image/jpeg').send(Buffer.from('hello'));
    assert.equal(notImage.status, 400);

    const ok = await request(app).post(url).set(auth(students[0])).set('Content-Type', 'image/jpeg').send(jpegWithExif());
    assert.equal(ok.status, 201, JSON.stringify(ok.body));
    const again = await request(app).post(url).set(auth(students[0])).set('Content-Type', 'image/jpeg').send(jpegWithExif());
    assert.equal(again.status, 409);

    const photo = await request(app).get(`/api/staff/incidents/reports/${r.body.report_id}/photo`).set(auth(officer)).buffer(true);
    assert.equal(photo.status, 200);
    assert.equal(photo.headers['content-type'], 'image/jpeg');
    assert.ok(!photo.body.toString('latin1').includes('GPSLatitude'));
    assert.equal((await request(app).get(`/api/staff/incidents/reports/${r.body.report_id}/photo`).set(auth(students[0]))).status, 403);
  });

  it('only accepts photos shortly after the report', async () => {
    const p = nextArea();
    const r = await report(students[1], p(0));
    deps.clock.advance(31 * 60);
    const late = await request(app)
      .post(`/api/incidents/reports/${r.body.report_id}/photo`)
      .set(auth(students[1]))
      .set('Content-Type', 'image/jpeg')
      .send(jpegWithExif());
    assert.equal(late.status, 409);
    assert.equal(late.body.error.code, 'PHOTO_WINDOW_CLOSED');
  });
});

describe('row level security for reports', () => {
  async function asUser(user, sql) {
    const client = await deps.pool.connect();
    try {
      await client.query('begin');
      await client.query('set local role authenticated');
      await client.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: user.id, email: user.email, role: 'authenticated' })]);
      return (await client.query(sql)).rows;
    } finally {
      await client.query('rollback');
      client.release();
    }
  }

  it('students see verified incidents and their own reports only', async () => {
    const outsider = await createUser(deps.pool, { name: 'Outsider Sample' });
    const groups = await asUser(outsider, `select distinct status from public.incident_group`);
    assert.deepEqual(groups.map((g) => g.status), ['VERIFIED']);
    assert.equal((await asUser(outsider, `select count(*)::int as n from public.incident_report`))[0].n, 0);
    assert.ok((await asUser(students[0], `select count(*)::int as n from public.incident_report`))[0].n > 0);
  });

  it('security staff see every report but never who sent an anonymous one', async () => {
    const reports = await asUser(officer, `select count(*)::int as n from public.incident_report`);
    assert.ok(reports[0].n > 0);
    const owners = await asUser(officer, `select count(*)::int as n from public.incident_report_owner`);
    assert.equal(owners[0].n, 0);
  });
});
