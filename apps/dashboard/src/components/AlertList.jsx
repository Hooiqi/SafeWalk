import { Clock, ShieldAlert, Siren } from 'lucide-react';
import { formatAgo, formatTime } from '@safewalk/shared';
import { ALERT_STATUS_LABEL, TRIGGER_LABEL, alertStateNote, statusTone } from './labels.js';

const TriggerIcon = ({ type }) => (type === 'ETA' ? <Clock aria-hidden="true" /> : type === 'SILENT' ? <ShieldAlert aria-hidden="true" /> : <Siren aria-hidden="true" />);

/** The queue: one ruled row per alert, newest first. */
export default function AlertList({ alerts, selectedId, onSelect, now }) {
  return (
    <ul className="queue ruled" aria-label="Open emergencies">
      {alerts.map((a) => {
        const note = alertStateNote(a);
        const name = a.user?.full_name ?? 'Unknown person';
        return (
          <li key={a.alert_id}>
            <button
              type="button"
              className={`queue__row${a.alert_id === selectedId ? ' queue__row--selected' : ''}`}
              onClick={() => onSelect(a.alert_id)}
              aria-current={a.alert_id === selectedId}
            >
              <span className="queue__initial" aria-hidden="true">{name.charAt(0)}</span>
              <span className="queue__main">
                <span className="queue__name">{name}</span>
                <span className="queue__type">
                  <TriggerIcon type={a.trigger_type} />
                  {TRIGGER_LABEL[a.trigger_type] ?? a.trigger_type}
                </span>
                <span className={`queue__note queue__note--${note.tone}`}>{note.text}</span>
              </span>
              <span className="queue__side">
                <span className="num" title={a.triggered_at}>{formatTime(a.triggered_at)}</span>
                <span className="muted small">{formatAgo(a.triggered_at, now)}</span>
                <span className={`status status--${statusTone(a.status)}`}>{ALERT_STATUS_LABEL[a.status]}</span>
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
