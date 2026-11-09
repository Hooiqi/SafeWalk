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

/** Map colours come from tokens through class names (ui.css), never literals. */
export default function AlertMap({ alert }) {
  const trip = alert.trigger_type === 'ETA' ? alert.trip : null;
  const route = useMemo(() => trip?.route_geometry?.coordinates?.map(([lng, lat]) => [lat, lng]) ?? [], [trip?.route_geometry]);
  const trail = useMemo(() => alert.trail?.map((p) => [p.lat, p.lng]) ?? [], [alert.trail]);
  const last = alert.last_location;
  const lastPos = last ? [last.lat, last.lng] : null;
  const destination = trip ? [trip.destination.lat, trip.destination.lng] : null;
  const bounds = L.latLngBounds([...route, ...trail, ...(lastPos ? [lastPos] : []), ...(destination ? [destination] : [])]);

  if (!lastPos && !destination) {
    return (
      <div className="pane__map pane__map--empty">
        <p className="muted">No GPS position yet. The map appears as soon as the phone sends one.</p>
      </div>
    );
  }

  return (
    <MapContainer className="pane__map" center={lastPos ?? destination} zoom={17}>
      <TileLayer url={TILE_URL} attribution={TILE_ATTRIBUTION} className="sw-dark-tiles" maxZoom={19} />
      {route.length > 1 && <Polyline positions={route} className="mark-route" pathOptions={{ weight: 4, dashArray: '6 8' }} />}
      {trail.length > 1 && <Polyline positions={trail} className="mark-trail" pathOptions={{ weight: 4 }} />}
      {destination && (
        <CircleMarker center={destination} radius={8} className="mark-destination" pathOptions={{ weight: 3 }}>
          <Tooltip>Destination: {trip.destination.label ?? 'pinned point'}</Tooltip>
        </CircleMarker>
      )}
      {lastPos && (
        <CircleMarker center={lastPos} radius={11} className="mark-person" pathOptions={{ weight: 3 }}>
          <Tooltip permanent direction="top" offset={[0, -10]}>
            Last known location
          </Tooltip>
        </CircleMarker>
      )}
      <FitOnChange bounds={bounds} alertId={alert.alert_id} />
    </MapContainer>
  );
}
