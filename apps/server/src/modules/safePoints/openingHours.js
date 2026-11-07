import { z } from 'zod';

// Opening schedules are stored as
//   { "always": true }  or  { "weekly": { "mon": [["08:00","17:00"], ...], ... } }
// in Malaysia time (UTC+8, no daylight saving). A range whose end is not
// after its start crosses midnight. The SQL function public.safe_point_is_open
// is what filters the navigator; this module validates schedules and works
// out "closes at / opens at" for display. test/openingHours.test.js checks
// that both agree.

export const DAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const MYT_OFFSET_MS = 8 * 60 * 60 * 1000;
const DAY_MIN = 24 * 60;

const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use HH:MM (24-hour)');
const range = z.tuple([time, time]).refine(([a, b]) => a !== b, 'Opening and closing time must differ');

export const scheduleSchema = z.union([
  z.object({ always: z.literal(true) }).strict(),
  z
    .object({ weekly: z.partialRecord(z.enum(DAYS), z.array(range).max(4)) })
    .strict()
    .refine((s) => Object.values(s.weekly).some((r) => r.length > 0), 'Add at least one opening period'),
]);

const toMinutes = (hhmm) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));

/** Malaysia-time midnight (as a UTC Date) of the day containing `date`, and minutes since it. */
function localDay(date) {
  const local = date.getTime() + MYT_OFFSET_MS;
  const midnightLocal = Math.floor(local / 86_400_000) * 86_400_000;
  return {
    midnightUtc: midnightLocal - MYT_OFFSET_MS,
    dayIndex: new Date(midnightLocal).getUTCDay(),
    minute: Math.floor((local - midnightLocal) / 60_000),
  };
}

/** Open intervals in minutes relative to today's local midnight, from yesterday to a week ahead, merged. */
function intervals(schedule, dayIndex) {
  const list = [];
  for (let d = -1; d <= 7; d++) {
    const key = DAYS[(((dayIndex + d) % 7) + 7) % 7];
    for (const [open, close] of schedule.weekly?.[key] ?? []) {
      const start = d * DAY_MIN + toMinutes(open);
      const endRaw = toMinutes(close);
      const end = d * DAY_MIN + (endRaw > toMinutes(open) ? endRaw : endRaw + DAY_MIN);
      list.push([start, end]);
    }
  }
  list.sort((a, b) => a[0] - b[0]);
  const merged = [];
  for (const [s, e] of list) {
    const last = merged.at(-1);
    if (last && s <= last[1]) last[1] = Math.max(last[1], e);
    else merged.push([s, e]);
  }
  return merged;
}

export function isOpenAt(schedule, date) {
  return openingStatus(schedule, date).is_open;
}

/**
 * @returns {{ is_open: boolean, always: boolean, closes_at: string|null, opens_at: string|null }}
 *   closes_at / opens_at are ISO times of the next change within a week (null if none).
 */
export function openingStatus(schedule, date) {
  if (schedule.always) return { is_open: true, always: true, closes_at: null, opens_at: null };
  const { midnightUtc, dayIndex, minute } = localDay(date);
  // Use second precision so 17:09:59 is still open and 17:10:00 is closed.
  const now = minute + (date.getTime() % 60_000) / 60_000;
  const at = (m) => new Date(midnightUtc + m * 60_000).toISOString();
  const merged = intervals(schedule, dayIndex);
  const current = merged.find(([s, e]) => s <= now && now < e);
  if (current) return { is_open: true, always: false, closes_at: at(current[1]), opens_at: null };
  const next = merged.find(([s]) => s > now);
  return { is_open: false, always: false, closes_at: null, opens_at: next ? at(next[0]) : null };
}
