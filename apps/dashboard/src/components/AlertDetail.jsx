import { formatAgo, formatDateTime, formatTime } from '@safewalk/shared';
import AlertMap from './AlertMap.jsx';
import ResponsePanel from './ResponsePanel.jsx';
import { ALERT_STATUS_LABEL, TRIGGER_LABEL, alertStateNote } from './labels.js';

function Field({ label, children }) {
  return (
    <div className="field">
      <dt>{label}</dt>
      <dd>{children ?? <span className="sw-muted">Not provided</span>}</dd>
    </div>
  );
}

export default function AlertDetail({ alert, now, accessToken, onUpdated }) {
  const { user, trip } = alert;
  const last = alert.last_location;
  const note = alertStateNote(alert);
  const badge = alert.status === 'NEW' ? 'sw-badge--danger' : alert.status === 'RESOLVED' ? 'sw-badge--done' : 'sw-badge--active';

  return (
    <article className="detail" aria-labelledby="detail-title">
      <header className="detail__header">
        <div>
          <p className="detail__eyebrow">{TRIGGER_LABEL[alert.trigger_type]} · raised {formatDateTime(alert.triggered_at)}</p>
          <h2 id="detail-title">{user?.full_name ?? 'Unknown user'}</h2>
        </div>
        <span className={`sw-badge ${badge}`}>{ALERT_STATUS_LABEL[alert.status]}</span>
      </header>

      <p className={`detail__note detail__note--${note.tone}`}>{note.text}</p>

      <AlertMap alert={alert} />

      <div className="detail__grid">
        <section>
          <h3>Person</h3>
          <dl>
            <Field label="Name">{user?.full_name}</Field>
            <Field label="Matric / staff no.">{user?.matric_or_staff_id}</Field>
            <Field label="Phone">{user?.phone_number && <a href={`tel:${user.phone_number}`}>{user.phone_number}</a>}</Field>
            <Field label="Email">{user?.email}</Field>
          </dl>
        </section>
        <section>
          <h3>Last known location</h3>
          <dl>
            <Field label="Coordinates">
              {last && (
                <span className="sw-num mono">
                  {last.lat.toFixed(6)}, {last.lng.toFixed(6)}
                </span>
              )}
            </Field>
            <Field label="Recorded">{last && `${formatTime(last.recorded_at)} (${formatAgo(last.recorded_at, now)})`}</Field>
            <Field label="GPS accuracy">{last?.accuracy_m != null ? `± ${Math.round(last.accuracy_m)} m` : null}</Field>
            <Field label="Phone battery">{last?.battery_level != null ? `${last.battery_level}%` : null}</Field>
            {trip?.signal_lost_at && <Field label="Signal">{`Lost since ${formatTime(trip.signal_lost_at)}`}</Field>}
          </dl>
        </section>
        {trip && (
          <section>
            <h3>{alert.trigger_type === 'ETA' ? 'Journey' : 'Journey in progress'}</h3>
            <dl>
              <Field label="Destination">{trip.destination.label ?? 'Pinned on map'}</Field>
              <Field label="Started">{formatTime(trip.started_at)}</Field>
              <Field label="Expected arrival">{formatTime(trip.eta_deadline)}</Field>
              {alert.trigger_type === 'ETA' && <Field label="Route history">{alert.trail ? `${alert.trail.length} GPS points` : 'Loading…'}</Field>}
            </dl>
          </section>
        )}
        <ResponsePanel alert={alert} accessToken={accessToken} onUpdated={onUpdated} />
      </div>
    </article>
  );
}
