import { useEffect, useMemo, useState } from 'react';
import { BellRing, CircleAlert, Info, Megaphone, Plus, Send, TriangleAlert, Undo2 } from 'lucide-react';
import { formatDateTime } from '@safewalk/shared';
import { apiRequest } from '../lib/api.js';
import { ANNOUNCEMENT_STATE_LABEL, PRIORITY_HELP, PRIORITY_LABEL, announcementTone } from '../components/labels.js';

const PRIORITY_ICON = { INFO: Info, ADVISORY: TriangleAlert, URGENT: CircleAlert };
const FILTERS = [
  ['ALL', 'All'],
  ['LIVE', 'Live'],
  ['SCHEDULED', 'Scheduled'],
  ['EXPIRED', 'Ended'],
  ['WITHDRAWN', 'Withdrawn'],
];

// Times are typed and shown in Malaysia time, whatever the computer's zone.
const MYT_OFFSET_MS = 8 * 3_600_000;
const toMytInput = (iso) => (iso ? new Date(new Date(iso).getTime() + MYT_OFFSET_MS).toISOString().slice(0, 16) : '');
const fromMytInput = (value) => (value ? new Date(`${value}:00+08:00`).toISOString() : null);
const nowMytInput = (plusMinutes = 0) => toMytInput(new Date(Date.now() + plusMinutes * 60_000).toISOString());

export function Priority({ value }) {
  const Icon = PRIORITY_ICON[value];
  return (
    <span className={`prio prio--${value}`}>
      <Icon aria-hidden="true" /> {PRIORITY_LABEL[value]}
    </span>
  );
}

function stateLine(a) {
  if (a.state === 'SCHEDULED') return `Goes live ${formatDateTime(a.published_at)}`;
  if (a.state === 'LIVE') return a.expires_at ? `Live until ${formatDateTime(a.expires_at)}` : `Live since ${formatDateTime(a.published_at)}`;
  if (a.state === 'EXPIRED') return `Ended ${formatDateTime(a.expires_at)}`;
  return `Withdrawn ${formatDateTime(a.withdrawn_at)}`;
}

function AnnouncementRow({ a, selected, onSelect }) {
  return (
    <li>
      <button type="button" className={`queue__row queue__row--report${selected ? ' queue__row--selected' : ''}`} onClick={onSelect} aria-current={selected || undefined}>
        <span className="queue__main">
          <span className="queue__name">{a.title}</span>
          <Priority value={a.priority} />
          <span className={`queue__note queue__note--${announcementTone(a.state)}`}>{stateLine(a)}</span>
        </span>
        <span className="queue__side">
          <span className={`status status--${announcementTone(a.state)}`}>{ANNOUNCEMENT_STATE_LABEL[a.state]}</span>
        </span>
      </button>
    </li>
  );
}

/** What a student sees on the app's home screen. */
function AppPreview({ title, body, priority }) {
  const Icon = PRIORITY_ICON[priority];
  return (
    <figure className="preview">
      <figcaption className="muted small">How it looks in the app</figcaption>
      <div className={`preview__card preview__card--${priority}`}>
        <span className={`prio prio--${priority}`}>
          <Icon aria-hidden="true" /> {PRIORITY_LABEL[priority]} · USM Security
        </span>
        <strong className="preview__title">{title.trim() || 'Title'}</strong>
        <span className="preview__body">{body.trim() || 'Your message appears here.'}</span>
      </div>
    </figure>
  );
}

function Editor({ announcement, accessToken, onSaved, onCancel }) {
  const editing = Boolean(announcement);
  const scheduled = announcement?.state === 'SCHEDULED';
  const [title, setTitle] = useState(announcement?.title ?? '');
  const [body, setBody] = useState(announcement?.message_body ?? '');
  const [priority, setPriority] = useState(announcement?.priority ?? 'INFO');
  const [when, setWhen] = useState(scheduled ? 'LATER' : 'NOW');
  const [start, setStart] = useState(scheduled ? toMytInput(announcement.published_at) : nowMytInput(60));
  const [hasEnd, setHasEnd] = useState(Boolean(announcement?.expires_at));
  const [end, setEnd] = useState(announcement?.expires_at ? toMytInput(announcement.expires_at) : nowMytInput(24 * 60));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => setError(null), [announcement?.announce_id]);

  const urgentNow = priority === 'URGENT' && (!editing ? when === 'NOW' : announcement.state === 'LIVE' && !announcement.push_summary);

  async function save(e) {
    e.preventDefault();
    if (urgentNow && !window.confirm('Send this as an urgent push notification to every SafeWalk phone now?')) return;
    setBusy(true);
    setError(null);
    try {
      const payload = {
        title: title.trim(),
        message_body: body.trim(),
        priority,
        expires_at: hasEnd ? fromMytInput(end) : null,
      };
      if (!editing || scheduled) payload.published_at = when === 'LATER' ? fromMytInput(start) : editing ? new Date().toISOString() : null;
      const saved = editing
        ? await apiRequest('PATCH', `/api/staff/announcements/${announcement.announce_id}`, accessToken, { body: payload })
        : await apiRequest('POST', '/api/staff/announcements', accessToken, { body: payload });
      onSaved(saved);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  const submitLabel = editing ? 'Save changes' : when === 'LATER' ? 'Schedule' : priority === 'URGENT' ? 'Publish and notify phones' : 'Publish now';

  return (
    <form className="sp-form announce-form" onSubmit={save}>
      <h2>{editing ? 'Edit announcement' : 'New announcement'}</h2>
      <div className="field">
        <label htmlFor="an-title">
          Title <span className="req">*</span>
        </label>
        <input id="an-title" className="input" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} required minLength={3} />
      </div>
      <div className="field">
        <label htmlFor="an-body">
          Message <span className="req">*</span>
        </label>
        <textarea id="an-body" className="input" rows={5} value={body} onChange={(e) => setBody(e.target.value)} maxLength={2000} required />
        <span className="muted small num">{body.length}/2000</span>
      </div>
      <fieldset className="field choice">
        <legend>Priority</legend>
        {['INFO', 'ADVISORY', 'URGENT'].map((p) => (
          <label key={p} className={`choice__option${priority === p ? ' choice__option--on' : ''}`}>
            <input type="radio" name="priority" value={p} checked={priority === p} onChange={() => setPriority(p)} />
            <span>
              <Priority value={p} />
              <span className="muted small choice__help">{PRIORITY_HELP[p]}</span>
            </span>
          </label>
        ))}
      </fieldset>
      {(!editing || scheduled) && (
        <fieldset className="field">
          <legend>When</legend>
          <div className="when">
            <label className="check">
              <input type="radio" name="when" checked={when === 'NOW'} onChange={() => setWhen('NOW')} /> Now
            </label>
            <label className="check">
              <input type="radio" name="when" checked={when === 'LATER'} onChange={() => setWhen('LATER')} /> At a set time
            </label>
            {when === 'LATER' && (
              <input type="datetime-local" className="input" aria-label="Start time, Malaysia time" value={start} onChange={(e) => setStart(e.target.value)} required />
            )}
          </div>
        </fieldset>
      )}
      <div className="field">
        <label className="check">
          <input type="checkbox" checked={hasEnd} onChange={(e) => setHasEnd(e.target.checked)} /> Take it down automatically
        </label>
        {hasEnd && <input type="datetime-local" className="input" aria-label="End time, Malaysia time" value={end} onChange={(e) => setEnd(e.target.value)} required />}
        <span className="muted small">Times are Malaysia time.</span>
      </div>
      <AppPreview title={title} body={body} priority={priority} />
      {urgentNow && (
        <p className="form-note">
          <BellRing aria-hidden="true" /> Every phone with SafeWalk notifications on will get a push notification.
        </p>
      )}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <div className="sp-form__actions">
        <button type="submit" className="btn btn--primary" disabled={busy}>
          <Send aria-hidden="true" /> {busy ? 'Saving' : submitLabel}
        </button>
        <button type="button" className="btn" onClick={onCancel} disabled={busy}>
          Cancel
        </button>
      </div>
    </form>
  );
}

function Details({ a, accessToken, onChanged, onEdit }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  useEffect(() => setError(null), [a.announce_id]);

  async function withdraw() {
    if (!window.confirm('Withdraw this announcement? It disappears from every phone.')) return;
    setBusy(true);
    try {
      onChanged(await apiRequest('POST', `/api/staff/announcements/${a.announce_id}/withdraw`, accessToken));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }
  const editable = a.state === 'LIVE' || a.state === 'SCHEDULED';
  const push = a.push_summary;
  return (
    <div className="sp-form">
      <div className="pane__head pane__head--flush">
        <div>
          <h2>{a.title}</h2>
          <p className="muted">
            <Priority value={a.priority} />
          </p>
        </div>
        <span className={`status status--${announcementTone(a.state)}`}>{ANNOUNCEMENT_STATE_LABEL[a.state]}</span>
      </div>
      <p className="report__text">{a.message_body}</p>
      <dl className="facts">
        <div className="facts__row">
          <dt>Published by</dt>
          <dd>{a.staff_name ?? 'Former staff member'}</dd>
        </div>
        <div className="facts__row">
          <dt>{a.state === 'SCHEDULED' ? 'Goes live' : 'Went live'}</dt>
          <dd>{formatDateTime(a.published_at)}</dd>
        </div>
        <div className="facts__row">
          <dt>Ends</dt>
          <dd>{a.expires_at ? formatDateTime(a.expires_at) : 'When withdrawn'}</dd>
        </div>
        {a.priority === 'URGENT' && (
          <div className="facts__row">
            <dt>Push notification</dt>
            <dd>
              {push
                ? `${push.sent} sent, ${push.failed} failed${push.skipped ? `, ${push.skipped} not sent (push is not set up on the server)` : ''}, of ${push.recipients} phones`
                : a.state === 'SCHEDULED'
                  ? 'Sent when it goes live'
                  : 'Not sent'}
            </dd>
          </div>
        )}
        {a.withdrawn_at && (
          <div className="facts__row">
            <dt>Withdrawn</dt>
            <dd>
              {formatDateTime(a.withdrawn_at)} by {a.withdrawn_by_name ?? 'a former staff member'}
            </dd>
          </div>
        )}
      </dl>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {editable && (
        <div className="sp-form__actions">
          <button type="button" className="btn btn--primary" onClick={onEdit}>
            Edit
          </button>
          <button type="button" className="btn" onClick={withdraw} disabled={busy}>
            <Undo2 aria-hidden="true" /> {busy ? 'Withdrawing' : 'Withdraw'}
          </button>
        </div>
      )}
    </div>
  );
}

export default function AnnouncementsPage({ accessToken, announcements }) {
  const { announcements: list, status, error, reload } = announcements;
  const [filter, setFilter] = useState('ALL');
  const [selectedId, setSelectedId] = useState(null);
  const [mode, setMode] = useState('view'); // view | new | edit

  const shown = useMemo(() => list.filter((a) => filter === 'ALL' || a.state === filter), [list, filter]);
  const selected = list.find((a) => a.announce_id === selectedId) ?? null;
  const liveCount = list.filter((a) => a.state === 'LIVE').length;

  async function saved(a) {
    await reload();
    setSelectedId(a.announce_id);
    setMode('view');
  }

  let pane;
  if (mode === 'new') pane = <Editor key="new" accessToken={accessToken} onSaved={saved} onCancel={() => setMode('view')} />;
  else if (mode === 'edit' && selected) pane = <Editor key={selected.announce_id} announcement={selected} accessToken={accessToken} onSaved={saved} onCancel={() => setMode('view')} />;
  else if (selected) pane = <Details a={selected} accessToken={accessToken} onChanged={saved} onEdit={() => setMode('edit')} />;
  else
    pane = (
      <div className="sp-hint">
        <p className="muted">Choose an announcement to see who published it and when, or write a new one.</p>
      </div>
    );

  return (
    <section className="page">
      <header className="page__header">
        <div>
          <h1>Announcements</h1>
          <p className="muted">
            Safety notices for everyone using the SafeWalk app. {liveCount === 1 ? '1 is live now.' : `${liveCount} are live now.`}
          </p>
        </div>
        <div className="page__actions">
          <button
            type="button"
            className="btn btn--primary"
            onClick={() => {
              setSelectedId(null);
              setMode('new');
            }}
          >
            <Plus aria-hidden="true" /> New announcement
          </button>
        </div>
      </header>
      <div className="split">
        <div>
          <label className="field">
            <span className="label">Show</span>
            <select className="input" value={filter} onChange={(e) => setFilter(e.target.value)}>
              {FILTERS.map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </label>
          {status === 'loading' && <div className="skeleton skeleton--row" aria-label="Loading announcements" />}
          {status === 'error' && (
            <div className="state state--error" role="alert">
              <p>Could not load announcements: {error.message}</p>
              <button type="button" className="btn" onClick={reload}>
                Try again
              </button>
            </div>
          )}
          {status === 'ready' && shown.length === 0 && (
            <div className="state state--empty">
              <Megaphone className="state__icon" aria-hidden="true" />
              <h2>{filter === 'ALL' ? 'No announcements yet' : 'Nothing here'}</h2>
              <p className="muted">{filter === 'ALL' ? 'Publish one to show it on every phone.' : 'Try another filter.'}</p>
            </div>
          )}
          {status === 'ready' && shown.length > 0 && (
            <ul className="queue-panel announce-list" aria-label="Announcements">
              {shown.map((a) => (
                <AnnouncementRow
                  key={a.announce_id}
                  a={a}
                  selected={a.announce_id === selectedId && mode !== 'new'}
                  onSelect={() => {
                    setSelectedId(a.announce_id);
                    setMode('view');
                  }}
                />
              ))}
            </ul>
          )}
        </div>
        <section className="glass pane" aria-label="Announcement">
          {pane}
        </section>
      </div>
    </section>
  );
}
