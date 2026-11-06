import { randomUUID } from 'node:crypto';
import { SignJWT } from 'jose';
import pg from 'pg';
import { loadConfig } from '../../src/config.js';
import { createContainer } from '../../src/container.js';
import { applyMigrations } from '../../scripts/migrate.js';

export const JWT_SECRET = 'test-only-secret-that-is-at-least-32-characters';
const ADMIN_URL = process.env.TEST_ADMIN_DATABASE_URL ?? 'postgres://postgres:postgres@localhost:5432/postgres';

/** Creates a fresh database with the shim + all migrations for one test file. */
export async function createTestDatabase(name) {
  const dbName = `safewalk_test_${name}`;
  const admin = new pg.Client({ connectionString: ADMIN_URL });
  await admin.connect();
  await admin.query(`drop database if exists ${dbName} with (force)`);
  await admin.query(`create database ${dbName}`);
  await admin.end();
  const url = new URL(ADMIN_URL);
  url.pathname = `/${dbName}`;
  await applyMigrations(url.toString(), { shim: true });
  return url.toString();
}

export function testConfig(databaseUrl, extra = {}) {
  return loadConfig({
    NODE_ENV: 'test',
    LOG_LEVEL: 'silent',
    DATABASE_URL: databaseUrl,
    SUPABASE_JWT_SECRET: JWT_SECRET,
    TRACKING_PAGE_URL: 'http://tracking.test/t/',
    ...extra,
  });
}

/** Controllable clock shared by the server and the test. */
export function testClock(start = new Date('2026-11-06T12:00:00Z')) {
  let now = start.getTime();
  const clock = () => new Date(now);
  clock.advance = (seconds) => {
    now += seconds * 1000;
  };
  clock.set = (date) => {
    now = new Date(date).getTime();
  };
  return clock;
}

/** Fake OSRM: a straight 2-point route of `distance` m walked at 1.25 m/s. */
export function fakeOsrmFetch({ fail = false, distance = 600 } = {}) {
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(url);
    if (fail) throw new Error('network down');
    const [, coords] = /\/route\/v1\/[^/]+\/([^?]+)/.exec(url);
    const coordinates = coords.split(';').map((p) => p.split(',').map(Number));
    return {
      ok: true,
      json: async () => ({ code: 'Ok', routes: [{ distance, duration: distance / 1.25, geometry: { type: 'LineString', coordinates } }] }),
    };
  };
  fetchImpl.calls = calls;
  return fetchImpl;
}

/** Notification channels that record deliveries instead of sending them. */
export function recordingChannels() {
  const deliveries = [];
  const make = (name, field) => ({
    name,
    configured: true,
    canReach: (r) => Boolean(r[field]),
    send: async (recipient, message) => {
      deliveries.push({ channel: name, to: recipient[field], subject: message.subject, text: message.text });
    },
  });
  return {
    deliveries,
    channels: [make('push', 'device_fcm_token'), make('sms', 'phone_number'), make('telegram', 'telegram_chat_id'), make('email', 'email')],
  };
}

export async function buildTestContainer(databaseUrl, { clock = testClock(), fetch = fakeOsrmFetch(), configExtra } = {}) {
  const config = testConfig(databaseUrl, configExtra);
  const recorder = recordingChannels();
  const container = await createContainer(config, {
    clock,
    fetch,
    channels: recorder.channels,
    logger: (await import('pino')).default({ level: 'silent' }),
  });
  return { ...container, clock, deliveries: recorder.deliveries };
}

export async function signToken({ sub, email, expiresInSeconds = 3600 }) {
  return new SignJWT({ email, role: 'authenticated' })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(sub)
    .setAudience('authenticated')
    .setIssuedAt()
    .setExpirationTime(Math.floor(Date.now() / 1000) + expiresInSeconds)
    .sign(new TextEncoder().encode(JWT_SECRET));
}

/** Creates a Supabase Auth user (the signup trigger creates the app_user profile). */
export async function createUser(pool, { name = 'Test Student', email, phone = '+60123456789', confirmed = true } = {}) {
  const id = randomUUID();
  const mail = email ?? `student.${id.slice(0, 8)}@student.usm.my`;
  await pool.query(
    `insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data) values ($1, $2, $3, $4)`,
    [id, mail, confirmed ? new Date() : null, { full_name: name, matric_or_staff_id: '23300000', phone_number: phone }],
  );
  return { id, email: mail, token: await signToken({ sub: id, email: mail }) };
}

export async function createStaff(pool, { email = `officer.${randomUUID().slice(0, 6)}@safewalk.test`, confirmed = true } = {}) {
  await pool.query(`insert into public.security_staff (admin_email, full_name) values ($1, 'Test Officer')`, [email]);
  return createUser(pool, { name: 'Test Officer', email, confirmed });
}

export const CAMPUS = {
  origin: { lat: 5.3561, lng: 100.3021 },
  destination: { lat: 5.3592, lng: 100.3049 },
};
