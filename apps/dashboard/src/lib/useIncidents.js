import { useCallback, useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import { SOCKET_EVENTS as E } from '@safewalk/shared';
import { apiGet } from './api.js';
import { API_URL } from './config.js';

/**
 * Incident reports for the review queue. The list comes from REST; Socket.io
 * says when a report arrives or an incident changes, and the list is reloaded
 * (so the server stays the only source of truth). `version` changes on every
 * update so an open detail pane knows to refresh itself.
 */
export function useIncidents(accessToken, filter = 'OPEN') {
  const [incidents, setIncidents] = useState([]);
  const [status, setStatus] = useState('loading');
  const [error, setError] = useState(null);
  const [pendingCount, setPendingCount] = useState(0);
  const [version, setVersion] = useState(0);
  const [incoming, setIncoming] = useState(null);
  const tokenRef = useRef(accessToken);
  tokenRef.current = accessToken;
  const filterRef = useRef(filter);
  filterRef.current = filter;

  const reload = useCallback(async () => {
    try {
      const [{ incidents: list }, { incidents: pending }] = await Promise.all([
        apiGet(`/api/staff/incidents?status=${filterRef.current}`, tokenRef.current),
        filterRef.current === 'PENDING' ? Promise.resolve({ incidents: null }) : apiGet('/api/staff/incidents?status=PENDING', tokenRef.current),
      ]);
      setIncidents(list);
      setPendingCount((pending ?? list).length);
      setStatus('ready');
      setError(null);
    } catch (err) {
      setStatus('error');
      setError(err);
    }
  }, []);

  useEffect(() => {
    setStatus('loading');
    reload();
  }, [reload, filter]);

  useEffect(() => {
    const socket = io(API_URL, { auth: (cb) => cb({ token: tokenRef.current }), transports: ['websocket', 'polling'] });
    let timer = null;
    let wasConnected = false;
    // Several reports can arrive together; reload once.
    const soon = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        reload();
        setVersion((v) => v + 1);
      }, 250);
    };
    socket.on('connect', () => {
      if (wasConnected) soon();
      wasConnected = true;
    });
    socket.on(E.AUTH_EXPIRED, () => socket.connect());
    socket.on(E.INCIDENT_NEW, (p) => {
      setIncoming(p.incident);
      soon();
    });
    socket.on(E.INCIDENT_UPDATED, soon);
    return () => {
      clearTimeout(timer);
      socket.close();
    };
  }, [reload]);

  return { incidents, status, error, pendingCount, version, incoming, reload };
}
