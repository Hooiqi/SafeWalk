-- Module 3: Incident Reporting and Safety Map
-- (and the Module 4 report review that Module 3 needs).
-- ERD entities INCIDENT_GROUP and INCIDENT_REPORT (Diagram 5.2); additions
-- beyond the ERD are listed in docs/database.md.

-- ---------------------------------------------------------------------------
-- Types
-- ---------------------------------------------------------------------------
-- Categories: the proposal's examples (stray animals, broken lighting,
-- harassment, suspicious activities) plus theft, unsafe paths and "other".
-- See docs/PLAN.md A21. Mirrored in packages/shared and the Flutter app.
create type public.incident_category as enum (
  'SUSPICIOUS_ACTIVITY',
  'HARASSMENT',
  'THEFT',
  'BROKEN_LIGHTING',
  'STRAY_ANIMAL',
  'UNSAFE_PATH',     -- construction, flooding, broken pavement, blocked walkway
  'OTHER'
);

-- ERD: ENUM(LOW, MED, HIGH). Declared in this order so greatest() and
-- "order by severity_level desc" rank them correctly.
create type public.incident_severity as enum ('LOW', 'MEDIUM', 'HIGH');

-- Proposal: pending, verified, rejected, resolved.
create type public.incident_status as enum ('PENDING', 'VERIFIED', 'REJECTED', 'RESOLVED');

-- ---------------------------------------------------------------------------
-- INCIDENT_GROUP: one incident on the map, made of one or more reports
-- ---------------------------------------------------------------------------
create table public.incident_group (
  group_id          uuid primary key default gen_random_uuid(),
  verified_by       uuid references public.security_staff (staff_id) on delete set null,
  category          public.incident_category not null,
  severity_level    public.incident_severity not null,
  centroid_geom     extensions.geography(Point, 4326) not null,
  report_count      int not null default 1 check (report_count >= 1),
  status            public.incident_status not null default 'PENDING',
  auto_verified     boolean not null default false,
  created_at        timestamptz not null default now(),
  -- additions
  last_reported_at  timestamptz not null default now(),
  reviewed_at       timestamptz,                 -- verified or rejected
  resolved_at       timestamptz,
  public_note       varchar(300),                -- shown to everyone on the map ("Lights repaired")
  staff_note        varchar(500),                -- internal, security only
  updated_at        timestamptz not null default now(),
  check (status <> 'RESOLVED' or resolved_at is not null)
);

create index incident_group_centroid_gix on public.incident_group using gist (centroid_geom);
create index incident_group_status_idx on public.incident_group (status, last_reported_at desc);

-- ---------------------------------------------------------------------------
-- INCIDENT_REPORT: what one person submitted
-- ---------------------------------------------------------------------------
create table public.incident_report (
  report_id       uuid primary key default gen_random_uuid(),
  group_id        uuid not null references public.incident_group (group_id) on delete restrict,
  -- ERD: user_id UUID (NULLABLE). Null when the report is anonymous: the
  -- reporter is then known only through incident_report_owner, which
  -- security staff cannot read (see A20).
  user_id         uuid references public.app_user (user_id) on delete set null,
  is_anonymous    boolean not null default false,
  description     text not null check (length(trim(description)) between 1 and 1000),
  photo_url       text,                          -- Storage object path, never a public URL
  report_geom     extensions.geography(Point, 4326) not null,
  submitted_at    timestamptz not null default now(),
  -- additions
  category        public.incident_category not null,  -- what this person chose
  severity_level  public.incident_severity not null,
  accuracy_m      real check (accuracy_m >= 0),
  check (not is_anonymous or user_id is null)
);

create index incident_report_group_idx on public.incident_report (group_id, submitted_at);
create index incident_report_geom_gix on public.incident_report using gist (report_geom);

-- Private link from every report (anonymous or not) to the account that sent
-- it. Used only by the server to show "My reports", to stop one person from
-- verifying an incident alone, and to rate-limit. Not readable by staff.
create table public.incident_report_owner (
  report_id          uuid primary key references public.incident_report (report_id) on delete cascade,
  user_id            uuid not null references public.app_user (user_id) on delete cascade,
  client_request_id  uuid,                        -- idempotency key sent by the app
  created_at         timestamptz not null default now()
);

create index incident_report_owner_user_idx on public.incident_report_owner (user_id, created_at desc);
create unique index incident_report_owner_request_key on public.incident_report_owner (user_id, client_request_id)
  where client_request_id is not null;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- The API uses the service role; these policies protect direct access with a
-- user's Supabase session (proposal 5.2.3, 4A).
-- ---------------------------------------------------------------------------
alter table public.incident_group        enable row level security;
alter table public.incident_report       enable row level security;
alter table public.incident_report_owner enable row level security;

-- Everyone signed in sees verified incidents (the shared map); staff see all.
create policy incident_group_select_verified on public.incident_group
  for select to authenticated
  using (status = 'VERIFIED' or public.is_security_staff(auth.uid()));

create policy incident_group_update_staff on public.incident_group
  for update to authenticated
  using (public.is_security_staff(auth.uid()))
  with check (public.is_security_staff(auth.uid()));

-- Reports: the person who sent it, and security staff.
create policy incident_report_select_own on public.incident_report
  for select to authenticated
  using (exists (select 1 from public.incident_report_owner o
                  where o.report_id = incident_report.report_id and o.user_id = auth.uid()));

create policy incident_report_select_staff on public.incident_report
  for select to authenticated
  using (public.is_security_staff(auth.uid()));

-- The owner link: only its owner. No staff policy, by design.
create policy incident_report_owner_select_own on public.incident_report_owner
  for select to authenticated
  using (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Supabase Storage bucket for report photos (private: staff view them through
-- the API). Skipped on a plain PostgreSQL database without Storage.
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'storage' and table_name = 'buckets') then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('incident-photos', 'incident-photos', false, 5242880, array['image/jpeg', 'image/png'])
    on conflict (id) do nothing;
  end if;
end;
$$;
