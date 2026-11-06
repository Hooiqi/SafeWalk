// DEMONSTRATION TOOL. Simulates a phone on a SafeWalk journey so the trusted
// contact page, the ETA watchdog and the security dashboard can be shown
// without walking across campus. It signs in to Supabase Auth as an existing
// test account and calls the same API the mobile app uses.
//
//   npm run simulate-walk -w @safewalk/server -- \
//     --email you@student.usm.my --password '...' --steps 6 [--stop-after 3]
//
// --stop-after N stops sending positions after N steps (as if the phone died),
// so with DEV_ETA_OVERRIDE_SECONDS set the watchdog escalates the trip.
// Env: SUPABASE_URL, SUPABASE_ANON_KEY, API_URL (default http://localhost:4000).
import { parseArgs } from 'node:util';

const { values: args } = parseArgs({
  options: {
    email: { type: 'string' },
    password: { type: 'string' },
    steps: { type: 'string', default: '8' },
    'interval-ms': { type: 'string', default: '4000' },
    'stop-after': { type: 'string' },
    'from-lat': { type: 'string', default: '5.35610' },
    'from-lng': { type: 'string', default: '100.30210' },
    'to-lat': { type: 'string', default: '5.35920' },
    'to-lng': { type: 'string', default: '100.30490' },
  },
});

const API = process.env.API_URL ?? 'http://localhost:4000';
const { SUPABASE_URL, SUPABASE_ANON_KEY } = process.env;
if (!args.email || !args.password || !SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error('Need --email, --password and SUPABASE_URL / SUPABASE_ANON_KEY in the environment.');
  process.exit(1);
}

async function signIn() {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: args.email, password: args.password }),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(`Sign-in failed: ${body.error_description ?? body.msg ?? res.status}`);
  return body.access_token;
}

const token = await signIn();
async function api(method, path, body) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) throw new Error(`${method} ${path}: ${json?.error?.message ?? res.status}`);
  return json;
}

const from = { lat: Number(args['from-lat']), lng: Number(args['from-lng']) };
const to = { lat: Number(args['to-lat']), lng: Number(args['to-lng']) };

const contacts = await api('GET', '/api/contacts');
if (contacts.length === 0) throw new Error('Add a trusted contact to this account first.');

let { trip } = await api('GET', '/api/trips/active');
if (!trip) {
  trip = await api('POST', '/api/trips', {
    origin: from,
    destination: to,
    destination_label: 'Simulated destination',
    contact_ids: [contacts[0].contact_id],
  });
  console.log(`Started trip ${trip.trip_id}, ETA ${trip.eta_deadline}`);
} else {
  console.log(`Continuing open trip ${trip.trip_id} (${trip.status})`);
}
console.log(`Trusted-contact link: ${trip.tracking_url}`);

const steps = Number(args.steps);
const stopAfter = args['stop-after'] ? Number(args['stop-after']) : steps;
for (let i = 1; i <= stopAfter; i++) {
  const f = i / steps;
  const sample = {
    lat: from.lat + (to.lat - from.lat) * f,
    lng: from.lng + (to.lng - from.lng) * f,
    recorded_at: new Date().toISOString(),
    battery_level: Math.max(5, 80 - i),
    accuracy_m: 8,
  };
  const r = await api('POST', `/api/trips/${trip.trip_id}/locations`, { samples: [sample] });
  console.log(`step ${i}/${steps}: ${sample.lat.toFixed(5)}, ${sample.lng.toFixed(5)} accepted=${r.accepted}`);
  await new Promise((r) => setTimeout(r, Number(args['interval-ms'])));
}

if (stopAfter < steps) {
  console.log('Stopped sending (simulated dead phone). Watch the dashboard for the escalation.');
} else {
  const done = await api('POST', `/api/trips/${trip.trip_id}/arrive`);
  console.log(`Arrived: trip ${done.status}`);
}
