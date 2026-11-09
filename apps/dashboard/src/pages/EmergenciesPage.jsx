import { CircleCheck, Radio, RotateCw, Volume2, VolumeX, WifiOff } from 'lucide-react';
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
  const { alerts, status, error, connection, incoming, reload, setAlerts, replaceAlert } = emergencies;
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
  const hasTrail = Boolean(selected?.trail);
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
          <p className="muted">SOS alerts and overdue journeys, newest first.</p>
        </div>
        <div className="page__actions">
          <span className={`status ${connection === 'live' ? 'status--done' : 'status--open'}`} role="status">
            {connection === 'live' ? <Radio aria-hidden="true" /> : <WifiOff aria-hidden="true" />}
            {connection === 'live' ? 'Live' : 'Reconnecting'}
          </span>
          {alarm.supported && (
            <button type="button" className={`btn${soundOn ? '' : ' btn--primary'}`} onClick={toggleSound} aria-pressed={soundOn}>
              {soundOn ? <Volume2 aria-hidden="true" /> : <VolumeX aria-hidden="true" />}
              {soundOn ? 'Alarm sound on' : 'Turn on alarm sound'}
            </button>
          )}
          {soundOn && unacknowledged > 0 && !silenced && (
            <button type="button" className="btn" onClick={() => setSilenced(true)}>
              Silence
            </button>
          )}
        </div>
      </header>

      {unacknowledged > 0 && (
        <div className="strip" role="alert">
          <strong>
            {unacknowledged} {unacknowledged > 1 ? 'alerts' : 'alert'} not acknowledged
          </strong>
          <span>Open it, press Received alert and send a patrol. The alarm stops once every alert is acknowledged.</span>
        </div>
      )}

      {status === 'loading' && (
        <div className="split" aria-busy="true" aria-label="Loading alerts">
          <div className="queue-panel">
            {[0, 1, 2].map((i) => (
              <div key={i} className="skeleton skeleton--row" />
            ))}
          </div>
          <div className="skeleton skeleton--pane" />
        </div>
      )}
      {status === 'error' && (
        <div className="state state--error" role="alert">
          <p>Could not load alerts: {error.message}</p>
          <button type="button" className="btn" onClick={reload}>
            <RotateCw aria-hidden="true" /> Try again
          </button>
        </div>
      )}
      {status === 'ready' && alerts.length === 0 && (
        <div className="state state--empty">
          <CircleCheck aria-hidden="true" className="state__icon" />
          <h2>No open emergencies</h2>
          <p className="muted">New SOS and overdue-journey alerts appear here at once, with an alarm when sound is on.</p>
        </div>
      )}
      {status === 'ready' && alerts.length > 0 && (
        <div className="split">
          <div className="queue-panel">
            <AlertList alerts={alerts} selectedId={selected?.alert_id} onSelect={setSelectedId} now={now} />
          </div>
          {selected && <AlertDetail alert={selected} now={now} accessToken={accessToken} onUpdated={replaceAlert} />}
        </div>
      )}
    </div>
  );
}
