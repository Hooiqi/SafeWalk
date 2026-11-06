import { formatAgo, formatDateTime, formatTime } from '@safewalk/shared';
import AlertMap from './AlertMap.jsx';
import { ALERT_STATUS_LABEL, TRIGGER_LABEL, tripStateNote } from './labels.js';

function Field({ label, children }) {
  return (
    <div className="field">
      <dt>{label}</dt>
      <dd>{children ?? <span className="sw-muted">Not provided</span>}</dd>
    </div>
  );
}

export default function AlertDetail({ alert, now }) {
  const { user, trip } = alert;
  const last = trip?.last_location;
  const note = tripStateNote(trip);

  return (
    <article className="detail" aria-labelledby="detail-title">
      <header className="detail__header">
        <div>
          <p className="detail__eyebrow">{TRIGGER_LABEL[alert.trigger_type]} · raised {formatDateTime(alert.triggered_at)}</p>
          <h2 id="detail-title">{user?.full_name ?? 'Unknown user'}</h2>
        </div>
        <span className={`sw-badge ${alert.status === 'NEW' ? 'sw-badge--danger' : 'sw-badge--active'}`}>{ALERT_STATUS_LABEL[alert.status]}</span>
      </header>

      {note && <p className={`detail__note detail__note--${note.tone}`}>{note.text}{trip?.ended_at ? ` (${formatTime(trip.ended_at)})` : ''}</p>}

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
                <span className="sw-num" style={{ fontFamily: 'var(--sw-font-mono)' }}>
                  {last.lat.toFixed(6)}, {last.lng.toFixed(6)}
                </span>
              )}
            </Field>
            <Field label="Recorded">{last && `${formatTime(last.recorded_at)} (${formatAgo(last.recorded_at, now)})`}</Field>
            <Field label="Phone battery">{last?.battery_level != null ? `${last.battery_level}%` : null}</Field>
            <Field label="Signal">{trip?.signal_lost_at ? `Lost since ${formatTime(trip.signal_lost_at)}` : 'Receiving'}</Field>
          </dl>
        </section>
        {trip && (
          <section>
            <h3>Journey</h3>
            <dl>
              <Field label="Destination">{trip.destination.label ?? 'Pinned on map'}</Field>
              <Field label="Started">{formatTime(trip.started_at)}</Field>
              <Field label="Expected arrival">{formatTime(trip.eta_deadline)}</Field>
              <Field label="Route history">{trip.trail ? `${trip.trail.length} GPS points` : 'Loading…'}</Field>
            </dl>
          </section>
        )}
      </div>
    </article>
  );
}
