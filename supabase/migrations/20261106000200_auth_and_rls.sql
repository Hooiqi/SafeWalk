-- Supabase Auth integration and Row Level Security.
--
-- Access model (proposal 5.2.3 4A, Module 4 "Role-Based Staff Login"):
--   * Students and staff (app users) see only their own rows.
--   * Security staff are identified by an email allow-list (security_staff),
--     matched against a CONFIRMED Supabase Auth email.
--   * Trusted contacts never touch the database directly. They read a single
--     trip through the Node server using the trip's share token.
--   * Trips, location logs and alerts are written only by the Node server
--     (service connection), so clients get no INSERT/UPDATE/DELETE policies
--     on them. RLS is defence in depth for anyone using the public anon key.

-- ---------------------------------------------------------------------------
-- Create an app_user profile when someone signs up with Supabase Auth.
-- The mobile app passes full_name, matric_or_staff_id and phone_number as
-- user metadata in supabase.auth.signUp().
-- ---------------------------------------------------------------------------
create function public.handle_new_auth_user() returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  phone text := nullif(trim(meta ->> 'phone_number'), '');
begin
  -- Security staff accounts are allow-listed separately and get no profile.
  if exists (select 1 from public.security_staff s where lower(s.admin_email) = lower(new.email)) then
    return new;
  end if;

  insert into public.app_user (user_id, full_name, matric_or_staff_id, phone_number, email)
  values (
    new.id,
    coalesce(nullif(trim(meta ->> 'full_name'), ''), split_part(new.email, '@', 1)),
    nullif(trim(meta ->> 'matric_or_staff_id'), ''),
    case when phone ~ '^\+[1-9][0-9]{6,14}$' then phone end,
    new.email
  )
  on conflict (user_id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();

-- ---------------------------------------------------------------------------
-- Role check used by both RLS and the Node server.
-- ---------------------------------------------------------------------------
create function public.is_security_staff(uid uuid) returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.security_staff s
    join auth.users u on lower(u.email) = lower(s.admin_email)
    where u.id = uid
      and u.email_confirmed_at is not null
      and s.is_active
  );
$$;

revoke all on function public.is_security_staff(uuid) from public;
grant execute on function public.is_security_staff(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Enable RLS on every table
-- ---------------------------------------------------------------------------
alter table public.app_user             enable row level security;
alter table public.security_staff       enable row level security;
alter table public.trusted_contact      enable row level security;
alter table public.trip                 enable row level security;
alter table public.trip_trusted_contact enable row level security;
alter table public.location_log         enable row level security;
alter table public.sos_alert            enable row level security;
alter table public.alert_status_log     enable row level security;

-- app_user ------------------------------------------------------------------
create policy app_user_select_own on public.app_user
  for select to authenticated
  using (user_id = auth.uid() or public.is_security_staff(auth.uid()));

create policy app_user_update_own on public.app_user
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- security_staff --------------------------------------------------------------
-- Staff can see the staff list; nobody can change it from a client.
create policy security_staff_select on public.security_staff
  for select to authenticated
  using (public.is_security_staff(auth.uid()));

-- trusted_contact -------------------------------------------------------------
create policy trusted_contact_owner_all on public.trusted_contact
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- trip ------------------------------------------------------------------------
create policy trip_select_own on public.trip
  for select to authenticated
  using (user_id = auth.uid());

-- Security staff only see trips that became emergencies.
create policy trip_select_staff_escalated on public.trip
  for select to authenticated
  using (
    public.is_security_staff(auth.uid())
    and (status = 'ESCALATED' or escalated_at is not null)
  );

-- trip_trusted_contact ----------------------------------------------------------
create policy trip_trusted_contact_select_own on public.trip_trusted_contact
  for select to authenticated
  using (exists (select 1 from public.trip t where t.trip_id = trip_trusted_contact.trip_id and t.user_id = auth.uid()));

-- location_log ------------------------------------------------------------------
create policy location_log_select_own on public.location_log
  for select to authenticated
  using (exists (select 1 from public.trip t where t.trip_id = location_log.trip_id and t.user_id = auth.uid()));

create policy location_log_select_staff_escalated on public.location_log
  for select to authenticated
  using (
    public.is_security_staff(auth.uid())
    and exists (select 1 from public.trip t where t.trip_id = location_log.trip_id and t.escalated_at is not null)
  );

-- sos_alert ---------------------------------------------------------------------
create policy sos_alert_select_own on public.sos_alert
  for select to authenticated
  using (user_id = auth.uid());

create policy sos_alert_select_staff on public.sos_alert
  for select to authenticated
  using (public.is_security_staff(auth.uid()));

create policy sos_alert_update_staff on public.sos_alert
  for update to authenticated
  using (public.is_security_staff(auth.uid()))
  with check (public.is_security_staff(auth.uid()));

-- alert_status_log ------------------------------------------------------------------
create policy alert_status_log_select_staff on public.alert_status_log
  for select to authenticated
  using (public.is_security_staff(auth.uid()));

create policy alert_status_log_select_own on public.alert_status_log
  for select to authenticated
  using (exists (select 1 from public.sos_alert a where a.alert_id = alert_status_log.alert_id and a.user_id = auth.uid()));

create policy alert_status_log_insert_staff on public.alert_status_log
  for insert to authenticated
  with check (
    public.is_security_staff(auth.uid())
    and staff_id in (
      select s.staff_id from public.security_staff s
      join auth.users u on lower(u.email) = lower(s.admin_email)
      where u.id = auth.uid()
    )
  );

-- The anon role (public key, not signed in) gets no policies at all, so it
-- can read nothing. Trusted-contact tracking goes through the Node server.
