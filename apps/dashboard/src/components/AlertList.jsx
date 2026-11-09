import { formatAgo, formatTime } from '@safewalk/shared';
import { ALERT_STATUS_LABEL, TRIGGER_LABEL, alertStateNote } from './labels.js';

const badgeTone = (status) => (status === 'NEW' ? 'sw-badge--danger' : status === 'RESOLVED' ? 'sw-badge--done' : 'sw-badge--active');

export default function AlertList({ alerts, selectedId, onSelect, now }) {
  return (
    <ul className="alert-list" aria-label="Open emergencies">
      {alerts.map((a) => {
        const note = alertStateNote(a);
        return (
          <li key={a.alert_id}>
            <button
              type="button"
              className={`alert-row${a.alert_id === selectedId ? ' alert-row--selected' : ''}${a.status === 'NEW' ? ' alert-row--new' : ''}`}
              onClick={() => onSelect(a.alert_id)}
              aria-current={a.alert_id === selectedId}
            >
              <span className="alert-row__top">
                <span className={`alert-row__type${a.trigger_type === 'ETA' ? '' : ' alert-row__type--sos'}`}>{TRIGGER_LABEL[a.trigger_type] ?? a.trigger_type}</span>
                <span className="sw-num sw-muted" title={a.triggered_at}>{formatTime(a.triggered_at)}</span>
              </span>
              <span className="alert-row__name">{a.user?.full_name ?? 'Unknown user'}</span>
              <span className="alert-row__meta">
                <span className={`sw-badge ${badgeTone(a.status)}`}>{ALERT_STATUS_LABEL[a.status]}</span>
                <span className={`alert-row__note alert-row__note--${note.tone}`}>{note.text}</span>
              </span>
              <span className="alert-row__ago sw-muted">{formatAgo(a.triggered_at, now)}</span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
