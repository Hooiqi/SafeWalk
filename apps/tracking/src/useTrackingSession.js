import { useCallback, useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import { SOCKET_EVENTS as E } from '@safewalk/shared';
import { API_URL } from './config.js';
import { TrackingError, fetchTrackingView } from './api.js';

/**
 * Loads a journey through its share token and keeps it live over Socket.io.
 * After any reconnect the full view is re-fetched so nothing missed while
 * offline is lost; duplicate events (same event_id) and positions older than
 * the one already shown are ignored.
 */
export function useTrackingSession(token) {
  const [view, setView] = useState(null);
  const [error, setError] = useState(null);
  const [connection, setConnection] = useState('connecting');
  const seen = useRef(new Set());

  const reload = useCallback(
    async (signal) => {
      try {
        const data = await fetchTrackingView(token, signal);
        setView(data);
        setError(null);
      } catch (err) {
        if (err.name === 'AbortError') return;
        setError(err);
      }
    },
    [token],
  );

  useEffect(() => {
    const controller = new AbortController();
    reload(controller.signal);

    const socket = io(API_URL, { auth: { shareToken: token }, transports: ['websocket', 'polling'] });
    let wasConnected = false;

    const once = (handler) => (payload) => {
      if (payload?.event_id) {
        if (seen.current.has(payload.event_id)) return;
        seen.current.add(payload.event_id);
      }
      handler(payload);
    };

    socket.on('connect', () => {
      setConnection('live');
      if (wasConnected) reload();
      wasConnected = true;
    });
    socket.on('disconnect', () => setConnection('reconnecting'));
    socket.on('connect_error', (err) => {
      if (err.message === 'LINK_EXPIRED' || err.message === 'NOT_FOUND') {
        socket.close();
        setConnection('closed');
        setError(new TrackingError(err.message, ''));
      } else {
        setConnection('reconnecting');
      }
    });

    socket.on(
      E.TRIP_POSITION,
      once((p) =>
        setView((v) => {
          if (!v) return v;
          const current = v.last_location?.recorded_at;
          if (current && new Date(p.recorded_at) <= new Date(current)) return v; // stale sample
          const point = { lat: p.lat, lng: p.lng, recorded_at: p.recorded_at };
          return {
            ...v,
            last_location: { ...point, battery_level: p.battery_level, accuracy_m: p.accuracy_m },
            last_heartbeat_at: p.recorded_at,
            signal_lost_at: null,
            trail: [...v.trail, point],
          };
        }),
      ),
    );
    socket.on(E.TRIP_STATUS, once((p) => setView((v) => (v ? { ...v, ...p } : v))));
    socket.on(E.TRIP_SIGNAL, once((p) => setView((v) => (v ? { ...v, signal_lost_at: p.signal_lost ? p.signal_lost_at : null } : v))));

    return () => {
      controller.abort();
      socket.close();
    };
  }, [token, reload]);

  return { view, error, connection };
}
