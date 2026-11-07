import { notFound } from '../../lib/errors.js';
import { pointWkt } from '../../lib/geo.js';
import { openingStatus } from './openingHours.js';

const COLUMNS = `
  sp.safe_point_id, sp.name, sp.category, sp.location_description, sp.operating_hours,
  sp.opening_schedule, sp.contact_phone, sp.contact_notes, sp.notes, sp.data_source,
  sp.is_active, sp.updated_at, sp.updated_by,
  st_y(sp.location::geometry) as lat, st_x(sp.location::geometry) as lng`;

export function toSafePointDto(row, now, { includeAdmin = false } = {}) {
  const dto = {
    safe_point_id: row.safe_point_id,
    name: row.name,
    category: row.category,
    location: row.lat == null ? null : { lat: row.lat, lng: row.lng },
    location_description: row.location_description,
    operating_hours: row.operating_hours,
    opening: openingStatus(row.opening_schedule, now),
    contact_phone: row.contact_phone,
    contact_notes: row.contact_notes,
    notes: row.notes,
  };
  if (includeAdmin) {
    Object.assign(dto, {
      opening_schedule: row.opening_schedule,
      is_active: row.is_active,
      data_source: row.data_source,
      updated_at: row.updated_at ? new Date(row.updated_at).toISOString() : null,
    });
  }
  return dto;
}

/**
 * Nearest Safe Point Navigator (proposal Module 2, 5.2.3 1B):
 *   1. filter active, pinned safe points by opening hours (SQL, Malaysia time)
 *   2. k-nearest-neighbour search with the PostGIS <-> distance operator
 *   3. rank the candidates by actual walking time from OSRM
 */
export function createSafePointService({ pool, routing, clock = () => new Date() }) {
  return {
    /** All active safe points on the map, with whether each is open now. */
    async listActive() {
      const now = clock();
      const { rows } = await pool.query(`select ${COLUMNS} from public.safe_point sp where sp.is_active order by sp.name`);
      const located = rows.filter((r) => r.lat != null);
      return {
        safe_points: located.map((r) => toSafePointDto(r, now)),
        // Points from the official list that security has not pinned on the map yet.
        pending_location_count: rows.length - located.length,
      };
    },

    async nearest(origin, { limit = 5, candidates = 10 } = {}) {
      const now = clock();
      const { rows } = await pool.query(
        `select ${COLUMNS}, st_distance(sp.location, $1::geography) as straight_m
           from public.safe_point sp
          where sp.is_active and sp.location is not null
            and public.safe_point_is_open(sp.opening_schedule, $2)
          order by sp.location <-> $1::geography
          limit $3`,
        [pointWkt(origin), now, candidates],
      );
      const walking = await routing.walkingTimes(origin, rows.map((r) => ({ lat: r.lat, lng: r.lng })));
      return rows
        .map((r, i) => ({ ...toSafePointDto(r, now), walking: walking[i], straight_line_m: Math.round(r.straight_m) }))
        .sort((a, b) => a.walking.duration_s - b.walking.duration_s)
        .slice(0, limit);
    },

    async directions(safePointId, origin) {
      const { rows } = await pool.query(
        `select ${COLUMNS} from public.safe_point sp where sp.safe_point_id = $1 and sp.is_active and sp.location is not null`,
        [safePointId],
      );
      if (!rows[0]) throw notFound('Safe point not found');
      const route = await routing.walkingRoute(origin, { lat: rows[0].lat, lng: rows[0].lng }, { steps: true });
      return { safe_point: toSafePointDto(rows[0], clock()), route };
    },

    // ---- Security staff management (proposal Module 4, Feature 4) ----------

    async listAll() {
      const now = clock();
      const { rows } = await pool.query(
        `select ${COLUMNS} from public.safe_point sp order by sp.is_active desc, (sp.location is null) desc, sp.name`,
      );
      return rows.map((r) => toSafePointDto(r, now, { includeAdmin: true }));
    },

    async save(staffId, input, safePointId = null) {
      const fields = { ...input };
      const params = [];
      const assign = [];
      const add = (column, value, cast = '') => {
        params.push(value);
        assign.push([column, `$${params.length}${cast}`]);
      };
      for (const [key, value] of Object.entries(fields)) {
        if (key === 'location') add('location', value ? pointWkt(value) : null, '::geography');
        else if (key === 'opening_schedule') add(key, JSON.stringify(value), '::jsonb');
        else add(key, value);
      }
      add('updated_by', staffId);

      let rows;
      if (safePointId) {
        params.push(safePointId);
        ({ rows } = await pool.query(
          `update public.safe_point set ${assign.map(([c, p]) => `${c} = ${p}`).join(', ')}
            where safe_point_id = $${params.length} returning safe_point_id`,
          params,
        ));
        if (!rows[0]) throw notFound('Safe point not found');
      } else {
        ({ rows } = await pool.query(
          `insert into public.safe_point (${assign.map(([c]) => c).join(', ')})
           values (${assign.map(([, p]) => p).join(', ')}) returning safe_point_id`,
          params,
        ));
      }
      const { rows: saved } = await pool.query(`select ${COLUMNS} from public.safe_point sp where sp.safe_point_id = $1`, [
        rows[0].safe_point_id,
      ]);
      return toSafePointDto(saved[0], clock(), { includeAdmin: true });
    },
  };
}
