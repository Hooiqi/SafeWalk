// Human-readable labels shared by the dashboard components.
import { formatTime } from '@safewalk/shared';

export const TRIGGER_LABEL = {
  ETA: 'Overdue journey',
  HOLD: 'SOS',
  SILENT: 'Silent SOS',
};

export const ALERT_STATUS_LABEL = {
  NEW: 'Not acknowledged',
  RECEIVED: 'Received',
  ON_THE_WAY: 'On the way',
  ARRIVED: 'Arrived at location',
  RESOLVED: 'Resolved',
};

/** Button text for moving an alert to each response status. */
export const ACTION_LABEL = {
  RECEIVED: 'Received alert',
  ON_THE_WAY: 'On the way',
  ARRIVED: 'Arrived at location',
  RESOLVED: 'Resolved',
};

export const CATEGORY_LABEL = {
  SECURITY_POST: 'Security post',
  MEDICAL: 'Medical',
  STUDY_AREA: 'Study area / library',
  RESIDENTIAL_COLLEGE: 'Residential college',
  PUBLIC_BUILDING: 'Public building',
  POLICE_STATION: 'Police station',
};

/** One-line situation summary for an alert. */
export function alertStateNote(alert) {
  if (alert.status === 'RESOLVED') return { tone: 'done', text: `Resolved at ${formatTime(alert.resolved_at)}` };
  if (alert.user_safe_at) return { tone: 'done', text: `User marked themselves safe at ${formatTime(alert.user_safe_at)}` };
  const trip = alert.trip;
  if (alert.trigger_type === 'ETA' && trip) {
    if (trip.status === 'COMPLETED' && trip.end_reason === 'SAFE_CONFIRMED') return { tone: 'done', text: 'User has since confirmed they are safe' };
    if (trip.status === 'COMPLETED') return { tone: 'done', text: 'Journey has ended' };
    if (trip.signal_lost_at) return { tone: 'warning', text: 'No signal from phone' };
    return { tone: 'danger', text: 'No check-in from user' };
  }
  if (alert.trigger_type === 'SILENT') return { tone: 'danger', text: 'Silent SOS: the person may not be able to talk' };
  return { tone: 'danger', text: 'SOS raised by the user' };
}
