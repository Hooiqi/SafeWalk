-- LOCAL TESTING ONLY. Never run this against a Supabase project.
--
-- Recreates the small part of Supabase that SafeWalk's migrations rely on,
-- so migrations and RLS policies can be tested on a plain PostgreSQL + PostGIS
-- server (used by the automated test suite and CI):
--   * the anon / authenticated / service_role roles
--   * auth.users with the columns we read
--   * auth.uid() and auth.jwt(), implemented the same way Supabase does
--     (from the request.jwt.claims setting)

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;
end $$;

create schema if not exists extensions;
create schema if not exists auth;

create table if not exists auth.users (
  id uuid primary key default gen_random_uuid(),
  email varchar(255),
  email_confirmed_at timestamptz,
  raw_user_meta_data jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);

create or replace function auth.jwt() returns jsonb language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb
$$;

create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(auth.jwt() ->> 'sub', '')::uuid
$$;

grant usage on schema public, extensions, auth to anon, authenticated, service_role;
grant execute on function auth.uid(), auth.jwt() to anon, authenticated;

-- Supabase grants table privileges to these roles by default and relies on
-- RLS to restrict rows. Mirror that so the policies are what we test.
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;

-- Supabase puts the extensions schema on the default search_path.
do $$
begin
  execute format('alter database %I set search_path = "$user", public, extensions', current_database());
end $$;
