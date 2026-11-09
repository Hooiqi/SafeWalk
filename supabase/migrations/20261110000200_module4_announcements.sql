-- Module 4: Admin Centralized Security Dashboard (announcements).
-- ERD entity ANNOUNCEMENT (Diagram 5.2): announce_id, staff_id, title,
-- message_body, priority, published_at. Additions beyond the ERD are listed
-- in docs/database.md. Campus safety analytics read the existing tables and
-- need no new ones (see apps/server/src/modules/analytics).

-- ---------------------------------------------------------------------------
-- ANNOUNCEMENT
-- ---------------------------------------------------------------------------
-- Priority (ERD: VARCHAR). INFO = general notice, ADVISORY = take care
-- (e.g. a dark path), URGENT = act now; URGENT is also sent as a push
-- notification. See docs/PLAN.md A25.
create table public.announcement (
  announce_id   uuid primary key default gen_random_uuid(),
  staff_id      uuid references public.security_staff (staff_id) on delete set null,
  title         varchar(120) not null check (length(trim(title)) >= 3),
  message_body  text not null check (length(trim(message_body)) between 1 and 2000),
  priority      varchar(16) not null default 'INFO'
                check (priority in ('INFO', 'ADVISORY', 'URGENT')),
  -- When it becomes visible. A future time schedules it.
  published_at  timestamptz not null default now(),
  -- additions
  expires_at    timestamptz,                -- hidden after this time (null = until withdrawn)
  withdrawn_at  timestamptz,                -- taken down early by security
  withdrawn_by  uuid references public.security_staff (staff_id) on delete set null,
  announced_at  timestamptz,                -- when the app was told (socket, and push if URGENT)
  push_summary  jsonb,                      -- push delivery counts, for the dashboard
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  check (expires_at is null or expires_at > published_at)
);

create index announcement_live_idx on public.announcement (published_at desc)
  where withdrawn_at is null;
create index announcement_due_idx on public.announcement (published_at)
  where announced_at is null and withdrawn_at is null;

create trigger announcement_touch_updated_at
  before update on public.announcement
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- The API uses the service role; these policies protect direct access with a
-- user's Supabase session (proposal 5.2.3, 4A).
-- ---------------------------------------------------------------------------
alter table public.announcement enable row level security;

-- Everyone signed in reads live announcements; staff read all of them
-- (scheduled, expired and withdrawn included).
create policy announcement_select_live on public.announcement
  for select to authenticated
  using (
    (withdrawn_at is null and published_at <= now() and (expires_at is null or expires_at > now()))
    or public.is_security_staff(auth.uid())
  );

create policy announcement_insert_staff on public.announcement
  for insert to authenticated
  with check (public.is_security_staff(auth.uid()));

create policy announcement_update_staff on public.announcement
  for update to authenticated
  using (public.is_security_staff(auth.uid()))
  with check (public.is_security_staff(auth.uid()));
