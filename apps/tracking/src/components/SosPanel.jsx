import { formatAgo, formatTime } from '@safewalk/shared';

const SECURITY_TEXT = {
  NEW: 'USM Security has been alerted and is reviewing it.',
  RECEIVED: 'USM Security has received the alert.',
  ON_THE_WAY: 'USM Security is on the way.',
  ARRIVED: 'USM Security has arrived at the location.',
  RESOLVED: 'USM Security has resolved the alert.',
};

/** Trusted-contact view of an SOS alert (Module 2). */
export default function SosPanel({ view, now, connection }) {
  const ended = view.status === 'RESOLVED' || Boolean(view.user_safe_at);
  const last = view.last_location;

  let badge;
  let title;
  if (view.user_safe_at) {
    badge = { tone: 'done', text: 'Marked safe' };
    title = `${view.traveller_name} marked themselves safe at ${formatTime(view.user_safe_at)}`;
  } else if (view.status === 'RESOLVED') {
    badge = { tone: 'done', text: 'Resolved' };
    title = `Resolved by USM Security at ${formatTime(view.resolved_at)}`;
  } else {
    badge = { tone: 'danger', text: view.silent ? 'Silent SOS' : 'SOS' };
    title = `${view.traveller_name} needs help`;
  }

  return (
    <section className={`panel panel--${ended ? 'done' : 'danger'}`} aria-live="polite">
      <header className="panel__header">
        <p className="brand">SafeWalk</p>
        {!ended && (
          <span className={`live live--${connection}`}>
            {connection === 'live' ? 'Live' : connection === 'closed' ? 'Offline' : 'Reconnecting…'}
          </span>
        )}
      </header>

      <span className={`sw-badge sw-badge--${badge.tone}`}>{badge.text}</span>
      <h1 className="panel__title">{title}</h1>
      <p className="panel__detail">
        {SECURITY_TEXT[view.status]}
        {!ended && ' If you believe someone is in immediate danger, call 999.'}
      </p>
      {view.silent && !ended && (
        <p className="notice" role="status">
          This is a silent SOS: {view.traveller_name} may be hiding or unable to speak. Do not call them unless you are sure it is safe.
        </p>
      )}

      <dl className="facts">
        <div>
          <dt>SOS sent</dt>
          <dd className="sw-num">{formatTime(view.triggered_at)}</dd>
        </div>
        <div>
          <dt>Last updated</dt>
          <dd className="sw-num">{last ? formatAgo(last.recorded_at, now) : 'Waiting for GPS'}</dd>
        </div>
        {last?.accuracy_m != null && (
          <div>
            <dt>GPS accuracy</dt>
            <dd className="sw-num">± {Math.round(last.accuracy_m)} m</dd>
          </div>
        )}
        {last?.battery_level != null && (
          <div>
            <dt>Phone battery</dt>
            <dd className="sw-num">{last.battery_level}%</dd>
          </div>
        )}
      </dl>
      <p className="footnote">
        Only people with this link can see this location.{' '}
        {ended && view.link_expires_at ? `This link expires at ${formatTime(view.link_expires_at)}.` : 'The link stops working shortly after the SOS ends.'}
      </p>
    </section>
  );
}
