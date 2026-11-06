// Human-readable labels shared by the dashboard components.

export const TRIGGER_LABEL = {
  ETA: 'Overdue journey',
  HOLD: 'SOS (hold to confirm)',
  SILENT: 'Silent SOS',
};

export const ALERT_STATUS_LABEL = {
  NEW: 'Not acknowledged',
  RECEIVED: 'Received',
  ON_THE_WAY: 'On the way',
  ARRIVED: 'Arrived at location',
  RESOLVED: 'Resolved',
};

export function tripStateNote(trip) {
  if (!trip) return null;
  if (trip.status === 'COMPLETED' && trip.end_reason === 'SAFE_CONFIRMED') return { tone: 'done', text: 'User has since confirmed they are safe' };
  if (trip.status === 'COMPLETED') return { tone: 'done', text: 'User has since arrived' };
  if (trip.signal_lost_at) return { tone: 'warning', text: 'No signal from phone' };
  return { tone: 'danger', text: 'No check-in from user' };
}
