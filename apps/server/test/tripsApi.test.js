import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { CAMPUS, buildTestContainer, createStaff, createTestDatabase, createUser, fakeOsrmFetch } from './helpers/env.js';

let deps;
let app;
let student;
let other;

const auth = (u) => ({ Authorization: `Bearer ${u.token}` });

async function addContact(user, body = { contact_name: 'Ali (sample contact)', phone_number: '+60111111111' }) {
  const res = await request(app).post('/api/contacts').set(auth(user)).send(body);
  assert.equal(res.status, 201, JSON.stringify(res.body));
  return res.body;
}

async function startTrip(user, contactIds, extra = {}) {
  return request(app)
    .post('/api/trips')
    .set(auth(user))
    .send({ ...CAMPUS, destination_label: 'Sample destination', contact_ids: contactIds, ...extra });
}

before(async () => {
  const url = await createTestDatabase('api');
  deps = await buildTestContainer(url);
  app = createApp(deps);
});

after(async () => deps.pool.end());

beforeEach(async () => {
  await deps.pool.query('truncate public.trip, public.trusted_contact, public.sos_alert cascade');
  deps.deliveries.length = 0;
  student = await createUser(deps.pool, { name: 'Aina Sample' });
  other = await createUser(deps.pool, { name: 'Other Sample' });
});

describe('authentication and authorisation', () => {
  it('rejects requests without a valid Supabase token', async () => {
    assert.equal((await request(app).get('/api/me')).status, 401);
    const res = await request(app).get('/api/me').set('Authorization', 'Bearer not-a-jwt');
    assert.equal(res.status, 401);
  });

  it('creates the profile from signup metadata', async () => {
    const res = await request(app).get('/api/me').set(auth(student));
    assert.equal(res.status, 200);
    assert.equal(res.body.full_name, 'Aina Sample');
    assert.equal(res.body.phone_number, '+60123456789');
  });

  it('students cannot use security staff endpoints', async () => {
    const res = await request(app).get('/api/staff/alerts').set(auth(student));
    assert.equal(res.status, 403);
  });

  it('an allow-listed email only gets staff access once it is confirmed', async () => {
    const unconfirmed = await createStaff(deps.pool, { confirmed: false });
    assert.equal((await request(app).get('/api/staff/me').set(auth(unconfirmed))).status, 403);
    const officer = await createStaff(deps.pool);
    const res = await request(app).get('/api/staff/me').set(auth(officer));
    assert.equal(res.status, 200);
    assert.ok(res.body.last_login);
  });
});

describe('trusted contacts', () => {
  it('validates and stores contacts per user', async () => {
    const bad = await request(app).post('/api/contacts').set(auth(student)).send({ contact_name: 'No channel' });
    assert.equal(bad.status, 400);
    const badPhone = await request(app).post('/api/contacts').set(auth(student)).send({ contact_name: 'X', phone_number: '0123' });
    assert.equal(badPhone.status, 400);

    const c = await addContact(student);
    const list = await request(app).get('/api/contacts').set(auth(student));
    assert.equal(list.body.length, 1);
    // Another user can neither see nor change it.
    assert.equal((await request(app).get('/api/contacts').set(auth(other))).body.length, 0);
    assert.equal((await request(app).patch(`/api/contacts/${c.contact_id}`).set(auth(other)).send({ contact_name: 'Hijack' })).status, 404);
    assert.equal((await request(app).delete(`/api/contacts/${c.contact_id}`).set(auth(other))).status, 404);
    assert.equal((await request(app).delete(`/api/contacts/${c.contact_id}`).set(auth(student))).status, 204);
  });
});

describe('starting a journey', () => {
  it('computes the route and ETA on the server and generates a secure tracking link', async () => {
    const contact = await addContact(student);
    const res = await startTrip(student, [contact.contact_id]);
    assert.equal(res.status, 201, JSON.stringify(res.body));
    const trip = res.body;
    assert.equal(trip.status, 'ACTIVE');
    assert.equal(trip.route.source, 'OSRM');
    assert.equal(trip.route.distance_m, 600);
    assert.equal(trip.route.duration_s, 480);
    assert.equal(new Date(trip.eta_deadline) - new Date(trip.started_at), 480_000);
    assert.match(trip.tracking_url, /^http:\/\/tracking\.test\/t\/[A-Za-z0-9_-]{43}$/);
    assert.deepEqual(trip.route.geometry.type, 'LineString');
    // The starting point is the first entry of the route history.
    assert.equal(trip.last_location.lat, CAMPUS.origin.lat);

    // The tracking link was sent to the chosen contact.
    assert.equal(deps.deliveries.length, 1);
    assert.equal(deps.deliveries[0].to, '+60111111111');
    assert.ok(deps.deliveries[0].text.includes(trip.tracking_url));
    assert.deepEqual(trip.link_delivery, [{ channel: 'sms', recipient: 'Ali (sample contact)', status: 'sent' }]);
  });

  it('only allows the user own contacts and one open journey at a time', async () => {
    const mine = await addContact(student);
    const theirs = await addContact(other);
    assert.equal((await startTrip(student, [theirs.contact_id])).status, 400);
    assert.equal((await startTrip(student, [])).status, 400);
    assert.equal((await startTrip(student, [mine.contact_id])).status, 201);
    const again = await startTrip(student, [mine.contact_id]);
    assert.equal(again.status, 409);
    assert.equal(again.body.error.code, 'TRIP_ALREADY_OPEN');
  });

  it('rejects malformed coordinates', async () => {
    const c = await addContact(student);
    const res = await request(app)
      .post('/api/trips')
      .set(auth(student))
      .send({ origin: { lat: 200, lng: 0 }, destination: CAMPUS.destination, contact_ids: [c.contact_id] });
    assert.equal(res.status, 400);
    assert.equal(res.body.error.code, 'BAD_REQUEST');
  });

  it('falls back to a clearly labelled straight-line estimate when OSRM is down', async () => {
    const down = await buildTestContainer(deps.config.DATABASE_URL, { fetch: fakeOsrmFetch({ fail: true }) });
    const res = await request(createApp(down)).post('/api/trips/route-preview').set(auth(student)).send(CAMPUS);
    assert.equal(res.status, 200);
    assert.equal(res.body.source, 'STRAIGHT_LINE_ESTIMATE');
    assert.ok(res.body.distance_m > 400 && res.body.distance_m < 500);
    await down.pool.end();
  });
});

describe('during a journey', () => {
  let trip;
  beforeEach(async () => {
    const c = await addContact(student);
    trip = (await startTrip(student, [c.contact_id])).body;
  });

  it('stores location samples, ignores duplicates and protects other users trips', async () => {
    const t = new Date(deps.clock().getTime() + 1000).toISOString();
    const sample = { lat: 5.357, lng: 100.303, recorded_at: t, battery_level: 80, accuracy_m: 8 };
    const first = await request(app).post(`/api/trips/${trip.trip_id}/locations`).set(auth(student)).send({ samples: [sample] });
    assert.deepEqual(first.body, { accepted: 1, duplicates: 0, rejected: 0 });
    const dup = await request(app).post(`/api/trips/${trip.trip_id}/locations`).set(auth(student)).send({ samples: [sample] });
    assert.deepEqual(dup.body, { accepted: 0, duplicates: 1, rejected: 0 });

    const intruder = await request(app).post(`/api/trips/${trip.trip_id}/locations`).set(auth(other)).send({ samples: [sample] });
    assert.equal(intruder.status, 404);
    assert.equal((await request(app).get(`/api/trips/${trip.trip_id}`).set(auth(other))).status, 404);

    const viewerEvents = deps.publisher.sent.filter((e) => e.room === `trip:${trip.trip_id}` && e.event === 'trip:position');
    assert.equal(viewerEvents.length, 1, 'only the fresh sample is broadcast');
    assert.equal(viewerEvents[0].payload.battery_level, 80);
  });

  it('extends, then completes on safe arrival', async () => {
    const ext = await request(app).post(`/api/trips/${trip.trip_id}/extend`).set(auth(student)).send({ minutes: 10 });
    assert.equal(ext.status, 200);
    assert.equal(new Date(ext.body.eta_deadline) - new Date(trip.eta_deadline), 600_000);
    assert.equal((await request(app).post(`/api/trips/${trip.trip_id}/extend`).set(auth(student)).send({ minutes: 7 })).status, 400);

    const arrived = await request(app).post(`/api/trips/${trip.trip_id}/arrive`).set(auth(student));
    assert.equal(arrived.body.status, 'COMPLETED');
    assert.equal(arrived.body.end_reason, 'ARRIVED');
    assert.equal((await request(app).get('/api/trips/active').set(auth(student))).body.trip, null);
    // Ended trips accept no more locations.
    const late = await request(app)
      .post(`/api/trips/${trip.trip_id}/locations`)
      .set(auth(student))
      .send({ samples: [{ lat: 5.357, lng: 100.303, recorded_at: deps.clock().toISOString() }] });
    assert.equal(late.status, 409);
  });

  it('can cancel an active journey but not confirm safety before any prompt', async () => {
    assert.equal((await request(app).post(`/api/trips/${trip.trip_id}/confirm-safe`).set(auth(student))).status, 409);
    const cancelled = await request(app).post(`/api/trips/${trip.trip_id}/cancel`).set(auth(student));
    assert.equal(cancelled.body.status, 'CANCELLED');
  });

  it('lists journey history newest first', async () => {
    await request(app).post(`/api/trips/${trip.trip_id}/arrive`).set(auth(student));
    const history = await request(app).get('/api/trips?limit=5').set(auth(student));
    assert.equal(history.body.trips.length, 1);
    assert.equal(history.body.trips[0].status, 'COMPLETED');
    assert.equal(history.body.trips[0].tracking_url, undefined, 'history does not repeat share links');
  });
});
