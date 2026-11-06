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

/** Socket.io event names. Server events carry { event_id, emitted_at, ...data }. */
export const SOCKET_EVENTS = Object.freeze({
  // client -> server
  TRIP_LOCATION: 'trip:location',
  TRIP_HEARTBEAT: 'trip:heartbeat',
  // server -> client
  TRIP_STATUS: 'trip:status',
  TRIP_GRACE_PROMPT: 'trip:grace_prompt',
  TRIP_POSITION: 'trip:position',
  TRIP_SIGNAL: 'trip:signal',
  ALERT_NEW: 'alert:new',
  ALERT_POSITION: 'alert:position',
  AUTH_EXPIRED: 'auth:expired',
});

export * from './format.js';
