// SQL shared by the trip service, the watchdog, the tracking endpoint and the
// staff alert endpoints. Geography columns are converted to plain lat/lng here
// so no caller has to deal with PostGIS types.

export const TRIP_SELECT = `
  select t.trip_id, t.user_id, t.status, t.eta_deadline, t.grace_expires_at,
         t.last_heartbeat_at, t.started_at, t.destination_label, t.route_distance_m,
         t.route_duration_s, t.route_source, t.extension_count, t.signal_lost_at,
         t.escalated_at, t.ended_at, t.end_reason, t.share_token, t.share_expires_at,
         st_y(t.origin_geom::geometry) as origin_lat, st_x(t.origin_geom::geometry) as origin_lng,
         st_y(t.dest_geom::geometry) as dest_lat, st_x(t.dest_geom::geometry) as dest_lng,
         st_asgeojson(t.route_line)::json as route_geojson,
         (select json_build_object(
                   'lat', st_y(l.coordinates::geometry), 'lng', st_x(l.coordinates::geometry),
                   'recorded_at', l.recorded_at, 'battery_level', l.battery_level, 'accuracy_m', l.accuracy_m)
            from public.location_log l where l.trip_id = t.trip_id
            order by l.recorded_at desc limit 1) as last_location
    from public.trip t`;

/** Location history of a trip, oldest first, capped to the newest `limit` samples. */
export const TRAIL_SQL = `
  select lat, lng, recorded_at from (
    select st_y(coordinates::geometry) as lat, st_x(coordinates::geometry) as lng, recorded_at
      from public.location_log where trip_id = $1
     order by recorded_at desc limit $2
  ) recent order by recorded_at asc`;

const iso = (d) => (d ? new Date(d).toISOString() : null);

/** Public JSON shape of a trip. `share_token` is only included for the owner. */
export function toTripDto(row, { trackingPageUrl, includeShareLink = false } = {}) {
  const dto = {
    trip_id: row.trip_id,
    status: row.status,
    origin: { lat: row.origin_lat, lng: row.origin_lng },
    destination: { lat: row.dest_lat, lng: row.dest_lng, label: row.destination_label },
    route: {
      geometry: row.route_geojson,
      distance_m: row.route_distance_m,
      duration_s: row.route_duration_s,
      source: row.route_source,
    },
    started_at: iso(row.started_at),
    eta_deadline: iso(row.eta_deadline),
    grace_expires_at: iso(row.grace_expires_at),
    last_heartbeat_at: iso(row.last_heartbeat_at),
    signal_lost_at: iso(row.signal_lost_at),
    escalated_at: iso(row.escalated_at),
    ended_at: iso(row.ended_at),
    end_reason: row.end_reason,
    extension_count: row.extension_count,
    last_location: row.last_location
      ? { ...row.last_location, recorded_at: iso(row.last_location.recorded_at) }
      : null,
  };
  if (includeShareLink) {
    dto.tracking_url = `${trackingPageUrl}${row.share_token}`;
    dto.share_expires_at = iso(row.share_expires_at);
  }
  return dto;
}
