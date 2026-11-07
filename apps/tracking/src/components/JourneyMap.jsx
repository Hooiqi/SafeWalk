import L from 'leaflet';
import { useEffect, useMemo, useRef } from 'react';
import { CircleMarker, MapContainer, Polyline, TileLayer, Tooltip, useMap } from 'react-leaflet';
import { TILE_ATTRIBUTION, TILE_URL } from '../config.js';

const toLatLng = (p) => [p.lat, p.lng];

/** Fits the whole journey once, then follows the traveller unless the viewer has moved the map. */
function FollowTraveller({ bounds, position }) {
  const map = useMap();
  const userMoved = useRef(false);
  const fitted = useRef(false);

  useEffect(() => {
    const onDrag = () => (userMoved.current = true);
    map.on('dragstart zoomstart', onDrag);
    return () => map.off('dragstart zoomstart', onDrag);
  }, [map]);

  useEffect(() => {
    if (!fitted.current && bounds.isValid()) {
      map.fitBounds(bounds, { padding: [48, 48], maxZoom: 18, animate: false });
      fitted.current = true;
      userMoved.current = false;
    }
  }, [map, bounds]);

  useEffect(() => {
    if (fitted.current && position && !userMoved.current && !map.getBounds().pad(-0.15).contains(position)) {
      map.panTo(position);
    }
  }, [map, position]);

  return null;
}

export default function JourneyMap({ view }) {
  const route = useMemo(
    () => view.route_geometry?.coordinates?.map(([lng, lat]) => [lat, lng]) ?? [],
    [view.route_geometry],
  );
  const trail = useMemo(() => view.trail.map(toLatLng), [view.trail]);
  const current = view.last_location ? toLatLng(view.last_location) : null;
  const destination = view.destination ? toLatLng(view.destination) : null;
  const bounds = useMemo(
    () => L.latLngBounds([...route, ...trail, ...(destination ? [destination] : []), ...(current ? [current] : [])]),
    [route, trail, destination, current],
  );
  const ended = view.status === 'COMPLETED' || view.status === 'CANCELLED';
  const emergency = view.status === 'ESCALATED' || view.kind === 'SOS';

  return (
    <MapContainer className="map" center={destination ?? current ?? [5.3559, 100.3025]} zoom={16} zoomControl attributionControl>
      <TileLayer url={TILE_URL} attribution={TILE_ATTRIBUTION} className="sw-dark-tiles" maxZoom={19} />
      {route.length > 1 && (
        <Polyline positions={route} pathOptions={{ color: '#A89FA3', weight: 4, opacity: 0.55, dashArray: '6 8' }} />
      )}
      {trail.length > 1 && <Polyline positions={trail} pathOptions={{ color: '#FFA372', weight: 4, opacity: 0.95 }} />}
      {destination && (
      <CircleMarker center={destination} radius={9} pathOptions={{ color: '#FDF9FA', weight: 3, fillColor: '#120F11', fillOpacity: 1 }}>
        <Tooltip direction="top" offset={[0, -8]} permanent={false}>
          {view.destination.label ?? 'Destination'}
        </Tooltip>
      </CircleMarker>
      )}
      {current && (
        <CircleMarker
          center={current}
          radius={10}
          pathOptions={{
            color: '#120F11',
            weight: 3,
            fillColor: emergency ? '#FF6B81' : ended ? '#A89FA3' : '#FF6B81',
            fillOpacity: 1,
          }}
        >
          <Tooltip direction="top" offset={[0, -10]}>
            {view.traveller_name} · last position
          </Tooltip>
        </CircleMarker>
      )}
      <FollowTraveller bounds={bounds} position={current} />
    </MapContainer>
  );
}
