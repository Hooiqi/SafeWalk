import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { InvalidTransitionError, TRIP_EVENTS as EV, nextTripState } from '../src/modules/trips/tripStateMachine.js';

const now = new Date('2026-11-06T12:00:00Z');
const ctx = { now, graceSeconds: 180, extendSeconds: 600, linkTtlMinutes: 30, maxExtensions: 2 };
const trip = (status, extra = {}) => ({ status, eta_deadline: new Date('2026-11-06T11:58:00Z'), extension_count: 0, ...extra });

describe('trip state machine', () => {
  it('ETA expiry moves ACTIVE to GRACE_PROMPT with a 3-minute grace deadline', () => {
    const c = nextTripState(trip('ACTIVE'), EV.ETA_EXPIRED, ctx);
    assert.equal(c.status, 'GRACE_PROMPT');
    assert.equal(c.grace_expires_at.toISOString(), '2026-11-06T12:03:00.000Z');
  });

  it('grace expiry moves GRACE_PROMPT to ESCALATED', () => {
    const c = nextTripState(trip('GRACE_PROMPT'), EV.GRACE_EXPIRED, ctx);
    assert.equal(c.status, 'ESCALATED');
    assert.equal(c.escalated_at, now);
  });

  it('extending an overdue trip counts from now, not from the old deadline', () => {
    const c = nextTripState(trip('GRACE_PROMPT'), EV.EXTEND, ctx);
    assert.equal(c.status, 'ACTIVE');
    assert.equal(c.eta_deadline.toISOString(), '2026-11-06T12:10:00.000Z');
    assert.equal(c.grace_expires_at, null);
    assert.equal(c.extension_count, 1);
  });

  it('extending a trip that is not yet due adds to the existing deadline', () => {
    const c = nextTripState(trip('ACTIVE', { eta_deadline: new Date('2026-11-06T12:05:00Z') }), EV.EXTEND, ctx);
    assert.equal(c.eta_deadline.toISOString(), '2026-11-06T12:15:00.000Z');
  });

  it('limits the number of extensions', () => {
    assert.throws(() => nextTripState(trip('ACTIVE', { extension_count: 2 }), EV.EXTEND, ctx), InvalidTransitionError);
  });

  it('arriving completes the trip and keeps the tracking link alive for 30 minutes', () => {
    const c = nextTripState(trip('ACTIVE'), EV.ARRIVE, ctx);
    assert.equal(c.status, 'COMPLETED');
    assert.equal(c.end_reason, 'ARRIVED');
    assert.equal(c.ended_at, now);
    assert.equal(c.share_expires_at.toISOString(), '2026-11-06T12:30:00.000Z');
  });

  it('confirming safety closes a grace prompt or an escalated trip', () => {
    for (const status of ['GRACE_PROMPT', 'ESCALATED']) {
      const c = nextTripState(trip(status), EV.CONFIRM_SAFE, ctx);
      assert.equal(c.status, 'COMPLETED');
      assert.equal(c.end_reason, 'SAFE_CONFIRMED');
    }
  });

  it('rejects illegal transitions', () => {
    const illegal = [
      ['ACTIVE', EV.GRACE_EXPIRED],
      ['ACTIVE', EV.CONFIRM_SAFE],
      ['GRACE_PROMPT', EV.CANCEL], // must answer the check-in instead
      ['ESCALATED', EV.CANCEL],
      ['ESCALATED', EV.EXTEND],
      ['ESCALATED', EV.ARRIVE],
      ['COMPLETED', EV.EXTEND],
      ['CANCELLED', EV.ARRIVE],
      ['COMPLETED', EV.ETA_EXPIRED],
    ];
    for (const [status, event] of illegal) {
      assert.throws(() => nextTripState(trip(status), event, ctx), InvalidTransitionError, `${event} from ${status}`);
    }
  });
});
