/**
 * Resolves what a verified Supabase user may do. The staff decision uses the
 * same SQL function as the RLS policies (public.is_security_staff), so the API
 * and the database can never disagree about who is security staff.
 */
export async function resolveIdentity(pool, config, claims) {
  const { rows } = await pool.query(
    `select public.is_security_staff($1) as is_staff,
            (select row_to_json(u) from (
               select user_id, full_name, email from public.app_user where user_id = $1
             ) u) as profile,
            (select staff_id from public.security_staff s
               where lower(s.admin_email) = lower($2) and s.is_active) as staff_id`,
    [claims.userId, claims.email ?? ''],
  );
  const row = rows[0];
  const isStaff = row.is_staff === true;
  const domain = claims.email?.split('@')[1] ?? '';
  const domainAllowed =
    config.allowedUserEmailDomains.length === 0 || config.allowedUserEmailDomains.includes(domain);

  return {
    userId: claims.userId,
    email: claims.email,
    expiresAt: claims.expiresAt,
    isStaff,
    staffId: isStaff ? row.staff_id : null,
    // A student/staff app user needs a profile row and an allowed email domain.
    isAppUser: Boolean(row.profile) && domainAllowed,
    profile: row.profile,
  };
}
