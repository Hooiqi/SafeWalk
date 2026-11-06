import { API_URL } from './config.js';

export class TrackingError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

export async function fetchTrackingView(token, signal) {
  let res;
  try {
    res = await fetch(`${API_URL}/api/track/${encodeURIComponent(token)}`, { signal, cache: 'no-store' });
  } catch (err) {
    if (err.name === 'AbortError') throw err;
    throw new TrackingError('NETWORK', 'Could not reach SafeWalk. Check your connection.');
  }
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new TrackingError(body.error?.code ?? 'ERROR', body.error?.message ?? 'Something went wrong');
  }
  return body;
}
