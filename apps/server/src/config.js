import { z } from 'zod';

// Environment configuration. Every external service is optional so the
// server can run in development without credentials; disabled channels are
// reported as "not configured" rather than pretending to succeed.

const emptyToUndefined = (v) => (v === '' ? undefined : v);
const optionalString = z.preprocess(emptyToUndefined, z.string().optional());
const intWithDefault = (def) => z.preprocess(emptyToUndefined, z.coerce.number().int().default(def));

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: intWithDefault(4000),
  LOG_LEVEL: z.string().default('info'),

  // Postgres connection string of the Supabase database (server only, never shipped to clients).
  DATABASE_URL: z.string().min(1),
  DATABASE_SSL: z.preprocess(emptyToUndefined, z.enum(['true', 'false']).default('false')),

  // Supabase Auth token verification: either the project URL (JWKS, current
  // Supabase projects) or the legacy HS256 JWT secret.
  SUPABASE_URL: optionalString,
  SUPABASE_JWT_SECRET: optionalString,

  // Comma-separated list of email domains allowed to use the student/staff app.
  // Empty = any domain (useful for demos).
  ALLOWED_USER_EMAIL_DOMAINS: z.string().default(''),

  // Comma-separated browser origins allowed to call the API (dashboard, tracking page).
  CORS_ORIGINS: z.string().default('http://localhost:5173,http://localhost:5174'),
  // Public base URL of the trusted-contact tracking page; the token is appended.
  TRACKING_PAGE_URL: z.string().url().default('http://localhost:5173/t/'),

  // Routing (proposal: OSRM walking API)
  OSRM_BASE_URL: z.string().url().default('https://routing.openstreetmap.de/routed-foot'),
  OSRM_PROFILE: z.string().default('foot'),
  OSRM_TIMEOUT_MS: intWithDefault(6000),
  MAX_ROUTE_DISTANCE_M: intWithDefault(15000),
  // Walking speed used only when OSRM is unreachable (clearly flagged to users).
  FALLBACK_WALKING_SPEED_MPS: z.preprocess(emptyToUndefined, z.coerce.number().positive().default(1.2)),

  // Watchdog (proposal: node-cron, 3-minute grace period)
  WATCHDOG_CRON: z.string().default('*/5 * * * * *'),
  GRACE_PERIOD_SECONDS: intWithDefault(180),
  HEARTBEAT_STALE_SECONDS: intWithDefault(60),
  ETA_BUFFER_SECONDS: intWithDefault(0),
  MAX_TRIP_EXTENSIONS: intWithDefault(6),
  TRACKING_LINK_TTL_AFTER_END_MINUTES: intWithDefault(30),
  // Development only: replace the OSRM walking time with a short ETA so the
  // grace period and escalation can be demonstrated quickly. Ignored in production.
  DEV_ETA_OVERRIDE_SECONDS: z.preprocess(emptyToUndefined, z.coerce.number().int().positive().optional()),

  // Notification channels (all optional)
  FIREBASE_SERVICE_ACCOUNT_JSON: optionalString,
  TWILIO_ACCOUNT_SID: optionalString,
  TWILIO_AUTH_TOKEN: optionalString,
  TWILIO_FROM_NUMBER: optionalString,
  TELEGRAM_BOT_TOKEN: optionalString,
  SMTP_URL: optionalString,
  SMTP_FROM: z.string().default('SafeWalk <no-reply@safewalk.test>'),
  NOTIFICATION_TIMEOUT_MS: intWithDefault(8000),

  // Module 3: incident reports
  // Supabase Storage for report photos (server only; never shipped to clients).
  SUPABASE_SERVICE_ROLE_KEY: optionalString,
  // Development only: keep photos in this folder when Supabase Storage is not configured.
  PHOTO_STORAGE_DIR: optionalString,
  MAX_PHOTO_BYTES: intWithDefault(5 * 1024 * 1024),
  PHOTO_UPLOAD_WINDOW_MINUTES: intWithDefault(30),
  INCIDENT_REPORTS_PER_HOUR: intWithDefault(10),
  // Burst limit on the report and photo endpoints (requests per minute per user).
  INCIDENT_REQUESTS_PER_MINUTE: intWithDefault(10),
});

const splitList = (value) =>
  value
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

export function loadConfig(env = process.env) {
  const parsed = schema.safeParse(env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('\n  ');
    throw new Error(`Invalid server configuration:\n  ${issues}`);
  }
  const c = parsed.data;
  if (!c.SUPABASE_URL && !c.SUPABASE_JWT_SECRET) {
    throw new Error('Set SUPABASE_URL (JWKS verification) or SUPABASE_JWT_SECRET to verify Supabase Auth tokens.');
  }
  return {
    ...c,
    isProduction: c.NODE_ENV === 'production',
    allowedUserEmailDomains: splitList(c.ALLOWED_USER_EMAIL_DOMAINS).map((d) => d.toLowerCase()),
    corsOrigins: splitList(c.CORS_ORIGINS),
    devEtaOverrideSeconds: c.NODE_ENV === 'production' ? undefined : c.DEV_ETA_OVERRIDE_SECONDS,
  };
}
