import { useEffect, useState } from 'react';
import { apiGet } from './api.js';
import { supabase } from './supabase.js';

/**
 * Supabase session + server-side staff check. Hiding routes is not the
 * security boundary: the server and RLS reject non-staff regardless. This
 * hook only decides what to render.
 */
export function useAuth() {
  const [session, setSession] = useState(undefined); // undefined = loading
  const [staff, setStaff] = useState(null);
  const [staffError, setStaffError] = useState(null);
  const [notice, setNotice] = useState(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);

  const accessToken = session?.access_token;
  useEffect(() => {
    if (!accessToken) {
      setStaff(null);
      setStaffError(null);
      return;
    }
    const controller = new AbortController();
    apiGet('/api/staff/me', accessToken, controller.signal)
      .then((me) => {
        setStaff(me);
        setStaffError(null);
      })
      .catch((err) => {
        if (err.name === 'AbortError') return;
        if (err.status === 403) {
          // Signed in with Supabase but not allow-listed: end the session.
          setNotice('This account is not on the USM Security staff allow-list, or its email has not been confirmed.');
          supabase.auth.signOut();
        } else {
          setStaffError(err);
        }
      });
    return () => controller.abort();
  }, [accessToken]);

  return {
    loading: session === undefined || (session && !staff && !staffError),
    session,
    staff,
    staffError,
    notice,
    signOut: () => supabase.auth.signOut(),
  };
}
