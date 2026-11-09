import { formatAgo, formatDateTime, formatTime } from '@safewalk/shared';
import AlertMap from './AlertMap.jsx';
import ResponsePanel from './ResponsePanel.jsx';
import { ALERT_STATUS_LABEL, TRIGGER_LABEL, alertStateNote, statusTone } from './labels.js';

function Row({ label, children }) {
  return (
    <div className="facts__row">
      <dt>{label}</dt>
      <dd>{children ?? <span className="muted">Not provided</span>}</dd>
    </div>
  );
}

/** One glass pane beside the queue: the person, where they are, and the response. */
export default function AlertDetail({ alert, now, accessToken, onUpdated }) {
  const { user, trip } = alert;
  const last = alert.last_location;
  const note = alertStateNote(alert);

  return (
    <article className="pane glass" aria-labelledby="detail-title">
      <header className="pane__head">
        <div>
          <h2 id="detail-title">{user?.full_name ?? 'Unknown person'}</h2>
          <p className="muted small">
            {TRIGGER_LABEL[alert.trigger_type]}, raised {formatDateTime(alert.triggered_at)}
          </p>
        </div>
        <span className={`status status--${statusTone(alert.status)}`}>{ALERT_STATUS_LABEL[alert.status]}</span>
      </header>
      <p className={`pane__note pane__note--${note.tone}`}>{note.text}</p>

      <AlertMap alert={alert} />

      <div className="pane__body">
        <dl className="facts">
          <Row label="Phone">{user?.phone_number && <a href={`tel:${user.phone_number}`}>{user.phone_number}</a>}</Row>
          <Row label="Matric or staff no.">{user?.matric_or_staff_id}</Row>
          <Row label="Email">{user?.email}</Row>
          <Row label="Last position">
            {last && (
              <>
                <span className="num">{last.lat.toFixed(6)}, {last.lng.toFixed(6)}</span>
                <span className="muted"> at {formatTime(last.recorded_at)}, {formatAgo(last.recorded_at, now)}</span>
              </>
            )}
          </Row>
          <Row label="GPS accuracy">{last?.accuracy_m != null ? <span className="num">{Math.round(last.accuracy_m)} m</span> : null}</Row>
          <Row label="Phone battery">{last?.battery_level != null ? <span className="num">{last.battery_level}%</span> : null}</Row>
          {trip?.signal_lost_at && <Row label="Signal">Lost since {formatTime(trip.signal_lost_at)}</Row>}
          {trip && (
            <>
              <Row label="Walking to">{trip.destination.label ?? 'A pinned point'}</Row>
              <Row label="Expected arrival">
                <span className="num">{formatTime(trip.eta_deadline)}</span>
                <span className="muted">, started {formatTime(trip.started_at)}</span>
              </Row>
            </>
          )}
          {alert.trigger_type === 'ETA' && <Row label="Route history">{alert.trail ? `${alert.trail.length} GPS points` : 'Loading'}</Row>}
        </dl>
        <ResponsePanel alert={alert} accessToken={accessToken} onUpdated={onUpdated} />
      </div>
    </article>
  );
}
