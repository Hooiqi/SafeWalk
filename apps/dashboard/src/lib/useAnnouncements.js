import { useCallback, useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import { SOCKET_EVENTS as E } from '@safewalk/shared';
import { apiGet } from './api.js';
import { API_URL } from './config.js';

/**
 * Announcements for the dashboard. REST is the source of truth; Socket.io
 * says when one goes live or changes (another officer may be publishing), and
 * a one-minute refresh moves scheduled ones to "live" and live ones to
 * "expired" on time.
 */
export function useAnnouncements(accessToken) {
  const [announcements, setAnnouncements] = useState([]);
  const [status, setStatus] = useState('loading');
  const [error, setError] = useState(null);
  const tokenRef = useRef(accessToken);
  tokenRef.current = accessToken;

  const reload = useCallback(async () => {
    try {
      const { announcements: list } = await apiGet('/api/staff/announcements', tokenRef.current);
      setAnnouncements(list);
      setStatus('ready');
      setError(null);
    } catch (err) {
      setStatus('error');
      setError(err);
    }
  }, []);

  useEffect(() => {
    reload();
    const timer = setInterval(reload, 60_000);
    return () => clearInterval(timer);
  }, [reload]);

  useEffect(() => {
    const socket = io(API_URL, { auth: (cb) => cb({ token: tokenRef.current }), transports: ['websocket', 'polling'] });
    socket.on(E.AUTH_EXPIRED, () => socket.connect());
    socket.on(E.ANNOUNCEMENT_LIVE, reload);
    socket.on(E.ANNOUNCEMENT_UPDATED, reload);
    return () => socket.close();
  }, [reload]);

  return { announcements, status, error, reload, setAnnouncements };
}
