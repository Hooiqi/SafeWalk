-- DEMONSTRATION DATA ONLY.
-- This file is loaded by `supabase db reset` on a LOCAL development database.
-- The account below is a placeholder, not a real USM Security Department
-- officer. Replace it with real allow-listed staff emails in production via
-- the SQL editor; never commit real staff details to the repository.

insert into public.security_staff (admin_email, full_name, role, badge_no)
values ('security.demo@safewalk.test', 'Demo Security Officer (sample)', 'SECURITY_ADMIN', 'DEMO-001')
on conflict do nothing;
