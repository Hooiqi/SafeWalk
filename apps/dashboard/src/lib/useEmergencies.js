import { useCallback, useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import { SOCKET_EVENTS as E } from '@safewalk/shared';
import { apiGet } from './api.js';
import { API_URL } from './config.js';

/**
 * Open emergency alerts for the dashboard. The database is the source of
 * truth: the list is loaded over REST and re-loaded after every reconnect,
 * while Socket.io delivers new alerts and live positions in between.
 */
export function useEmergencies(accessToken) {
  const [alerts, setAlerts] = useState([]);
  const [status, setStatus] = useState('loading'); // loading | ready | error
  const [error, setError] = useState(null);
  const [connection, setConnection] = useState('connecting');
  const [incoming, setIncoming] = useState(null); // last alert received live
  const seen = useRef(new Set());
  const tokenRef = useRef(accessToken);
  tokenRef.current = accessToken;

  const reload = useCallback(async () => {
    try {
      const { alerts: list } = await apiGet('/api/staff/alerts?scope=open', tokenRef.current);
      setAlerts(list);
      setStatus('ready');
      setError(null);
    } catch (err) {
      setStatus('error');
      setError(err);
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  // One socket per session; refreshed tokens are picked up on reconnect.
  useEffect(() => {
    const socket = io(API_URL, { auth: (cb) => cb({ token: tokenRef.current }), transports: ['websocket', 'polling'] });
    let wasConnected = false;
    const once = (handler) => (p) => {
      if (p?.event_id) {
        if (seen.current.has(p.event_id)) return;
        seen.current.add(p.event_id);
      }
      handler(p);
    };
    const updateTrip = (tripId, fn) =>
      setAlerts((list) => list.map((a) => (a.trip?.trip_id === tripId ? { ...a, trip: fn(a.trip) } : a)));

    socket.on('connect', () => {
      setConnection('live');
      if (wasConnected) reload();
      wasConnected = true;
    });
    socket.on('disconnect', () => setConnection('reconnecting'));
    socket.on('connect_error', () => setConnection('reconnecting'));
    socket.on(E.AUTH_EXPIRED, () => socket.connect());

    socket.on(
      E.ALERT_NEW,
      once(({ alert }) => {
        setAlerts((list) => [alert, ...list.filter((a) => a.alert_id !== alert.alert_id)]);
        setIncoming(alert);
      }),
    );
    socket.on(
      E.ALERT_POSITION,
      once((p) =>
        updateTrip(p.trip_id, (trip) => {
          if (trip.last_location && new Date(p.recorded_at) <= new Date(trip.last_location.recorded_at)) return trip;
          const point = { lat: p.lat, lng: p.lng, recorded_at: p.recorded_at };
          return {
            ...trip,
            last_location: { ...point, battery_level: p.battery_level },
            signal_lost_at: null,
            trail: trip.trail ? [...trip.trail, point] : trip.trail,
          };
        }),
      ),
    );
    socket.on(E.TRIP_STATUS, once((p) => updateTrip(p.trip_id, (trip) => ({ ...trip, status: p.status, ended_at: p.ended_at, end_reason: p.end_reason }))));
    socket.on(E.TRIP_SIGNAL, once((p) => updateTrip(p.trip_id, (trip) => ({ ...trip, signal_lost_at: p.signal_lost ? p.signal_lost_at : null }))));

    return () => socket.close();
  }, [reload]);

  return { alerts, status, error, connection, incoming, reload, setAlerts };
}
