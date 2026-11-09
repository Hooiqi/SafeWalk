// Values shared by the Node server and the React apps.
// The Flutter app mirrors these in apps/mobile/lib/core/constants.dart;
// change both together.

export const TRIP_STATUS = Object.freeze({
  ACTIVE: 'ACTIVE',
  GRACE_PROMPT: 'GRACE_PROMPT',
  ESCALATED: 'ESCALATED',
  COMPLETED: 'COMPLETED',
  CANCELLED: 'CANCELLED',
});

/** Trips the watchdog is still responsible for. */
export const OPEN_TRIP_STATUSES = Object.freeze([
  TRIP_STATUS.ACTIVE,
  TRIP_STATUS.GRACE_PROMPT,
  TRIP_STATUS.ESCALATED,
]);

export const TRIP_END_REASON = Object.freeze({
  ARRIVED: 'ARRIVED',
  SAFE_CONFIRMED: 'SAFE_CONFIRMED',
  CANCELLED: 'CANCELLED',
  RESOLVED_BY_SECURITY: 'RESOLVED_BY_SECURITY',
});

export const ALERT_TRIGGER = Object.freeze({
  HOLD: 'HOLD',
  SILENT: 'SILENT',
  ETA: 'ETA',
});

export const ALERT_STATUS = Object.freeze({
  NEW: 'NEW',
  RECEIVED: 'RECEIVED',
  ON_THE_WAY: 'ON_THE_WAY',
  ARRIVED: 'ARRIVED',
  RESOLVED: 'RESOLVED',
});

/** Security response workflow order (proposal Module 4): statuses only move forward. */
export const ALERT_STATUS_ORDER = Object.freeze(['NEW', 'RECEIVED', 'ON_THE_WAY', 'ARRIVED', 'RESOLVED']);

export const SAFE_POINT_CATEGORY = Object.freeze({
  SECURITY_POST: 'SECURITY_POST',
  MEDICAL: 'MEDICAL',
  STUDY_AREA: 'STUDY_AREA',
  RESIDENTIAL_COLLEGE: 'RESIDENTIAL_COLLEGE',
  PUBLIC_BUILDING: 'PUBLIC_BUILDING',
  POLICE_STATION: 'POLICE_STATION',
});

// ---- Module 3: incident reports (see docs/PLAN.md A20, A21) --------------

export const INCIDENT_CATEGORY = Object.freeze({
  SUSPICIOUS_ACTIVITY: 'SUSPICIOUS_ACTIVITY',
  HARASSMENT: 'HARASSMENT',
  THEFT: 'THEFT',
  BROKEN_LIGHTING: 'BROKEN_LIGHTING',
  STRAY_ANIMAL: 'STRAY_ANIMAL',
  UNSAFE_PATH: 'UNSAFE_PATH',
  OTHER: 'OTHER',
});

export const INCIDENT_SEVERITY = Object.freeze({ LOW: 'LOW', MEDIUM: 'MEDIUM', HIGH: 'HIGH' });

export const INCIDENT_STATUS = Object.freeze({
  PENDING: 'PENDING',
  VERIFIED: 'VERIFIED',
  REJECTED: 'REJECTED',
  RESOLVED: 'RESOLVED',
});

/** Proposal Module 3: 3 or more users, within 50 m, over a 30-minute window. */
export const AUTO_VERIFY = Object.freeze({ MIN_REPORTERS: 3, RADIUS_M: 50, WINDOW_MINUTES: 30 });

/** Socket.io event names. Server events carry { event_id, emitted_at, ...data }. */
export const SOCKET_EVENTS = Object.freeze({
  // client -> server
  TRIP_LOCATION: 'trip:location',
  TRIP_HEARTBEAT: 'trip:heartbeat',
  SOS_LOCATION: 'sos:location',
  // server -> client
  TRIP_STATUS: 'trip:status',
  TRIP_GRACE_PROMPT: 'trip:grace_prompt',
  TRIP_POSITION: 'trip:position',
  TRIP_SIGNAL: 'trip:signal',
  ALERT_NEW: 'alert:new',
  ALERT_POSITION: 'alert:position',
  ALERT_STATUS: 'alert:status',
  INCIDENT_NEW: 'incident:new', // staff: a report started a new incident
  INCIDENT_UPDATED: 'incident:updated', // staff: an incident changed (new report, review, merge)
  INCIDENT_STATUS: 'incident:status', // reporter: the status of one of their reports changed
  INCIDENT_MAP: 'incident:map', // every app user: verified pins changed, reload the visible area
  AUTH_EXPIRED: 'auth:expired',
});

export * from './format.js';
