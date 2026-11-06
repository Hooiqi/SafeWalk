import cron from 'node-cron';
import { OPEN_TRIP_STATUSES } from '@safewalk/shared';
import { withTransaction } from '../../db/pool.js';
import { TRANSITIONS } from '../trips/tripStateMachine.js';
import { getAlert } from '../alerts/alertQueries.js';
import { escalationMessage, gracePromptMessage } from '../notifications/messages.js';

/**
 * Server-side ETA watchdog (proposal Module 1 and 5.2.3 2A).
 *
 * The countdown lives in the database (trip.eta_deadline, trip.grace_expires_at),
 * and this job compares it with the server clock, so escalation happens even if
 * the phone's battery dies or it loses signal. Each tick:
 *
 *   1. ACTIVE trips past their ETA        -> GRACE_PROMPT (+3 min), notify the user
 *   2. GRACE_PROMPT trips past the grace  -> ESCALATED, create an ETA alert,
 *      send route history + last GPS to contacts, push alert to the dashboard
 *   3. Open trips with no heartbeat for HEARTBEAT_STALE_SECONDS -> mark signal lost
 *
 * Every state change is a conditional UPDATE, so running two server instances
 * (or overlapping ticks) cannot escalate the same trip twice.
 */
export function createEtaWatchdog({ pool, config, tripService, publisher, dispatcher, logger, clock = () => new Date() }) {
  async function moveOverdueToGrace(now) {
    const rule = TRANSITIONS.ETA_EXPIRED;
    const { rows } = await pool.query(
      `update public.trip
          set status = $3, grace_expires_at = $1::timestamptz + make_interval(secs => $2)
        where status = any($4::public.trip_status[]) and eta_deadline <= $1
        returning trip_id`,
      [now, config.GRACE_PERIOD_SECONDS, rule.to, rule.from],
    );
    for (const { trip_id } of rows) {
      const trip = await tripService.loadTrip(pool, trip_id);
      publisher.gracePrompt(trip);
      publisher.tripStatus(trip);
      const user = await tripService.userProfile(pool, trip.user_id);
      await dispatcher.toUser(user, gracePromptMessage({ graceExpiresAt: trip.grace_expires_at }), { trip_id });
      logger.info({ trip_id }, 'ETA passed: grace prompt sent');
    }
    return rows.length;
  }

  async function escalateExpiredGrace(now) {
    const rule = TRANSITIONS.GRACE_EXPIRED;
    // Status change, alert and its first status-log entry commit together.
    const escalated = await withTransaction(pool, async (db) => {
      const { rows } = await db.query(
        `with due as (
           select trip_id from public.trip
            where status = any($3::public.trip_status[]) and grace_expires_at <= $1
            for update skip locked)
         update public.trip t set status = $2, escalated_at = $1
           from due where t.trip_id = due.trip_id
         returning t.trip_id, t.user_id`,
        [now, rule.to, rule.from],
      );
      const created = [];
      for (const { trip_id, user_id } of rows) {
        const { rows: alert } = await db.query(
          `insert into public.sos_alert (user_id, trip_id, trigger_type, alert_location, status, triggered_at)
           select $1, $2, 'ETA',
                  coalesce((select coordinates from public.location_log where trip_id = $2
                             order by recorded_at desc limit 1),
                           (select origin_geom from public.trip where trip_id = $2)),
                  'NEW', $3
           on conflict (trip_id) where trigger_type = 'ETA' do nothing
           returning alert_id`,
          [user_id, trip_id, now],
        );
        if (alert[0]) {
          await db.query(
            `insert into public.alert_status_log (alert_id, staff_id, previous_status, new_status, updated_at)
             values ($1, null, null, 'NEW', $2)`,
            [alert[0].alert_id, now],
          );
          created.push({ trip_id, alert_id: alert[0].alert_id });
        }
      }
      return created;
    });

    // Notifications run after commit: the alert is already safely stored and
    // visible on the dashboard even if a notification channel fails.
    await Promise.all(escalated.map((e) => notifyEscalation(e).catch((err) =>
      logger.error({ err, trip_id: e.trip_id }, 'escalation notification failed'))));
    return escalated.length;
  }

  async function notifyEscalation({ trip_id, alert_id }) {
    const trip = await tripService.loadTrip(pool, trip_id);
    const [alert, contacts, user] = await Promise.all([
      getAlert(pool, alert_id),
      tripService.tripContacts(pool, trip_id),
      tripService.userProfile(pool, trip.user_id),
    ]);
    const trackingUrl = `${config.TRACKING_PAGE_URL}${trip.share_token}`;
    const last = trip.last_location;

    // Stage 2 dispatch, all channels in parallel.
    const [contactResults] = await Promise.all([
      dispatcher.toContacts(
        contacts,
        escalationMessage({
          userName: user.full_name,
          destinationLabel: trip.destination_label,
          lastLocation: last ? { lat: last.lat, lng: last.lng } : null,
          lastSeenAt: last?.recorded_at,
          trackingUrl,
        }),
        { trip_id, alert_id, kind: 'escalation' },
      ),
      Promise.resolve().then(() => publisher.alertNew(alert)),
      Promise.resolve().then(() => publisher.tripStatus(trip)),
    ]);
    logger.warn({ trip_id, alert_id, contact_results: contactResults }, 'trip ESCALATED: security and contacts alerted');
  }

  async function markLostSignals(now) {
    const { rows } = await pool.query(
      `update public.trip set signal_lost_at = $1
        where status = any($3::public.trip_status[]) and signal_lost_at is null
          and coalesce(last_heartbeat_at, started_at) < $1::timestamptz - make_interval(secs => $2)
        returning trip_id, user_id, status, coalesce(last_heartbeat_at, started_at) as since`,
      [now, config.HEARTBEAT_STALE_SECONDS, OPEN_TRIP_STATUSES],
    );
    for (const row of rows) {
      publisher.signal(row, { lost: true, since: new Date(row.since).toISOString() });
      logger.info({ trip_id: row.trip_id }, 'device heartbeat lost');
    }
    return rows.length;
  }

  let running = false;

  async function tick() {
    if (running) return null; // never overlap ticks
    running = true;
    const now = clock();
    try {
      const graced = await moveOverdueToGrace(now);
      const escalated = await escalateExpiredGrace(now);
      const signalLost = await markLostSignals(now);
      return { graced, escalated, signalLost };
    } catch (err) {
      logger.error({ err }, 'watchdog tick failed');
      return null;
    } finally {
      running = false;
    }
  }

  let task = null;
  return {
    tick,
    start() {
      task = cron.schedule(config.WATCHDOG_CRON, tick, { name: 'eta-watchdog' });
      logger.info({ schedule: config.WATCHDOG_CRON, grace_seconds: config.GRACE_PERIOD_SECONDS }, 'ETA watchdog started');
    },
    stop() {
      task?.stop();
    },
  };
}

