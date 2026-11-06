import { useEffect, useMemo, useRef, useState } from 'react';
import AlertDetail from '../components/AlertDetail.jsx';
import AlertList from '../components/AlertList.jsx';
import { createAlarm } from '../lib/alarm.js';
import { apiGet } from '../lib/api.js';

function useNow() {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 5000);
    return () => clearInterval(id);
  }, []);
  return now;
}

export default function EmergenciesPage({ accessToken, emergencies }) {
  const { alerts, status, error, connection, incoming, reload, setAlerts } = emergencies;
  const [selectedId, setSelectedId] = useState(null);
  const [soundOn, setSoundOn] = useState(false);
  const alarm = useRef(createAlarm()).current;
  const now = useNow();

  const unacknowledged = alerts.filter((a) => a.status === 'NEW').length;
  const selected = useMemo(() => alerts.find((a) => a.alert_id === selectedId) ?? alerts[0] ?? null, [alerts, selectedId]);

  // Jump to an alert that has just arrived.
  useEffect(() => {
    if (incoming) setSelectedId(incoming.alert_id);
  }, [incoming]);

  // Sound the alarm while any alert is unacknowledged (acknowledging is Module 4).
  const [silenced, setSilenced] = useState(false);
  useEffect(() => setSilenced(false), [incoming]);
  useEffect(() => {
    if (soundOn && unacknowledged > 0 && !silenced) alarm.start();
    else alarm.stop();
    return () => alarm.stop();
  }, [alarm, soundOn, unacknowledged, silenced]);

  // Load route history for the selected alert.
  const selectedKey = selected?.alert_id;
  const hasTrail = Boolean(selected?.trip?.trail);
  useEffect(() => {
    if (!selectedKey || hasTrail) return;
    const controller = new AbortController();
    apiGet(`/api/staff/alerts/${selectedKey}`, accessToken, controller.signal)
      .then((full) => setAlerts((list) => list.map((a) => (a.alert_id === full.alert_id ? full : a))))
      .catch(() => {});
    return () => controller.abort();
  }, [selectedKey, hasTrail, accessToken, setAlerts]);

  async function toggleSound() {
    if (!soundOn) await alarm.enable();
    setSoundOn((v) => !v);
  }

  return (
    <div className="page">
      <header className="page__header">
        <div>
          <h1>Live emergencies</h1>
          <p className="sw-muted">Overdue journeys escalated by the SafeWalk ETA watchdog.</p>
        </div>
        <div className="page__actions">
          <span className={`conn conn--${connection}`}>{connection === 'live' ? 'Live' : 'Reconnecting…'}</span>
          {alarm.supported && (
            <button type="button" className={`sw-button${soundOn ? '' : ' sw-button--primary'}`} onClick={toggleSound} aria-pressed={soundOn}>
              {soundOn ? 'Alarm sound on' : 'Enable alarm sound'}
            </button>
          )}
          {soundOn && unacknowledged > 0 && !silenced && (
            <button type="button" className="sw-button" onClick={() => setSilenced(true)}>
              Silence
            </button>
          )}
        </div>
      </header>

      {unacknowledged > 0 && (
        <div className="banner" role="alert">
          <strong>{unacknowledged} unacknowledged emergency{unacknowledged > 1 ? ' alerts' : ' alert'}</strong>
          <span>Review the person&apos;s last known location and dispatch a patrol.</span>
        </div>
      )}

      {status === 'loading' && <p className="sw-muted state">Loading alerts…</p>}
      {status === 'error' && (
        <div className="state state--error">
          <p>Could not load alerts: {error.message}</p>
          <button type="button" className="sw-button" onClick={reload}>Try again</button>
        </div>
      )}
      {status === 'ready' && alerts.length === 0 && (
        <div className="state state--empty">
          <h2>No open emergencies</h2>
          <p className="sw-muted">New overdue-journey alerts appear here immediately, with an alarm if sound is enabled.</p>
        </div>
      )}
      {status === 'ready' && alerts.length > 0 && (
        <div className="split">
          <AlertList alerts={alerts} selectedId={selected?.alert_id} onSelect={setSelectedId} now={now} />
          {selected && <AlertDetail alert={selected} now={now} />}
        </div>
      )}
    </div>
  );
}
