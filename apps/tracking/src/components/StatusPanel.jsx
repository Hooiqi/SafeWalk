import { formatAgo, formatDuration, formatTime } from '@safewalk/shared';

function headline(view, now) {
  switch (view.status) {
    case 'ACTIVE': {
      const left = (new Date(view.eta_deadline) - now) / 1000;
      return {
        tone: 'active',
        badge: 'On the way',
        title: `Expected by ${formatTime(view.eta_deadline)}`,
        detail: left > 0 ? `${formatDuration(left)} of walking time left` : 'Arrival time reached, checking in…',
      };
    }
    case 'GRACE_PROMPT':
      return {
        tone: 'warning',
        badge: 'Check-in pending',
        title: 'Expected arrival time has passed',
        detail: `SafeWalk has asked ${view.traveller_name} to check in. If there is no response by ${formatTime(view.grace_expires_at)}, USM Security and trusted contacts will be alerted.`,
      };
    case 'ESCALATED':
      return {
        tone: 'danger',
        badge: 'Emergency alert raised',
        title: `${view.traveller_name} did not check in`,
        detail: `USM Security was alerted at ${formatTime(view.escalated_at)} with the route history and last known location shown on this map. If you believe someone is in immediate danger, call 999.`,
      };
    case 'COMPLETED':
      return {
        tone: 'done',
        badge: view.end_reason === 'ARRIVED' ? 'Arrived safely' : 'Confirmed safe',
        title:
          view.end_reason === 'ARRIVED'
            ? `Arrived safely at ${formatTime(view.ended_at)}`
            : `${view.traveller_name} confirmed they are safe at ${formatTime(view.ended_at)}`,
        detail: 'Live tracking has ended for this journey.',
      };
    case 'CANCELLED':
      return {
        tone: 'done',
        badge: 'Journey cancelled',
        title: `Cancelled at ${formatTime(view.ended_at)}`,
        detail: `${view.traveller_name} stopped sharing this journey.`,
      };
    default:
      return { tone: 'done', badge: view.status, title: '', detail: '' };
  }
}

export default function StatusPanel({ view, now, connection }) {
  const h = headline(view, now);
  const open = view.status !== 'COMPLETED' && view.status !== 'CANCELLED';
  const last = view.last_location;

  return (
    <section className={`panel panel--${h.tone}`} aria-live="polite">
      <header className="panel__header">
        <p className="brand">SafeWalk</p>
        {open && (
          <span className={`live live--${connection}`}>
            {connection === 'live' ? 'Live' : connection === 'closed' ? 'Offline' : 'Reconnecting…'}
          </span>
        )}
      </header>

      <p className="panel__who">
        <span className="sw-muted">Journey shared by</span> <strong>{view.traveller_name}</strong>
      </p>

      <span className={`sw-badge sw-badge--${h.tone}`}>{h.badge}</span>
      <h1 className="panel__title">{h.title}</h1>
      <p className="panel__detail">{h.detail}</p>

      {open && view.signal_lost_at && (
        <p className="notice" role="status">
          No signal from the phone since {formatTime(view.signal_lost_at)}. The map shows the last position received.
        </p>
      )}

      <dl className="facts">
        <div>
          <dt>Destination</dt>
          <dd>{view.destination.label ?? 'Pinned on map'}</dd>
        </div>
        <div>
          <dt>Started</dt>
          <dd className="sw-num">{formatTime(view.started_at)}</dd>
        </div>
        <div>
          <dt>Expected arrival</dt>
          <dd className="sw-num">{formatTime(view.eta_deadline)}</dd>
        </div>
        <div>
          <dt>Last updated</dt>
          <dd className="sw-num" title={last?.recorded_at}>
            {last ? formatAgo(last.recorded_at, now) : 'No position yet'}
          </dd>
        </div>
        {last?.battery_level != null && (
          <div>
            <dt>Phone battery</dt>
            <dd className="sw-num">{last.battery_level}%</dd>
          </div>
        )}
      </dl>

      {view.route_source === 'STRAIGHT_LINE_ESTIMATE' && (
        <p className="footnote">The walking route service was unavailable, so the expected arrival time is an estimate.</p>
      )}
      <p className="footnote">
        Only people with this link can see this journey. {open ? 'The link stops working shortly after the journey ends.' : view.link_expires_at ? `This link expires at ${formatTime(view.link_expires_at)}.` : ''}
      </p>
    </section>
  );
}
