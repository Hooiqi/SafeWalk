import { distanceMeters } from '../../lib/geo.js';
import { HttpError } from '../../lib/errors.js';

/**
 * Walking routes from OSRM (proposal 5.2.3 1A). OSRM answers with the
 * shortest pedestrian path found by contraction hierarchies over OpenStreetMap.
 *
 * If OSRM cannot be reached, the server falls back to a straight-line
 * distance at a configured walking speed. The result is labelled
 * STRAIGHT_LINE_ESTIMATE so the apps can tell the user it is approximate;
 * a safety trip should not be blocked by a third-party outage.
 */
export function createRoutingService(config, { fetchImpl = fetch, logger } = {}) {
  async function osrmRoute(origin, destination) {
    const coords = `${origin.lng},${origin.lat};${destination.lng},${destination.lat}`;
    const url = `${config.OSRM_BASE_URL.replace(/\/$/, '')}/route/v1/${config.OSRM_PROFILE}/${coords}?overview=full&geometries=geojson&alternatives=false&steps=false`;
    const res = await fetchImpl(url, {
      signal: AbortSignal.timeout(config.OSRM_TIMEOUT_MS),
      headers: { 'User-Agent': 'SafeWalk-USM-CAT304/0.1 (academic project)' },
    });
    if (!res.ok) throw new Error(`OSRM responded ${res.status}`);
    const body = await res.json();
    if (body.code !== 'Ok' || !body.routes?.length) {
      const err = new Error(`OSRM could not route: ${body.code}`);
      err.noRoute = body.code === 'NoRoute';
      throw err;
    }
    const route = body.routes[0];
    return {
      source: 'OSRM',
      distance_m: Math.round(route.distance),
      duration_s: Math.round(route.duration),
      geometry: route.geometry, // GeoJSON LineString [lng, lat]
    };
  }

  function straightLineEstimate(origin, destination) {
    const distance = distanceMeters(origin, destination);
    return {
      source: 'STRAIGHT_LINE_ESTIMATE',
      distance_m: Math.round(distance),
      duration_s: Math.round(distance / config.FALLBACK_WALKING_SPEED_MPS),
      geometry: { type: 'LineString', coordinates: [[origin.lng, origin.lat], [destination.lng, destination.lat]] },
    };
  }

  return {
    async walkingRoute(origin, destination) {
      const direct = distanceMeters(origin, destination);
      if (direct < 10) {
        throw new HttpError(400, 'DESTINATION_TOO_CLOSE', 'Destination is less than 10 m from your location');
      }
      if (direct > config.MAX_ROUTE_DISTANCE_M) {
        throw new HttpError(400, 'DESTINATION_TOO_FAR', 'Destination is too far for a walking journey');
      }
      try {
        return await osrmRoute(origin, destination);
      } catch (err) {
        if (err.noRoute) {
          throw new HttpError(422, 'NO_WALKING_ROUTE', 'No walking route was found to that destination');
        }
        logger?.warn({ err: err.message }, 'OSRM unavailable, using straight-line estimate');
        return straightLineEstimate(origin, destination);
      }
    },
  };
}
