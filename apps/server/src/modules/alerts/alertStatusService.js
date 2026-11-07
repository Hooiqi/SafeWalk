import { ALERT_STATUS_ORDER } from '@safewalk/shared';
import { withTransaction } from '../../db/pool.js';
import { conflict, notFound } from '../../lib/errors.js';
import { responseUpdateMessage } from '../notifications/messages.js';
import { TRIP_EVENTS, nextTripState } from '../trips/tripStateMachine.js';
import { applyTransition } from '../trips/tripService.js';
import { getAlert, loadAlertRow } from './alertQueries.js';

/**
 * Emergency response workflow (proposal Module 4, Diagram 12.4):
 * Received Alert -> On the Way -> Arrived at Location -> Resolved.
 *
 * Statuses only move forward; an officer may skip steps (for example straight
 * to Resolved for a false alarm). Every change is written to alert_status_log
 * with the officer and an optional note, in the same transaction, and pushed
 * to the dashboard, the person who raised the alert and their contacts' link.
 */
export function createAlertStatusService({ pool, config, publisher, dispatcher, tripService, logger, clock = () => new Date() }) {
  return {
    async update(identity, alertId, { status, note }) {
      const before = await loadAlertRow(pool, alertId);
      if (!before) throw notFound('Alert not found');
      if (ALERT_STATUS_ORDER.indexOf(status) <= ALERT_STATUS_ORDER.indexOf(before.status)) {
        throw conflict('INVALID_ALERT_STATUS', `The alert is already ${before.status.replaceAll('_', ' ').toLowerCase()}`);
      }
      const now = clock();
      const resolved = status === 'RESOLVED';

      await withTransaction(pool, async (db) => {
        const { rowCount } = await db.query(
          `update public.sos_alert
              set status = $3,
                  resolved_at = case when $4 then $5::timestamptz else resolved_at end,
                  share_expires_at = case when $4 then $6::timestamptz else share_expires_at end
            where alert_id = $1 and status = $2`,
          [alertId, before.status, status, resolved, now, new Date(now.getTime() + config.TRACKING_LINK_TTL_AFTER_END_MINUTES * 60_000)],
        );
        if (rowCount === 0) throw conflict('ALERT_CHANGED', 'Another officer updated this alert just now. Refresh and try again.');
        await db.query(
          `insert into public.alert_status_log (alert_id, staff_id, previous_status, new_status, updated_at, note)
           values ($1, $2, $3, $4, $5, $6)`,
          [alertId, identity.staffId, before.status, status, now, note ?? null],
        );
        // Resolving an overdue-journey alert also ends the escalated journey.
        if (resolved && before.trip_id && before.trip_status === 'ESCALATED') {
          const changes = nextTripState({ status: 'ESCALATED' }, TRIP_EVENTS.SECURITY_RESOLVED, {
            now,
            graceSeconds: config.GRACE_PERIOD_SECONDS,
            linkTtlMinutes: config.TRACKING_LINK_TTL_AFTER_END_MINUTES,
            maxExtensions: config.MAX_TRIP_EXTENSIONS,
          });
          await applyTransition(db, before.trip_id, TRIP_EVENTS.SECURITY_RESOLVED, changes);
        }
      });

      const alert = await getAlert(pool, alertId);
      const latest = alert.status_history.at(-1);
      publisher.alertStatus({ ...alert, user_id: alert.user?.user_id, trip_id: alert.trip?.trip_id, latest });
      if (resolved && before.trip_id) publisher.tripStatus(await tripService.loadTrip(pool, before.trip_id));

      // Tell the person on their phone too (FCM), in case the app is in the background.
      if (alert.user && !before.user_safe_at) {
        const user = await tripService.userProfile(pool, alert.user.user_id);
        dispatcher.toUser(user, responseUpdateMessage(status, note), { alert_id: alertId }).catch(() => {});
      }
      logger.info({ alert_id: alertId, from: before.status, to: status, staff_id: identity.staffId }, 'alert status changed');
      return alert;
    },
  };
}
