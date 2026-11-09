import { API_URL } from './config.js';

export class ApiError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

/** Authenticated request to the SafeWalk server with the staff member's Supabase token. */
export async function apiRequest(method, path, accessToken, { body, signal } = {}) {
  let res;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method,
      signal,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (err) {
    if (err.name === 'AbortError') throw err;
    throw new ApiError(0, 'NETWORK', 'Cannot reach the SafeWalk server');
  }
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const details = json.error?.details?.map((d) => `${d.path}: ${d.message}`).join('; ');
    throw new ApiError(res.status, json.error?.code ?? 'ERROR', [json.error?.message ?? 'Request failed', details].filter(Boolean).join(' - '));
  }
  return json;
}

export const apiGet = (path, accessToken, signal) => apiRequest('GET', path, accessToken, { signal });
