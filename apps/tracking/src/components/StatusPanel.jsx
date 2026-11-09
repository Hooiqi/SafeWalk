import { CircleCheck, CircleX, Footprints, Hourglass, Radio, Siren, WifiOff } from 'lucide-react';
import { formatAgo, formatDuration, formatTime } from '@safewalk/shared';

function headline(view, now) {
  switch (view.status) {
    case 'ACTIVE': {
      const left = (new Date(view.eta_deadline) - now) / 1000;
      return {
        tone: 'neutral',
        Icon: Footprints,
        word: 'On the way',
        title: `Expected by ${formatTime(view.eta_deadline)}`,
        detail: left > 0 ? `${formatDuration(left)} of walking time left.` : 'Arrival time reached. Checking in now.',
      };
    }
    case 'GRACE_PROMPT':
      return {
        tone: 'open',
        Icon: Hourglass,
        word: 'Check-in pending',
        title: 'The expected arrival time has passed',
        detail: `SafeWalk has asked ${view.traveller_name} to check in. With no answer by ${formatTime(view.grace_expires_at)}, USM Security and trusted contacts are alerted.`,
      };
    case 'ESCALATED':
      return {
        tone: 'open',
        Icon: Siren,
        word: 'Emergency alert raised',
        title: `${view.traveller_name} did not check in`,
        detail: `USM Security was alerted at ${formatTime(view.escalated_at)} with the route and last known location on this map. If someone is in immediate danger, call 999.`,
      };
    case 'COMPLETED': {
      const word = view.end_reason === 'ARRIVED' ? 'Arrived safely' : view.end_reason === 'RESOLVED_BY_SECURITY' ? 'Closed by security' : 'Confirmed safe';
      const title =
        view.end_reason === 'ARRIVED'
          ? `Arrived safely at ${formatTime(view.ended_at)}`
          : view.end_reason === 'RESOLVED_BY_SECURITY'
            ? `USM Security closed this alert at ${formatTime(view.ended_at)}`
            : `${view.traveller_name} confirmed they are safe at ${formatTime(view.ended_at)}`;
      return { tone: 'done', Icon: CircleCheck, word, title, detail: 'Live tracking has ended for this journey.' };
    }
    case 'CANCELLED':
      return {
        tone: 'neutral',
        Icon: CircleX,
        word: 'Journey cancelled',
        title: `Cancelled at ${formatTime(view.ended_at)}`,
        detail: `${view.traveller_name} stopped sharing this journey.`,
      };
    default:
      return { tone: 'neutral', Icon: Footprints, word: view.status, title: '', detail: '' };
  }
}

export function LiveState({ connection }) {
  const live = connection === 'live';
  return (
    <span className={`status${live ? ' status--done' : ' status--open'}`} role="status">
      {live ? <Radio aria-hidden="true" /> : <WifiOff aria-hidden="true" />}
      {live ? 'Live' : connection === 'closed' ? 'Offline' : 'Reconnecting'}
    </span>
  );
}

export default function StatusPanel({ view, now, connection }) {
  const h = headline(view, now);
  const open = view.status !== 'COMPLETED' && view.status !== 'CANCELLED';
  const last = view.last_location;
  const tone = h.tone === 'neutral' ? '' : ` status--${h.tone}`;

  return (
    <section className="panel glass" aria-live="polite">
      <header className="panel__header">
        <span className="wordmark">SafeWalk</span>
        {open && <LiveState connection={connection} />}
      </header>

      <p className="muted">
        Journey shared by <strong className="panel__who">{view.traveller_name}</strong>
      </p>
      <span className={`status${tone}`}>
        <h.Icon aria-hidden="true" /> {h.word}
      </span>
      <h1 className="panel__title">{h.title}</h1>
      <p className="panel__detail">{h.detail}</p>

      {view.sos && view.sos.status !== 'RESOLVED' && !view.sos.user_safe_at && (
        <p className="strip" role="alert">
          <strong>SOS sent at {formatTime(view.sos.triggered_at)}</strong>
          <span>{view.traveller_name} raised an SOS during this journey. USM Security has been alerted.</span>
        </p>
      )}
      {open && view.signal_lost_at && (
        <p className="strip" role="status">
          <strong>No signal since {formatTime(view.signal_lost_at)}</strong>
          <span>The map shows the last position received.</span>
        </p>
      )}

      <dl className="facts">
        <div className="facts__row">
          <dt>Walking to</dt>
          <dd>{view.destination.label ?? 'A pinned point'}</dd>
        </div>
        <div className="facts__row">
          <dt>Started</dt>
          <dd className="num">{formatTime(view.started_at)}</dd>
        </div>
        <div className="facts__row">
          <dt>Expected arrival</dt>
          <dd className="num">{formatTime(view.eta_deadline)}</dd>
        </div>
        <div className="facts__row">
          <dt>Last updated</dt>
          <dd className="num" title={last?.recorded_at}>{last ? formatAgo(last.recorded_at, now) : 'No position yet'}</dd>
        </div>
        {last?.battery_level != null && (
          <div className="facts__row">
            <dt>Phone battery</dt>
            <dd className="num">{last.battery_level}%</dd>
          </div>
        )}
      </dl>

      {view.route_source === 'STRAIGHT_LINE_ESTIMATE' && (
        <p className="footnote">The walking route service was unavailable, so the expected arrival time is an estimate.</p>
      )}
      <p className="footnote">
        Only people with this link can see this journey.{' '}
        {open ? 'The link stops working shortly after the journey ends.' : view.link_expires_at ? `This link expires at ${formatTime(view.link_expires_at)}.` : ''}
      </p>
    </section>
  );
}
