-- SafeWalk core schema: users, security staff allow-list, Module 1 tables
-- and the shared emergency alert tables that Module 1 escalates into.
--
-- Tables follow the ERD in the CAT304 G12 proposal (Diagram 12.5).
-- Columns that are NOT in the ERD are marked "ERD extension" and are listed
-- in docs/database.md together with the reason for adding them.
--
-- Tables for Module 2 (safe_point), Module 3 (incident_group, incident_report)
-- and Module 4 (announcement) are added by their own migrations when those
-- modules are built.

create extension if not exists postgis with schema extensions;

-- ---------------------------------------------------------------------------
-- Enumerations
-- ---------------------------------------------------------------------------

-- Trip finite-state machine (proposal 5.2.3 2A: Active, Grace Prompt, Escalated)
-- plus the two normal terminal states.
create type public.trip_status as enum (
  'ACTIVE',
  'GRACE_PROMPT',
  'ESCALATED',
  'COMPLETED',
  'CANCELLED'
);

-- Why a trip left the monitored states (ERD extension).
create type public.trip_end_reason as enum (
  'ARRIVED',          -- user tapped "Arrived safely"
  'SAFE_CONFIRMED',   -- user answered the grace prompt / escalation with "I am safe"
  'CANCELLED'         -- user cancelled while the trip was ACTIVE
);

-- ERD: SOS_ALERT.trigger_type ENUM(HOLD, SILENT, ETA)
create type public.sos_trigger_type as enum ('HOLD', 'SILENT', 'ETA');

-- ERD: SOS_ALERT.status ENUM(RECEIVED, ON_WAY, ...). Module 4 workflow:
-- Received Alert -> On the Way -> Arrived at Location -> Resolved.
-- 'NEW' (ERD extension) marks an alert no security officer has acknowledged
-- yet, so the dashboard knows when to keep sounding the alarm.
create type public.alert_status as enum (
  'NEW',
  'RECEIVED',
  'ON_THE_WAY',
  'ARRIVED',
  'RESOLVED'
);

-- ---------------------------------------------------------------------------
-- USER  (named app_user because "user" is a reserved word in PostgreSQL)
-- ---------------------------------------------------------------------------
create table public.app_user (
  user_id            uuid primary key references auth.users (id) on delete cascade,
  full_name          varchar(120) not null check (length(trim(full_name)) > 0),
  matric_or_staff_id varchar(32),
  phone_number       varchar(20) check (phone_number is null or phone_number ~ '^\+[1-9][0-9]{6,14}$'),
  email              varchar(254) not null,
  device_fcm_token   text,
  created_at         timestamptz not null default now()
);

create unique index app_user_email_key on public.app_user (lower(email));

-- ---------------------------------------------------------------------------
-- SECURITY_STAFF  (admin email allow-list, proposal 5.2.3 4A)
-- ---------------------------------------------------------------------------
create table public.security_staff (
  staff_id     uuid primary key default gen_random_uuid(),
  admin_email  varchar(254) not null,
  full_name    varchar(120) not null,
  role         varchar(32) not null default 'SECURITY_OFFICER'
               check (role in ('SECURITY_OFFICER', 'SECURITY_ADMIN')),
  badge_no     varchar(32),
  last_login   timestamptz,
  is_active    boolean not null default true,          -- ERD extension
  created_at   timestamptz not null default now()      -- ERD extension
);

create unique index security_staff_admin_email_key on public.security_staff (lower(admin_email));

-- ---------------------------------------------------------------------------
-- TRUSTED_CONTACT
-- Trusted contacts are people outside the app (proposal: they do not need to
-- install it). At least one delivery channel is required.
-- ---------------------------------------------------------------------------
create table public.trusted_contact (
  contact_id       uuid primary key default gen_random_uuid(),
  user_id          uuid not null references public.app_user (user_id) on delete cascade,
  contact_name     varchar(120) not null check (length(trim(contact_name)) > 0),
  phone_number     varchar(20) check (phone_number is null or phone_number ~ '^\+[1-9][0-9]{6,14}$'),
  telegram_chat_id varchar(64),
  email            varchar(254) check (email is null or email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  created_at       timestamptz not null default now(),  -- ERD extension
  constraint trusted_contact_has_channel
    check (phone_number is not null or telegram_chat_id is not null or email is not null)
);

create index trusted_contact_user_idx on public.trusted_contact (user_id);

-- ---------------------------------------------------------------------------
-- TRIP
-- ---------------------------------------------------------------------------
create table public.trip (
  trip_id            uuid primary key default gen_random_uuid(),
  user_id            uuid not null references public.app_user (user_id) on delete cascade,
  origin_geom        extensions.geography(Point, 4326) not null,
  dest_geom          extensions.geography(Point, 4326) not null,
  route_line         extensions.geography(LineString, 4326),
  eta_deadline       timestamptz not null,
  grace_expires_at   timestamptz,
  last_heartbeat_at  timestamptz,
  status             public.trip_status not null default 'ACTIVE',
  share_token        varchar(64) not null unique,
  started_at         timestamptz not null default now(),
  -- ERD extensions ---------------------------------------------------------
  destination_label  varchar(120),
  route_distance_m   integer check (route_distance_m >= 0),
  route_duration_s   integer check (route_duration_s >= 0),
  route_source       varchar(24) not null default 'OSRM'
                     check (route_source in ('OSRM', 'STRAIGHT_LINE_ESTIMATE')),
  extension_count    integer not null default 0 check (extension_count >= 0),
  signal_lost_at     timestamptz,
  escalated_at       timestamptz,
  ended_at           timestamptz,
  end_reason         public.trip_end_reason,
  share_expires_at   timestamptz,
  updated_at         timestamptz not null default now(),
  constraint trip_grace_requires_deadline
    check (status <> 'GRACE_PROMPT' or grace_expires_at is not null),
  constraint trip_terminal_has_end
    check ((status in ('COMPLETED', 'CANCELLED')) = (ended_at is not null))
);

-- A user can have at most one open (monitored) trip at a time.
create unique index trip_one_open_per_user
  on public.trip (user_id)
  where status in ('ACTIVE', 'GRACE_PROMPT', 'ESCALATED');

-- Watchdog scans: only open trips, ordered by the deadline it is waiting for.
create index trip_watchdog_active_idx on public.trip (eta_deadline) where status = 'ACTIVE';
create index trip_watchdog_grace_idx on public.trip (grace_expires_at) where status = 'GRACE_PROMPT';
create index trip_user_started_idx on public.trip (user_id, started_at desc);

-- Which of the user's trusted contacts were chosen for a trip (ERD extension:
-- the ERD has no table for the per-trip selection the proposal describes).
create table public.trip_trusted_contact (
  trip_id    uuid not null references public.trip (trip_id) on delete cascade,
  contact_id uuid not null references public.trusted_contact (contact_id) on delete cascade,
  primary key (trip_id, contact_id)
);

-- ---------------------------------------------------------------------------
-- LOCATION_LOG
-- ---------------------------------------------------------------------------
create table public.location_log (
  log_id        bigserial primary key,
  trip_id       uuid not null references public.trip (trip_id) on delete cascade,
  coordinates   extensions.geography(Point, 4326) not null,
  battery_level integer check (battery_level between 0 and 100),
  is_heartbeat  boolean not null default false,
  recorded_at   timestamptz not null,
  accuracy_m    real check (accuracy_m >= 0),            -- ERD extension
  received_at   timestamptz not null default now(),      -- ERD extension
  -- The device timestamp identifies a sample, so a resent sample is ignored.
  constraint location_log_trip_sample_key unique (trip_id, recorded_at)
);

create index location_log_trip_time_idx on public.location_log (trip_id, recorded_at desc);

-- ---------------------------------------------------------------------------
-- SOS_ALERT  (shared by Module 1 ETA escalation and Module 2 SOS)
-- ---------------------------------------------------------------------------
create table public.sos_alert (
  alert_id       uuid primary key default gen_random_uuid(),
  user_id        uuid references public.app_user (user_id) on delete set null,
  trip_id        uuid references public.trip (trip_id) on delete set null,
  trigger_type   public.sos_trigger_type not null,
  alert_location extensions.geography(Point, 4326),
  status         public.alert_status not null default 'NEW',
  triggered_at   timestamptz not null default now(),
  resolved_at    timestamptz,
  constraint sos_alert_eta_has_trip check (trigger_type <> 'ETA' or trip_id is not null),
  constraint sos_alert_resolved_time check ((status = 'RESOLVED') = (resolved_at is not null))
);

-- A trip escalates at most once (idempotent watchdog).
create unique index sos_alert_one_eta_per_trip
  on public.sos_alert (trip_id) where trigger_type = 'ETA';
create index sos_alert_open_idx on public.sos_alert (triggered_at desc) where status <> 'RESOLVED';

-- ---------------------------------------------------------------------------
-- ALERT_STATUS_LOG
-- staff_id is null for entries written by the system (e.g. alert creation).
-- ---------------------------------------------------------------------------
create table public.alert_status_log (
  status_log_id   bigserial primary key,
  alert_id        uuid not null references public.sos_alert (alert_id) on delete cascade,
  staff_id        uuid references public.security_staff (staff_id) on delete set null,
  previous_status public.alert_status,
  new_status      public.alert_status not null,
  updated_at      timestamptz not null default now()
);

create index alert_status_log_alert_idx on public.alert_status_log (alert_id, updated_at);

-- Keep trip.updated_at current.
create function public.touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger trip_touch_updated_at
  before update on public.trip
  for each row execute function public.touch_updated_at();
