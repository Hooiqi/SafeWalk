import { OPEN_TRIP_STATUSES } from '@safewalk/shared';
import { gone, notFound } from '../../lib/errors.js';
import { TRAIL_SQL, TRIP_SELECT } from '../trips/tripQueries.js';

export const SHARE_TOKEN_PATTERN = /^[A-Za-z0-9_-]{32,64}$/;

const iso = (d) => (d ? new Date(d).toISOString() : null);

/**
 * Trusted-contact access to ONE trip through its share token
 * (Module 1, Feature 2). The link works while the trip is being monitored and
 * for TRACKING_LINK_TTL_AFTER_END_MINUTES after it ends, so contacts can see
 * that the person arrived. Contacts only see what they need to follow the
 * walk: name, destination, route, position history, ETA and status - never
 * phone numbers, emails, matric numbers or other contacts.
 */
export function createTrackingService({ pool, clock = () => new Date() }) {
  async function resolveToken(token) {
    if (!SHARE_TOKEN_PATTERN.test(token)) throw notFound('Tracking link not found');
    const { rows } = await pool.query(`${TRIP_SELECT} where t.share_token = $1`, [token]);
    const trip = rows[0];
    if (!trip) throw notFound('Tracking link not found');
    const open = OPEN_TRIP_STATUSES.includes(trip.status);
    if (!open && (!trip.share_expires_at || new Date(trip.share_expires_at) <= clock())) {
      throw gone('LINK_EXPIRED', 'This tracking link has expired');
    }
    return trip;
  }

  return {
    resolveToken,

    async getTrackingView(token) {
      const trip = await resolveToken(token);
      const [{ rows: trail }, { rows: user }] = await Promise.all([
        pool.query(TRAIL_SQL, [trip.trip_id, 1000]),
        pool.query('select full_name from public.app_user where user_id = $1', [trip.user_id]),
      ]);
      return {
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
        last_location: trip.last_location
          ? { ...trip.last_location, recorded_at: iso(trip.last_location.recorded_at) }
          : null,
        trail: trail.map((p) => ({ lat: p.lat, lng: p.lng, recorded_at: iso(p.recorded_at) })),
        server_time: clock().toISOString(),
      };
    },
  };
}
