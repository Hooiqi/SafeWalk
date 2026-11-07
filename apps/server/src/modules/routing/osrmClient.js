import { distanceMeters } from '../../lib/geo.js';
import { HttpError } from '../../lib/errors.js';

/**
 * Walking routes from OSRM (proposal 5.2.3 1A). OSRM answers with the
 * shortest pedestrian path found by contraction hierarchies over OpenStreetMap.
 *
 * If OSRM cannot be reached, the server falls back to a straight-line
 * distance at a configured walking speed. The result is labelled
 * STRAIGHT_LINE_ESTIMATE so the apps can tell the user it is approximate;
 * a safety trip or an emergency should not be blocked by a third-party outage.
 */

const MODIFIER_TEXT = {
  left: 'left',
  right: 'right',
  'slight left': 'slightly left',
  'slight right': 'slightly right',
  'sharp left': 'sharp left',
  'sharp right': 'sharp right',
  straight: 'straight',
  uturn: 'around',
};

/** Plain-English instruction for one OSRM step (OSRM itself returns only maneuver codes). */
export function stepInstruction(step) {
  const { type, modifier } = step.maneuver ?? {};
  const onto = step.name ? ` onto ${step.name}` : '';
  const dir = MODIFIER_TEXT[modifier] ?? '';
  switch (type) {
    case 'depart':
      return step.name ? `Start on ${step.name}` : 'Start walking';
    case 'arrive':
      return 'Arrive at your destination';
    case 'roundabout':
    case 'rotary':
      return `Go around the roundabout${step.maneuver.exit ? ` and take exit ${step.maneuver.exit}` : ''}${onto}`;
    case 'fork':
    case 'off ramp':
    case 'on ramp':
      return `Keep ${dir || 'ahead'}${onto}`;
    case 'continue':
    case 'new name':
      return modifier === 'straight' || !dir ? `Continue${onto || ' straight'}` : `Continue ${dir}${onto}`;
    default: // turn, end of road, merge, notification
      if (modifier === 'uturn') return `Turn around${onto}`;
      if (modifier === 'straight') return `Go straight${onto}`;
      return dir ? `Turn ${dir}${onto}` : `Continue${onto}`;
  }
}

export function createRoutingService(config, { fetchImpl = fetch, logger } = {}) {
  const base = config.OSRM_BASE_URL.replace(/\/$/, '');
  const coord = (p) => `${p.lng},${p.lat}`;

  async function osrmGet(path) {
    const res = await fetchImpl(`${base}${path}`, {
      signal: AbortSignal.timeout(config.OSRM_TIMEOUT_MS),
      headers: { 'User-Agent': 'SafeWalk-USM-CAT304/0.1 (academic project)' },
    });
    if (!res.ok) throw new Error(`OSRM responded ${res.status}`);
    const body = await res.json();
    if (body.code !== 'Ok') {
      const err = new Error(`OSRM error: ${body.code}`);
      err.noRoute = body.code === 'NoRoute';
      throw err;
    }
    return body;
  }

  async function osrmRoute(origin, destination, { steps }) {
    const body = await osrmGet(
      `/route/v1/${config.OSRM_PROFILE}/${coord(origin)};${coord(destination)}?overview=full&geometries=geojson&alternatives=false&steps=${steps}`,
    );
    if (!body.routes?.length) throw Object.assign(new Error('OSRM returned no route'), { noRoute: true });
    const route = body.routes[0];
    const result = {
      source: 'OSRM',
      distance_m: Math.round(route.distance),
      duration_s: Math.round(route.duration),
      geometry: route.geometry, // GeoJSON LineString [lng, lat]
    };
    if (steps) {
      result.steps = (route.legs ?? [])
        .flatMap((leg) => leg.steps ?? [])
        .map((s) => ({ instruction: stepInstruction(s), distance_m: Math.round(s.distance ?? 0) }));
    }
    return result;
  }

  function straightLineEstimate(origin, destination, { steps }) {
    const distance = distanceMeters(origin, destination);
    const result = {
      source: 'STRAIGHT_LINE_ESTIMATE',
      distance_m: Math.round(distance),
      duration_s: Math.round(distance / config.FALLBACK_WALKING_SPEED_MPS),
      geometry: { type: 'LineString', coordinates: [[origin.lng, origin.lat], [destination.lng, destination.lat]] },
    };
    if (steps) result.steps = [];
    return result;
  }

  return {
    async walkingRoute(origin, destination, { steps = false } = {}) {
      const direct = distanceMeters(origin, destination);
      if (direct < 10) {
        throw new HttpError(400, 'DESTINATION_TOO_CLOSE', 'Destination is less than 10 m from your location');
      }
      if (direct > config.MAX_ROUTE_DISTANCE_M) {
        throw new HttpError(400, 'DESTINATION_TOO_FAR', 'Destination is too far for a walking journey');
      }
      try {
        return await osrmRoute(origin, destination, { steps });
      } catch (err) {
        if (err.noRoute) {
          throw new HttpError(422, 'NO_WALKING_ROUTE', 'No walking route was found to that destination');
        }
        logger?.warn({ err: err.message }, 'OSRM unavailable, using straight-line estimate');
        return straightLineEstimate(origin, destination, { steps });
      }
    },

    /**
     * Walking time and distance from one origin to many destinations in a
     * single OSRM table request (used to rank safe points by actual walking
     * time). Falls back to straight-line estimates per destination.
     * @returns {Promise<Array<{ distance_m: number, duration_s: number, source: string }>>}
     */
    async walkingTimes(origin, destinations) {
      if (destinations.length === 0) return [];
      const fallback = () =>
        destinations.map((d) => {
          const distance = distanceMeters(origin, d);
          return {
            source: 'STRAIGHT_LINE_ESTIMATE',
            distance_m: Math.round(distance),
            duration_s: Math.round(distance / config.FALLBACK_WALKING_SPEED_MPS),
          };
        });
      try {
        const coords = [origin, ...destinations].map(coord).join(';');
        const body = await osrmGet(`/table/v1/${config.OSRM_PROFILE}/${coords}?sources=0&annotations=duration,distance`);
        const durations = body.durations?.[0];
        const distances = body.distances?.[0];
        if (!durations) throw new Error('OSRM table without durations');
        const estimates = fallback();
        // Index 0 is the origin itself. Unreachable destinations come back as null.
        return destinations.map((_, i) =>
          durations[i + 1] == null
            ? estimates[i]
            : {
                source: 'OSRM',
                duration_s: Math.round(durations[i + 1]),
                distance_m: Math.round(distances?.[i + 1] ?? estimates[i].distance_m),
              },
        );
      } catch (err) {
        logger?.warn({ err: err.message }, 'OSRM table unavailable, using straight-line estimates');
        return fallback();
      }
    },
  };
}
