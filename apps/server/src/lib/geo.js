import { z } from 'zod';

export const latLngSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});

/** WKT for a PostGIS geography point (longitude first). */
export const pointWkt = ({ lat, lng }) => `SRID=4326;POINT(${lng} ${lat})`;

/** WKT LineString from GeoJSON [lng, lat] coordinates. */
export const lineWkt = (coordinates) =>
  `SRID=4326;LINESTRING(${coordinates.map(([lng, lat]) => `${lng} ${lat}`).join(',')})`;

/** Great-circle distance in metres (haversine). */
export function distanceMeters(a, b) {
  const R = 6371008.8;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** OpenStreetMap link a trusted contact can open without the app. */
export const osmLink = ({ lat, lng }) =>
  `https://www.openstreetmap.org/?mlat=${lat.toFixed(6)}&mlon=${lng.toFixed(6)}#map=18/${lat.toFixed(6)}/${lng.toFixed(6)}`;
