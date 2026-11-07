-- Module 2: Emergency SOS and Safe Point Navigator
-- (also the Module 4 alert-response workflow that SOS alerts need).
-- ERD extensions are listed in docs/database.md.

-- ---------------------------------------------------------------------------
-- SOS alerts
-- ---------------------------------------------------------------------------
alter table public.sos_alert
  add column client_request_id uuid,            -- idempotency key sent by the app
  add column accuracy_m real check (accuracy_m >= 0),
  add column share_token varchar(64) unique,    -- live link for trusted contacts
  add column share_expires_at timestamptz,
  add column user_safe_at timestamptz;          -- user reported they are safe

-- A retried request (same key) never creates a second alert.
create unique index sos_alert_request_key on public.sos_alert (user_id, client_request_id)
  where client_request_id is not null;

-- At most one open manual SOS per user; pressing SOS again returns it.
create unique index sos_alert_one_open_sos_per_user on public.sos_alert (user_id)
  where trigger_type in ('HOLD', 'SILENT') and status <> 'RESOLVED' and user_safe_at is null;

-- Security staff can record what they arranged ("Patrol 2 dispatched").
alter table public.alert_status_log
  add column note varchar(500);

-- When security resolves an overdue-journey alert the trip is closed too.
alter type public.trip_end_reason add value if not exists 'RESOLVED_BY_SECURITY';

-- ---------------------------------------------------------------------------
-- Location history for SOS alerts raised outside a journey
-- ---------------------------------------------------------------------------
alter table public.location_log
  alter column trip_id drop not null,
  add column alert_id uuid references public.sos_alert (alert_id) on delete cascade,
  add constraint location_log_one_owner check ((trip_id is null) <> (alert_id is null)),
  add constraint location_log_alert_sample_key unique (alert_id, recorded_at);

create index location_log_alert_time_idx on public.location_log (alert_id, recorded_at desc)
  where alert_id is not null;

create policy location_log_select_own_alert on public.location_log
  for select to authenticated
  using (exists (select 1 from public.sos_alert a where a.alert_id = location_log.alert_id and a.user_id = auth.uid()));

create policy location_log_select_staff_alert on public.location_log
  for select to authenticated
  using (alert_id is not null and public.is_security_staff(auth.uid()));

-- ---------------------------------------------------------------------------
-- SAFE_POINT
-- The ERD stores "name_and_category" in one column; name and category are
-- kept separately so the app can filter and colour by category.
-- ---------------------------------------------------------------------------
create type public.safe_point_category as enum (
  'SECURITY_POST',        -- proposal: security posts
  'MEDICAL',              -- proposal: medical assistance points
  'STUDY_AREA',           -- proposal: 24-hour study areas (and libraries)
  'RESIDENTIAL_COLLEGE',  -- proposal: residential college offices
  'PUBLIC_BUILDING',      -- addition: staffed, well-lit public buildings (mosque, sports centre, chancellory)
  'POLICE_STATION'        -- addition: PDRM stations just outside the campus
);

create table public.safe_point (
  safe_point_id        uuid primary key default gen_random_uuid(),
  name                 varchar(160) not null check (length(trim(name)) > 0),
  category             public.safe_point_category not null,
  -- Null until security staff pin it on the map; such points are not used
  -- by the navigator.
  location             extensions.geography(Point, 4326),
  location_description varchar(300),
  -- ERD operating_hours: the text shown to users.
  operating_hours      varchar(300) not null,
  -- Machine-readable schedule used to filter by "open now":
  --   {"always": true}  or  {"weekly": {"mon": [["08:00","17:00"]], ...}}
  -- Times are Malaysia time (UTC+8). A range may cross midnight.
  opening_schedule     jsonb not null check (jsonb_typeof(opening_schedule) = 'object'),
  contact_phone        varchar(20) check (contact_phone is null or contact_phone ~ '^\+[1-9][0-9]{6,14}$'),
  contact_notes        varchar(500),
  notes                varchar(500),
  data_source          varchar(300),
  is_active            boolean not null default true,
  updated_by           uuid references public.security_staff (staff_id) on delete set null,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create index safe_point_location_gist on public.safe_point using gist (location)
  where is_active and location is not null;

create trigger safe_point_touch_updated_at
  before update on public.safe_point
  for each row execute function public.touch_updated_at();

-- Is a schedule open at a given instant? Evaluated in Malaysia time.
-- A range whose end is not after its start (e.g. 22:00-02:00) crosses midnight
-- and also covers the early hours of the next day.
create function public.safe_point_is_open(schedule jsonb, at_time timestamptz)
returns boolean
language plpgsql
stable
as $$
declare
  local_ts   timestamp := at_time at time zone 'Asia/Kuala_Lumpur';
  days       text[] := array['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
  today      text := days[extract(dow from local_ts)::int + 1];
  yesterday  text := days[((extract(dow from local_ts)::int + 6) % 7) + 1];
  t          time := local_ts::time;
  r          jsonb;
  open_t     time;
  close_t    time;
begin
  if coalesce((schedule ->> 'always')::boolean, false) then
    return true;
  end if;
  for r in select * from jsonb_array_elements(coalesce(schedule -> 'weekly' -> today, '[]'::jsonb)) loop
    open_t := (r ->> 0)::time;
    close_t := (r ->> 1)::time;
    if close_t > open_t then
      if t >= open_t and t < close_t then return true; end if;
    elsif t >= open_t then  -- crosses midnight: today's part
      return true;
    end if;
  end loop;
  for r in select * from jsonb_array_elements(coalesce(schedule -> 'weekly' -> yesterday, '[]'::jsonb)) loop
    open_t := (r ->> 0)::time;
    close_t := (r ->> 1)::time;
    if close_t <= open_t and t < close_t then  -- yesterday's range spilling past midnight
      return true;
    end if;
  end loop;
  return false;
end;
$$;

alter table public.safe_point enable row level security;

create policy safe_point_select_active on public.safe_point
  for select to authenticated
  using (is_active or public.is_security_staff(auth.uid()));

create policy safe_point_staff_insert on public.safe_point
  for insert to authenticated
  with check (public.is_security_staff(auth.uid()));

create policy safe_point_staff_update on public.safe_point
  for update to authenticated
  using (public.is_security_staff(auth.uid()))
  with check (public.is_security_staff(auth.uid()));
