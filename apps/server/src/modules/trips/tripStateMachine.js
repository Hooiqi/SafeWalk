import { TRIP_STATUS as S, TRIP_END_REASON as R } from '@safewalk/shared';

/**
 * Server-side finite-state machine for a tracked journey
 * (proposal 5.2.3 2A: Active -> Grace Prompt -> Escalated).
 *
 *   ACTIVE        --ETA_EXPIRED   (watchdog)--> GRACE_PROMPT   (3-minute check-in)
 *   GRACE_PROMPT  --GRACE_EXPIRED (watchdog)--> ESCALATED      (Stage 2 alert)
 *   ACTIVE | GRACE_PROMPT  --EXTEND-->       ACTIVE     (new deadline)
 *   ACTIVE | GRACE_PROMPT  --ARRIVE-->       COMPLETED  (arrived safely)
 *   GRACE_PROMPT | ESCALATED --CONFIRM_SAFE--> COMPLETED (user says they are safe)
 *   ACTIVE                 --CANCEL-->       CANCELLED
 *
 * The machine only decides WHICH transition is legal and what it changes.
 * The trip service applies it with a conditional UPDATE
 * (`... WHERE status = ANY(from)`) so concurrent requests and the watchdog
 * cannot both win the same transition.
 */
export const TRIP_EVENTS = Object.freeze({
  ETA_EXPIRED: 'ETA_EXPIRED',
  GRACE_EXPIRED: 'GRACE_EXPIRED',
  EXTEND: 'EXTEND',
  ARRIVE: 'ARRIVE',
  CONFIRM_SAFE: 'CONFIRM_SAFE',
  CANCEL: 'CANCEL',
});

export const TRANSITIONS = Object.freeze({
  // Raised by the watchdog
  ETA_EXPIRED: { from: [S.ACTIVE], to: S.GRACE_PROMPT },
  GRACE_EXPIRED: { from: [S.GRACE_PROMPT], to: S.ESCALATED },
  // Raised by the user
  EXTEND: { from: [S.ACTIVE, S.GRACE_PROMPT], to: S.ACTIVE },
  ARRIVE: { from: [S.ACTIVE, S.GRACE_PROMPT], to: S.COMPLETED, endReason: R.ARRIVED },
  CONFIRM_SAFE: { from: [S.GRACE_PROMPT, S.ESCALATED], to: S.COMPLETED, endReason: R.SAFE_CONFIRMED },
  // Cancelling is only allowed before the ETA passes; afterwards the user
  // must answer the check-in instead, so a cancel cannot silence an alert.
  CANCEL: { from: [S.ACTIVE], to: S.CANCELLED, endReason: R.CANCELLED },
});

export const isTerminal = (status) => status === S.COMPLETED || status === S.CANCELLED;

export class InvalidTransitionError extends Error {
  constructor(event, status) {
    super(`Cannot ${event} a trip that is ${status}`);
    this.event = event;
    this.status = status;
  }
}

/**
 * Compute the field changes for applying `event` to `trip` at time `now`.
 * @param {{status: string, eta_deadline: Date, extension_count: number}} trip
 * @param {string} event one of TRIP_EVENTS
 * @param {{now: Date, graceSeconds: number, extendSeconds?: number, linkTtlMinutes: number, maxExtensions: number}} ctx
 * @returns {Record<string, unknown>} columns to update (always includes status)
 */
export function nextTripState(trip, event, ctx) {
  const rule = TRANSITIONS[event];
  if (!rule) throw new Error(`Unknown trip event ${event}`);
  if (!rule.from.includes(trip.status)) throw new InvalidTransitionError(event, trip.status);

  const now = ctx.now;
  const changes = { status: rule.to };

  switch (event) {
    case TRIP_EVENTS.ETA_EXPIRED:
      changes.grace_expires_at = new Date(now.getTime() + ctx.graceSeconds * 1000);
      break;
    case TRIP_EVENTS.GRACE_EXPIRED:
      changes.escalated_at = now;
      break;
    case TRIP_EVENTS.EXTEND: {
      if (trip.extension_count >= ctx.maxExtensions) {
        throw new InvalidTransitionError('extend (limit reached)', trip.status);
      }
      // Extend from whichever is later: the old deadline or now (when overdue).
      const base = Math.max(new Date(trip.eta_deadline).getTime(), now.getTime());
      changes.eta_deadline = new Date(base + ctx.extendSeconds * 1000);
      changes.grace_expires_at = null;
      changes.extension_count = trip.extension_count + 1;
      break;
    }
    default:
      break;
  }

  if (isTerminal(rule.to)) {
    changes.ended_at = now;
    changes.end_reason = rule.endReason;
    changes.share_expires_at = new Date(now.getTime() + ctx.linkTtlMinutes * 60 * 1000);
    changes.grace_expires_at = null;
  }
  return changes;
}
