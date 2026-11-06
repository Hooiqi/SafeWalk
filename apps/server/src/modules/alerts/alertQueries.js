import { TRAIL_SQL } from '../trips/tripQueries.js';

const iso = (d) => (d ? new Date(d).toISOString() : null);

const ALERT_SELECT = `
  select a.alert_id, a.trigger_type, a.status, a.triggered_at, a.resolved_at, a.trip_id,
         st_y(a.alert_location::geometry) as lat, st_x(a.alert_location::geometry) as lng,
         u.user_id, u.full_name, u.matric_or_staff_id, u.phone_number, u.email,
         t.status as trip_status, t.destination_label, t.eta_deadline, t.started_at,
         t.last_heartbeat_at, t.signal_lost_at, t.ended_at, t.end_reason,
         st_y(t.dest_geom::geometry) as dest_lat, st_x(t.dest_geom::geometry) as dest_lng,
         st_asgeojson(t.route_line)::json as route_geojson,
         (select json_build_object('lat', st_y(l.coordinates::geometry), 'lng', st_x(l.coordinates::geometry),
                                   'recorded_at', l.recorded_at, 'battery_level', l.battery_level)
            from public.location_log l where l.trip_id = a.trip_id
           order by l.recorded_at desc limit 1) as last_location
    from public.sos_alert a
    left join public.app_user u on u.user_id = a.user_id
    left join public.trip t on t.trip_id = a.trip_id`;

function toAlertDto(row, trail) {
  return {
    alert_id: row.alert_id,
    trigger_type: row.trigger_type,
    status: row.status,
    triggered_at: iso(row.triggered_at),
    resolved_at: iso(row.resolved_at),
    alert_location: row.lat == null ? null : { lat: row.lat, lng: row.lng },
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
          last_location: row.last_location
            ? { ...row.last_location, recorded_at: iso(row.last_location.recorded_at) }
            : null,
          trail: trail?.map((p) => ({ lat: p.lat, lng: p.lng, recorded_at: iso(p.recorded_at) })),
        }
      : null,
  };
}

export async function getAlert(db, alertId, { trailLimit = 1000 } = {}) {
  const { rows } = await db.query(`${ALERT_SELECT} where a.alert_id = $1`, [alertId]);
  if (!rows[0]) return null;
  const trail = rows[0].trip_id ? (await db.query(TRAIL_SQL, [rows[0].trip_id, trailLimit])).rows : null;
  return toAlertDto(rows[0], trail);
}

export async function listAlerts(db, { openOnly, limit }) {
  const { rows } = await db.query(
    `${ALERT_SELECT} where ($1::boolean = false or a.status <> 'RESOLVED')
      order by a.triggered_at desc limit $2`,
    [openOnly, limit],
  );
  return rows.map((r) => toAlertDto(r));
}
