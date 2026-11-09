// Display helpers shared by the React apps. Times are stored in UTC and
// shown in Malaysia time.

const TIME_ZONE = 'Asia/Kuala_Lumpur';

const timeFmt = new Intl.DateTimeFormat('en-MY', { timeZone: TIME_ZONE, hour: '2-digit', minute: '2-digit' });
const dateTimeFmt = new Intl.DateTimeFormat('en-MY', {
  timeZone: TIME_ZONE,
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
});

export const formatTime = (iso) => (iso ? timeFmt.format(new Date(iso)) : 'Not recorded');
export const formatDateTime = (iso) => (iso ? dateTimeFmt.format(new Date(iso)) : 'Not recorded');

/** "8 min", "1 h 05 min", "45 s" */
export function formatDuration(seconds) {
  const s = Math.max(0, Math.round(seconds));
  if (s < 60) return `${s} s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min`;
  return `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')} min`;
}

/** "12 s ago", "3 min ago" relative to `now` (ms). */
export function formatAgo(iso, now = Date.now()) {
  if (!iso) return 'never';
  const s = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
  if (s < 5) return 'just now';
  return `${formatDuration(s)} ago`;
}

export function formatDistance(m) {
  if (m == null) return 'Unknown';
  return m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(1)} km`;
}
