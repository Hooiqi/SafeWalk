import L from 'leaflet';
import { useEffect, useMemo } from 'react';
import { CircleMarker, MapContainer, Polyline, TileLayer, Tooltip, useMap } from 'react-leaflet';
import { TILE_ATTRIBUTION, TILE_URL } from '../lib/config.js';

function FitOnChange({ bounds, alertId }) {
  const map = useMap();
  useEffect(() => {
    if (bounds.isValid()) map.fitBounds(bounds, { padding: [40, 40], maxZoom: 18, animate: false });
    // Refit only when a different alert is selected, not on every GPS update.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, alertId]);
  return null;
}

export default function AlertMap({ alert }) {
  const trip = alert.trip;
  const route = useMemo(() => trip?.route_geometry?.coordinates?.map(([lng, lat]) => [lat, lng]) ?? [], [trip?.route_geometry]);
  const trail = useMemo(() => trip?.trail?.map((p) => [p.lat, p.lng]) ?? [], [trip?.trail]);
  const last = trip?.last_location ?? alert.alert_location;
  const lastPos = last ? [last.lat, last.lng] : null;
  const destination = trip ? [trip.destination.lat, trip.destination.lng] : null;
  const bounds = L.latLngBounds([...route, ...trail, ...(lastPos ? [lastPos] : []), ...(destination ? [destination] : [])]);

  return (
    <MapContainer className="alert-map" center={lastPos ?? destination ?? [5.3559, 100.3025]} zoom={17}>
      <TileLayer url={TILE_URL} attribution={TILE_ATTRIBUTION} className="sw-dark-tiles" maxZoom={19} />
      {route.length > 1 && <Polyline positions={route} pathOptions={{ color: '#A89FA3', weight: 4, opacity: 0.5, dashArray: '6 8' }} />}
      {trail.length > 1 && <Polyline positions={trail} pathOptions={{ color: '#FFA372', weight: 4 }} />}
      {destination && (
        <CircleMarker center={destination} radius={8} pathOptions={{ color: '#FDF9FA', weight: 3, fillColor: '#120F11', fillOpacity: 1 }}>
          <Tooltip>Destination: {trip.destination.label ?? 'pinned point'}</Tooltip>
        </CircleMarker>
      )}
      {lastPos && (
        <CircleMarker center={lastPos} radius={11} pathOptions={{ color: '#120F11', weight: 3, fillColor: '#FF6B81', fillOpacity: 1 }}>
          <Tooltip permanent direction="top" offset={[0, -10]}>
            Last known location
          </Tooltip>
        </CircleMarker>
      )}
      <FitOnChange bounds={bounds} alertId={alert.alert_id} />
    </MapContainer>
  );
}
