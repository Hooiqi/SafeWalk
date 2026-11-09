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
      {/* The page sends no referrer (the URL holds the share token), but the
          OpenStreetMap tile servers refuse requests without one. Tiles send
          the site's origin only, never the path with the token. */}
      <TileLayer url={TILE_URL} attribution={TILE_ATTRIBUTION} className="sw-dark-tiles" maxZoom={19} referrerPolicy="origin" />
      {route.length > 1 && (
        <Polyline positions={route} className="mark-route" pathOptions={{ weight: 4, dashArray: '6 8' }} />
      )}
      {trail.length > 1 && <Polyline positions={trail} className="mark-trail" pathOptions={{ weight: 4 }} />}
      {destination && (
      <CircleMarker center={destination} radius={9} className="mark-destination" pathOptions={{ weight: 3 }}>
        <Tooltip direction="top" offset={[0, -8]} permanent={false}>
          {view.destination.label ?? 'Destination'}
        </Tooltip>
      </CircleMarker>
      )}
      {current && (
        <CircleMarker
          center={current}
          radius={10}
          key={ended && !emergency ? 'person-done' : 'person-live'}
          className={emergency || !ended ? 'mark-person' : 'mark-person mark-person--done'}
          pathOptions={{ weight: 3 }}
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
