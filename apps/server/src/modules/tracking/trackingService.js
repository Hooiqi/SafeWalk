import { OPEN_TRIP_STATUSES } from '@safewalk/shared';
import { gone, notFound } from '../../lib/errors.js';
import { TRAIL_SQL, TRIP_SELECT } from '../trips/tripQueries.js';
import { getAlertTrail, loadAlertRow, toAlertDto } from '../alerts/alertQueries.js';

export const SHARE_TOKEN_PATTERN = /^[A-Za-z0-9_-]{32,64}$/;

const iso = (d) => (d ? new Date(d).toISOString() : null);

/**
 * Trusted-contact access through a share token: either a journey
 * (Module 1, Feature 2) or an SOS alert (Module 2). A link works while the
 * journey / SOS is active and for TRACKING_LINK_TTL_AFTER_END_MINUTES after it
 * ends. Contacts only see what they need: name, positions, status and times -
 * never phone numbers, emails, matric numbers or other contacts.
 */
export function createTrackingService({ pool, clock = () => new Date() }) {
  const expired = (open, expiresAt) => !open && (!expiresAt || new Date(expiresAt) <= clock());

  /** @returns {Promise<{ kind: 'TRIP', trip: object } | { kind: 'SOS', alert: object }>} */
  async function resolveToken(token) {
    if (!SHARE_TOKEN_PATTERN.test(token)) throw notFound('Tracking link not found');
    const { rows } = await pool.query(`${TRIP_SELECT} where t.share_token = $1`, [token]);
    if (rows[0]) {
      const trip = rows[0];
      if (expired(OPEN_TRIP_STATUSES.includes(trip.status), trip.share_expires_at)) {
        throw gone('LINK_EXPIRED', 'This tracking link has expired');
      }
      return { kind: 'TRIP', trip, id: trip.trip_id, expiresAt: trip.share_expires_at };
    }
    const { rows: alerts } = await pool.query('select alert_id from public.sos_alert where share_token = $1', [token]);
    if (!alerts[0]) throw notFound('Tracking link not found');
    const alert = await loadAlertRow(pool, alerts[0].alert_id);
    if (expired(alert.status !== 'RESOLVED' && !alert.user_safe_at, alert.share_expires_at)) {
      throw gone('LINK_EXPIRED', 'This tracking link has expired');
    }
    return { kind: 'SOS', alert, id: alert.alert_id, expiresAt: alert.share_expires_at };
  }

  async function tripView(trip) {
    const [{ rows: trail }, { rows: user }, { rows: sos }] = await Promise.all([
      pool.query(TRAIL_SQL, [trip.trip_id, 1000]),
      pool.query('select full_name from public.app_user where user_id = $1', [trip.user_id]),
      pool.query(
        `select alert_id, status, triggered_at, user_safe_at from public.sos_alert
          where trip_id = $1 and trigger_type in ('HOLD', 'SILENT') order by triggered_at desc limit 1`,
        [trip.trip_id],
      ),
    ]);
    return {
      kind: 'TRIP',
      trip_id: trip.trip_id,
      traveller_name: user[0]?.full_name ?? 'SafeWalk user',
      status: trip.status,
      destination: { lat: trip.dest_lat, lng: trip.dest_lng, label: trip.destination_label },
      origin: { lat: trip.origin_lat, lng: trip.origin_lng },
      route_geometry: trip.route_geojson,
      route_source: trip.route_source,
      started_at: iso(trip.started_at),
      eta_deadline: iso(trip.eta_deadline),
      grace_expires_at: iso(trip.grace_expires_at),
      escalated_at: iso(trip.escalated_at),
      ended_at: iso(trip.ended_at),
      end_reason: trip.end_reason,
      signal_lost_at: iso(trip.signal_lost_at),
      last_heartbeat_at: iso(trip.last_heartbeat_at),
      link_expires_at: iso(trip.share_expires_at),
      last_location: trip.last_location ? { ...trip.last_location, recorded_at: iso(trip.last_location.recorded_at) } : null,
      trail: trail.map((p) => ({ lat: p.lat, lng: p.lng, recorded_at: iso(p.recorded_at) })),
      // An SOS raised during this journey.
      sos: sos[0]
        ? { status: sos[0].status, triggered_at: iso(sos[0].triggered_at), user_safe_at: iso(sos[0].user_safe_at) }
        : null,
      server_time: clock().toISOString(),
    };
  }

  async function sosView(row) {
    const trail = await getAlertTrail(pool, row);
    const dto = toAlertDto(row, { trail });
    return {
      kind: 'SOS',
      alert_id: row.alert_id,
      traveller_name: row.full_name ?? 'SafeWalk user',
      silent: row.trigger_type === 'SILENT',
      status: row.status,
      triggered_at: dto.triggered_at,
      resolved_at: dto.resolved_at,
      user_safe_at: dto.user_safe_at,
      link_expires_at: iso(row.share_expires_at),
      last_location: dto.last_location,
      trail: dto.trail,
      server_time: clock().toISOString(),
    };
  }

  return {
    resolveToken,
    async getTrackingView(token) {
      const resolved = await resolveToken(token);
      return resolved.kind === 'TRIP' ? tripView(resolved.trip) : sosView(resolved.alert);
    },
  };
}
