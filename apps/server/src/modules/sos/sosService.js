import { OPEN_TRIP_STATUSES } from '@safewalk/shared';
import { withTransaction } from '../../db/pool.js';
import { badRequest, conflict, notFound } from '../../lib/errors.js';
import { pointWkt } from '../../lib/geo.js';
import { generateShareToken } from '../trips/tripService.js';
import { alertHistory, getAlert, loadAlertRow } from '../alerts/alertQueries.js';
import { sosMessage, sosSafeMessage } from '../notifications/messages.js';

const OPEN_SOS = `status <> 'RESOLVED' and user_safe_at is null and trigger_type in ('HOLD', 'SILENT')`;

/**
 * Emergency SOS (proposal Module 2).
 *
 * The phone only sends an SOS after the user has held the button for about
 * three seconds (or chosen silent SOS). The server then, in one transaction,
 * stores the alert with the user's identity, GPS position (if any) and time,
 * and afterwards notifies USM Security (dashboard) and the user's trusted
 * contacts in parallel.
 *
 * Duplicate protection: the app sends a client_request_id that it reuses on
 * every retry, and a user can only have one open SOS. A repeated or
 * concurrent request returns the existing alert instead of creating another.
 */
export function createSosService({ pool, config, publisher, dispatcher, logger, clock = () => new Date() }) {
  const linkFor = (token) => `${config.TRACKING_PAGE_URL}${token}`;

  async function forUser(row) {
    return {
      alert_id: row.alert_id,
      trigger_type: row.trigger_type,
      status: row.status,
      triggered_at: new Date(row.triggered_at).toISOString(),
      resolved_at: row.resolved_at ? new Date(row.resolved_at).toISOString() : null,
      user_safe_at: row.user_safe_at ? new Date(row.user_safe_at).toISOString() : null,
      trip_id: row.trip_id,
      tracking_url: row.share_token ? linkFor(row.share_token) : null,
      // Students see staff names so they know a real person is responding.
      status_history: await alertHistory(pool, row.alert_id),
    };
  }

  async function findOpen(userId, clientRequestId) {
    const { rows } = await pool.query(
      `select alert_id from public.sos_alert
        where user_id = $1 and ((${OPEN_SOS}) or client_request_id = $2)
        order by triggered_at desc limit 1`,
      [userId, clientRequestId ?? null],
    );
    return rows[0]?.alert_id ?? null;
  }

  async function ownOpenAlert(userId, alertId) {
    const row = await loadAlertRow(pool, alertId);
    if (!row || row.user_id !== userId || row.trigger_type === 'ETA') throw notFound('SOS alert not found');
    if (row.status === 'RESOLVED' || row.user_safe_at) throw conflict('SOS_NOT_ACTIVE', 'This SOS has already ended');
    return row;
  }

  async function storeSamples(alertId, samples) {
    const now = clock().getTime();
    const valid = samples.filter((s) => new Date(s.recorded_at).getTime() <= now + 2 * 60 * 1000);
    if (valid.length === 0) return { inserted: [], valid };
    const { rows: inserted } = await pool.query(
      `insert into public.location_log (alert_id, coordinates, battery_level, is_heartbeat, recorded_at, accuracy_m)
       select $1, st_setsrid(st_makepoint(s.lng, s.lat), 4326)::geography, s.battery_level, false, s.recorded_at, s.accuracy_m
         from jsonb_to_recordset($2::jsonb) as s(lat float8, lng float8, battery_level int, recorded_at timestamptz, accuracy_m real)
       on conflict (alert_id, recorded_at) do nothing
       returning recorded_at`,
      [alertId, JSON.stringify(valid)],
    );
    return { inserted, valid };
  }

  async function notifyContacts(row, user, message, kind) {
    const { rows: contacts } = await pool.query(
      `select contact_id, contact_name, phone_number, telegram_chat_id, email from public.trusted_contact where user_id = $1`,
      [user.user_id],
    );
    if (contacts.length === 0) return [];
    return dispatcher.toContacts(contacts, message, { alert_id: row.alert_id, kind });
  }

  return {
    async create(identity, input) {
      const existingId = await findOpen(identity.userId, input.client_request_id);
      if (existingId) {
        const row = await loadAlertRow(pool, existingId);
        if (input.location) await this.recordLocations(identity, existingId, [toSample(input, clock())]).catch(() => {});
        return { ...(await forUser(row)), existing: true };
      }

      const now = clock();
      let alertId;
      try {
        alertId = await withTransaction(pool, async (db) => {
          // An SOS during a tracked journey is linked to it for context.
          const { rows: trips } = await db.query(
            `select trip_id from public.trip where user_id = $1 and status = any($2::public.trip_status[])`,
            [identity.userId, OPEN_TRIP_STATUSES],
          );
          const { rows } = await db.query(
            `insert into public.sos_alert
               (user_id, trip_id, trigger_type, alert_location, accuracy_m, status, triggered_at, client_request_id, share_token)
             values ($1, $2, $3, $4::geography, $5, 'NEW', $6, $7, $8)
             returning alert_id`,
            [
              identity.userId, trips[0]?.trip_id ?? null, input.trigger_type,
              input.location ? pointWkt(input.location) : null, input.accuracy_m ?? null,
              now, input.client_request_id, generateShareToken(),
            ],
          );
          const id = rows[0].alert_id;
          await db.query(
            `insert into public.alert_status_log (alert_id, staff_id, previous_status, new_status, updated_at)
             values ($1, null, null, 'NEW', $2)`,
            [id, now],
          );
          if (input.location) {
            const s = toSample(input, now);
            await db.query(
              `insert into public.location_log (alert_id, coordinates, battery_level, is_heartbeat, recorded_at, accuracy_m)
               values ($1, $2::geography, $3, false, $4, $5)`,
              [id, pointWkt(s), s.battery_level, s.recorded_at, s.accuracy_m],
            );
          }
          return id;
        });
      } catch (err) {
        // Two requests raced: return the alert the other one created.
        if (err.code === '23505' && ['sos_alert_one_open_sos_per_user', 'sos_alert_request_key'].includes(err.constraint)) {
          const id = await findOpen(identity.userId, input.client_request_id);
          if (id) return { ...(await forUser(await loadAlertRow(pool, id))), existing: true };
        }
        throw err;
      }

      const alert = await getAlert(pool, alertId);
      const row = await loadAlertRow(pool, alertId);
      // Dashboard first (synchronous broadcast), then contacts without delaying the response.
      publisher.alertNew(alert);
      notifyContacts(
        row,
        alert.user,
        sosMessage({
          userName: alert.user.full_name,
          silent: input.trigger_type === 'SILENT',
          lastLocation: alert.last_location,
          trackingUrl: linkFor(row.share_token),
        }),
        'sos',
      ).catch((err) => logger.error({ err, alert_id: alertId }, 'SOS contact notification failed'));
      logger.warn({ alert_id: alertId, trigger: input.trigger_type, has_location: Boolean(input.location) }, 'SOS raised');
      return { ...(await forUser(row)), existing: false };
    },

    async getActive(identity) {
      const id = await findOpen(identity.userId, null);
      if (!id) return null;
      return forUser(await loadAlertRow(pool, id));
    },

    async get(identity, alertId) {
      const row = await loadAlertRow(pool, alertId);
      if (!row || row.user_id !== identity.userId) throw notFound('Alert not found');
      return forUser(row);
    },

    /** Live GPS during an SOS (socket or HTTP batch). Duplicates are ignored. */
    async recordLocations(identity, alertId, samples) {
      const row = await ownOpenAlert(identity.userId, alertId);
      const { inserted, valid } = await storeSamples(alertId, samples);
      if (valid.length === 0) throw badRequest('No usable location samples');
      const newest = valid.reduce((a, b) => (new Date(a.recorded_at) > new Date(b.recorded_at) ? a : b));
      // If GPS was not available when the SOS was sent, the first fix becomes the alert location.
      if (row.lat == null) {
        await pool.query(
          `update public.sos_alert set alert_location = $2::geography, accuracy_m = $3 where alert_id = $1 and alert_location is null`,
          [alertId, pointWkt(newest), newest.accuracy_m ?? null],
        );
      }
      const previous = row.alert_last_location ? new Date(row.alert_last_location.recorded_at).getTime() : 0;
      if (inserted.length > 0 && new Date(newest.recorded_at).getTime() > previous) {
        publisher.sosPosition(alertId, {
          lat: newest.lat,
          lng: newest.lng,
          recorded_at: new Date(newest.recorded_at).toISOString(),
          battery_level: newest.battery_level ?? null,
          accuracy_m: newest.accuracy_m ?? null,
        });
      }
      return { accepted: inserted.length, duplicates: valid.length - inserted.length, rejected: samples.length - valid.length };
    },

    /**
     * The user says they are safe. Location sharing stops and contacts are
     * told, but the alert stays open until security resolves it.
     */
    async markSafe(identity, alertId) {
      await ownOpenAlert(identity.userId, alertId);
      const now = clock();
      const { rowCount } = await pool.query(
        `update public.sos_alert set user_safe_at = $2, share_expires_at = $3
          where alert_id = $1 and user_safe_at is null and status <> 'RESOLVED'`,
        [alertId, now, new Date(now.getTime() + config.TRACKING_LINK_TTL_AFTER_END_MINUTES * 60_000)],
      );
      if (rowCount === 0) throw conflict('SOS_NOT_ACTIVE', 'This SOS has already ended');
      const row = await loadAlertRow(pool, alertId);
      publisher.alertStatus({ ...row, latest: null });
      notifyContacts(row, { user_id: row.user_id }, sosSafeMessage({ userName: row.full_name }), 'sos_safe').catch((err) =>
        logger.error({ err, alert_id: alertId }, 'SOS safe notification failed'),
      );
      return forUser(row);
    },
  };
}

function toSample(input, now) {
  return {
    lat: input.location.lat,
    lng: input.location.lng,
    recorded_at: input.recorded_at ?? now.toISOString(),
    battery_level: input.battery_level ?? null,
    accuracy_m: input.accuracy_m ?? null,
  };
}
