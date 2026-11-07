import { useCallback, useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import { SOCKET_EVENTS as E } from '@safewalk/shared';
import { apiGet } from './api.js';
import { API_URL } from './config.js';

const newer = (a, b) => !b || new Date(a) > new Date(b);

/**
 * Emergency alerts for the dashboard (overdue journeys and SOS). The database
 * is the source of truth: the list is loaded over REST and re-loaded after
 * every reconnect, while Socket.io delivers new alerts, live positions and
 * status changes in between.
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

  /** Replace one alert with the full version returned by the server. */
  const replaceAlert = useCallback((full) => setAlerts((list) => list.map((a) => (a.alert_id === full.alert_id ? full : a))), []);

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
    const update = (match, fn) => setAlerts((list) => list.map((a) => (match(a) ? fn(a) : a)));
    const byTrip = (tripId) => (a) => a.trigger_type === 'ETA' && a.trip?.trip_id === tripId;

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

    // Live position: SOS alerts carry alert_id, escalated journeys trip_id.
    socket.on(
      E.ALERT_POSITION,
      once((p) => {
        const match = p.alert_id ? (a) => a.alert_id === p.alert_id : byTrip(p.trip_id);
        update(match, (a) => {
          if (!newer(p.recorded_at, a.last_location?.recorded_at)) return a; // stale or duplicate
          const point = { lat: p.lat, lng: p.lng, recorded_at: p.recorded_at };
          return {
            ...a,
            last_location: { ...point, battery_level: p.battery_level, accuracy_m: p.accuracy_m },
            trail: a.trail ? [...a.trail, point] : a.trail,
            trip: a.trip ? { ...a.trip, signal_lost_at: null } : a.trip,
          };
        });
      }),
    );

    socket.on(
      E.ALERT_STATUS,
      once((p) =>
        update(
          (a) => a.alert_id === p.alert_id,
          (a) => ({
            ...a,
            status: p.status,
            resolved_at: p.resolved_at,
            user_safe_at: p.user_safe_at,
            status_history:
              a.status_history && p.latest && !a.status_history.some((h) => h.updated_at === p.latest.updated_at && h.new_status === p.latest.new_status)
                ? [...a.status_history, p.latest]
                : a.status_history,
          }),
        ),
      ),
    );

    socket.on(
      E.TRIP_STATUS,
      once((p) => update(byTrip(p.trip_id), (a) => ({ ...a, trip: { ...a.trip, status: p.status, ended_at: p.ended_at, end_reason: p.end_reason } }))),
    );
    socket.on(
      E.TRIP_SIGNAL,
      once((p) => update(byTrip(p.trip_id), (a) => ({ ...a, trip: { ...a.trip, signal_lost_at: p.signal_lost ? p.signal_lost_at : null } }))),
    );

    return () => socket.close();
  }, [reload]);

  return { alerts, status, error, connection, incoming, reload, setAlerts, replaceAlert };
}
