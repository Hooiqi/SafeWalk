import { TRAIL_SQL } from '../trips/tripQueries.js';

const iso = (d) => (d ? new Date(d).toISOString() : null);

const LAST_FIX = (where) => `(select json_build_object(
      'lat', st_y(l.coordinates::geometry), 'lng', st_x(l.coordinates::geometry),
      'recorded_at', l.recorded_at, 'battery_level', l.battery_level, 'accuracy_m', l.accuracy_m)
    from public.location_log l where ${where} order by l.recorded_at desc limit 1)`;

const ALERT_SELECT = `
  select a.alert_id, a.trigger_type, a.status, a.triggered_at, a.resolved_at, a.trip_id,
         a.user_safe_at, a.accuracy_m, a.share_token, a.share_expires_at,
         st_y(a.alert_location::geometry) as lat, st_x(a.alert_location::geometry) as lng,
         u.user_id, u.full_name, u.matric_or_staff_id, u.phone_number, u.email,
         t.status as trip_status, t.destination_label, t.eta_deadline, t.started_at,
         t.last_heartbeat_at, t.signal_lost_at, t.ended_at, t.end_reason,
         st_y(t.dest_geom::geometry) as dest_lat, st_x(t.dest_geom::geometry) as dest_lng,
         st_asgeojson(t.route_line)::json as route_geojson,
         ${LAST_FIX('l.trip_id = a.trip_id')} as trip_last_location,
         ${LAST_FIX('l.alert_id = a.alert_id')} as alert_last_location
    from public.sos_alert a
    left join public.app_user u on u.user_id = a.user_id
    left join public.trip t on t.trip_id = a.trip_id`;

const ALERT_TRAIL_SQL = `
  select lat, lng, recorded_at from (
    select st_y(coordinates::geometry) as lat, st_x(coordinates::geometry) as lng, recorded_at
      from public.location_log where alert_id = $1
     order by recorded_at desc limit $2
  ) recent order by recorded_at asc`;

const fix = (f) => (f ? { ...f, recorded_at: iso(f.recorded_at) } : null);

/** Where the person is believed to be now, most recent source first. */
function currentLocation(row) {
  const candidates = [fix(row.alert_last_location), fix(row.trip_last_location)].filter(Boolean);
  if (candidates.length) return candidates.sort((a, b) => new Date(b.recorded_at) - new Date(a.recorded_at))[0];
  return row.lat == null
    ? null
    : { lat: row.lat, lng: row.lng, recorded_at: iso(row.triggered_at), battery_level: null, accuracy_m: row.accuracy_m };
}

export function toAlertDto(row, { trail, history } = {}) {
  return {
    alert_id: row.alert_id,
    trigger_type: row.trigger_type,
    status: row.status,
    triggered_at: iso(row.triggered_at),
    resolved_at: iso(row.resolved_at),
    user_safe_at: iso(row.user_safe_at),
    alert_location: row.lat == null ? null : { lat: row.lat, lng: row.lng, accuracy_m: row.accuracy_m },
    last_location: currentLocation(row),
    trail: trail?.map((p) => ({ lat: p.lat, lng: p.lng, recorded_at: iso(p.recorded_at) })),
    status_history: history,
    user: row.user_id
      ? {
          user_id: row.user_id,
          full_name: row.full_name,
          matric_or_staff_id: row.matric_or_staff_id,
          phone_number: row.phone_number,
          email: row.email,
        }
      : null,
    trip: row.trip_id
      ? {
          trip_id: row.trip_id,
          status: row.trip_status,
          destination: { lat: row.dest_lat, lng: row.dest_lng, label: row.destination_label },
          route_geometry: row.route_geojson,
          started_at: iso(row.started_at),
          eta_deadline: iso(row.eta_deadline),
          last_heartbeat_at: iso(row.last_heartbeat_at),
          signal_lost_at: iso(row.signal_lost_at),
          ended_at: iso(row.ended_at),
          end_reason: row.end_reason,
        }
      : null,
  };
}

export async function loadAlertRow(db, alertId) {
  const { rows } = await db.query(`${ALERT_SELECT} where a.alert_id = $1`, [alertId]);
  return rows[0] ?? null;
}

export async function alertHistory(db, alertId) {
  const { rows } = await db.query(
    `select l.previous_status, l.new_status, l.updated_at, l.note, s.full_name as staff_name
       from public.alert_status_log l
       left join public.security_staff s on s.staff_id = l.staff_id
      where l.alert_id = $1 order by l.updated_at, l.status_log_id`,
    [alertId],
  );
  return rows.map((r) => ({ ...r, updated_at: iso(r.updated_at) }));
}

/** Full alert for the dashboard: identity, route/location history and response timeline. */
export async function getAlert(db, alertId, { trailLimit = 1000 } = {}) {
  const row = await loadAlertRow(db, alertId);
  if (!row) return null;
  // Overdue journeys show the journey's route history; SOS alerts their own stream.
  const trailQuery =
    row.trigger_type === 'ETA' ? db.query(TRAIL_SQL, [row.trip_id, trailLimit]) : db.query(ALERT_TRAIL_SQL, [alertId, trailLimit]);
  const [{ rows: trail }, history] = await Promise.all([trailQuery, alertHistory(db, alertId)]);
  return toAlertDto(row, { trail, history });
}

export async function getAlertTrail(db, row, limit = 1000) {
  const { rows } =
    row.trigger_type === 'ETA' ? await db.query(TRAIL_SQL, [row.trip_id, limit]) : await db.query(ALERT_TRAIL_SQL, [row.alert_id, limit]);
  return rows;
}

export async function listAlerts(db, { openOnly, limit }) {
  const { rows } = await db.query(
    `${ALERT_SELECT} where ($1::boolean = false or a.status <> 'RESOLVED')
      order by a.triggered_at desc limit $2`,
    [openOnly, limit],
  );
  return rows.map((r) => toAlertDto(r));
}
