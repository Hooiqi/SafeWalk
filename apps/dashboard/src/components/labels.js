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
  STUDY_AREA: 'Study area or library',
  RESIDENTIAL_COLLEGE: 'Residential college',
  PUBLIC_BUILDING: 'Public building',
  POLICE_STATION: 'Police station',
};

/** Dusk signals: periwinkle for handled or safe, apricot for open or waiting. */
export const statusTone = (status) => (status === 'NEW' ? 'open' : 'done');

/** One-line situation summary for an alert. */
export function alertStateNote(alert) {
  if (alert.status === 'RESOLVED') return { tone: 'done', text: `Resolved at ${formatTime(alert.resolved_at)}` };
  if (alert.user_safe_at) return { tone: 'done', text: `Marked themselves safe at ${formatTime(alert.user_safe_at)}` };
  const trip = alert.trip;
  if (alert.trigger_type === 'ETA' && trip) {
    if (trip.status === 'COMPLETED' && trip.end_reason === 'SAFE_CONFIRMED') return { tone: 'done', text: 'Has since confirmed they are safe' };
    if (trip.status === 'COMPLETED') return { tone: 'done', text: 'The journey has ended' };
    if (trip.signal_lost_at) return { tone: 'open', text: 'No signal from the phone' };
    return { tone: 'open', text: 'No check-in after the arrival time' };
  }
  if (alert.trigger_type === 'SILENT') return { tone: 'open', text: 'Silent SOS: may not be able to talk' };
  return { tone: 'open', text: 'SOS raised by the person' };
}

// ---- Module 3: incident reports -------------------------------------------

export const INCIDENT_CATEGORY_LABEL = {
  SUSPICIOUS_ACTIVITY: 'Suspicious activity',
  HARASSMENT: 'Harassment',
  THEFT: 'Theft',
  BROKEN_LIGHTING: 'Broken lighting',
  STRAY_ANIMAL: 'Stray animal',
  UNSAFE_PATH: 'Unsafe path',
  OTHER: 'Other',
};

export const SEVERITY_LABEL = { LOW: 'Low', MEDIUM: 'Medium', HIGH: 'High' };

export const INCIDENT_STATUS_LABEL = {
  PENDING: 'Pending review',
  VERIFIED: 'Verified, on the map',
  REJECTED: 'Rejected',
  RESOLVED: 'Resolved',
};

export const INCIDENT_STATUS_SHORT = { PENDING: 'Pending', VERIFIED: 'On the map', REJECTED: 'Rejected', RESOLVED: 'Resolved' };

/** Pending needs security (apricot); verified is handled (periwinkle); closed ones are quiet. */
export const incidentTone = (status) => (status === 'PENDING' ? 'open' : status === 'VERIFIED' ? 'done' : '');
