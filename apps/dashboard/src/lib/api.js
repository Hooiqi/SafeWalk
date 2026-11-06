import { API_URL } from './config.js';

export class ApiError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

/** Authenticated request to the SafeWalk server with the staff member's Supabase token. */
export async function apiGet(path, accessToken, signal) {
  let res;
  try {
    res = await fetch(`${API_URL}${path}`, { headers: { Authorization: `Bearer ${accessToken}` }, signal });
  } catch (err) {
    if (err.name === 'AbortError') throw err;
    throw new ApiError(0, 'NETWORK', 'Cannot reach the SafeWalk server');
  }
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, body.error?.code ?? 'ERROR', body.error?.message ?? 'Request failed');
  return body;
}
