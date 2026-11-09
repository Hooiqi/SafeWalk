import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import pg from 'pg';
import { openingStatus, scheduleSchema } from '../src/modules/safePoints/openingHours.js';
import { createTestDatabase } from './helpers/env.js';

const myt = (s) => new Date(`${s}+08:00`); // Malaysia time
const minden = {
  weekly: Object.fromEntries(['mon', 'tue', 'wed', 'thu', 'fri'].map((d) => [d, [['08:10', '17:10']]])),
};
const overnight = { weekly: { fri: [['22:00', '02:00']] } };

describe('opening schedule (JavaScript)', () => {
  it('weekday-only gate is closed on Saturday and says when it reopens', () => {
    const s = openingStatus(minden, myt('2026-11-07T10:00:00')); // Saturday
    assert.equal(s.is_open, false);
    assert.equal(s.opens_at, myt('2026-11-09T08:10:00').toISOString()); // Monday
  });

  it('opening time is inclusive and closing time is exclusive', () => {
    assert.equal(openingStatus(minden, myt('2026-11-09T08:10:00')).is_open, true);
    assert.equal(openingStatus(minden, myt('2026-11-09T17:09:59')).is_open, true);
    assert.equal(openingStatus(minden, myt('2026-11-09T17:10:00')).is_open, false);
    assert.equal(openingStatus(minden, myt('2026-11-09T09:00:00')).closes_at, myt('2026-11-09T17:10:00').toISOString());
  });

  it('handles ranges that cross midnight', () => {
    assert.equal(openingStatus(overnight, myt('2026-11-06T23:30:00')).is_open, true); // Friday night
    const early = openingStatus(overnight, myt('2026-11-07T01:00:00')); // Saturday 1 am
    assert.equal(early.is_open, true);
    assert.equal(early.closes_at, myt('2026-11-07T02:00:00').toISOString());
    assert.equal(openingStatus(overnight, myt('2026-11-07T02:30:00')).is_open, false);
  });

  it('24-hour places are always open with no closing time', () => {
    assert.deepEqual(openingStatus({ always: true }, new Date()), { is_open: true, always: true, closes_at: null, opens_at: null });
  });

  it('validates schedules', () => {
    assert.equal(scheduleSchema.safeParse(minden).success, true);
    assert.equal(scheduleSchema.safeParse({ always: true }).success, true);
    for (const bad of [{}, { weekly: {} }, { weekly: { mon: [['8:00', '17:00']] } }, { weekly: { mon: [['09:00', '09:00']] } }, { weekly: { funday: [['08:00', '09:00']] } }, { always: false }]) {
      assert.equal(scheduleSchema.safeParse(bad).success, false, JSON.stringify(bad));
    }
  });
});

describe('JavaScript and SQL agree (public.safe_point_is_open)', () => {
  let client;
  before(async () => {
    client = new pg.Client({ connectionString: await createTestDatabase('hours') });
    await client.connect();
  });
  after(async () => client.end());

  it('for every supplied safe point schedule and an overnight schedule, every 25 minutes for a week', async () => {
    const { rows } = await client.query('select distinct opening_schedule from public.safe_point');
    const schedules = [...rows.map((r) => r.opening_schedule), overnight];
    assert.ok(schedules.length >= 8);
    const times = [];
    for (let t = myt('2026-11-02T00:00:00').getTime(); t < myt('2026-11-09T00:00:00').getTime(); t += 25 * 60_000) {
      times.push(new Date(t));
    }
    let mismatches = 0;
    for (const schedule of schedules) {
      const { rows: sql } = await client.query(
        'select public.safe_point_is_open($1::jsonb, t) as open from unnest($2::timestamptz[]) as t',
        [JSON.stringify(schedule), times],
      );
      sql.forEach((r, i) => {
        if (r.open !== openingStatus(schedule, times[i]).is_open) mismatches++;
      });
    }
    assert.equal(mismatches, 0);
  });
});
