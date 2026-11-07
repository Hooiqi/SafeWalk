import { useState } from 'react';
import { ALERT_STATUS_ORDER, formatTime } from '@safewalk/shared';
import { apiRequest } from '../lib/api.js';
import { ACTION_LABEL, ALERT_STATUS_LABEL } from './labels.js';

/**
 * Emergency response workflow (proposal Module 4): Received Alert -> On the Way
 * -> Arrived at Location -> Resolved. Statuses only move forward; the next step
 * is the primary action, later steps can be chosen to skip ahead.
 */
export default function ResponsePanel({ alert, accessToken, onUpdated }) {
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState(null);
  const current = ALERT_STATUS_ORDER.indexOf(alert.status);
  const nextSteps = ALERT_STATUS_ORDER.slice(current + 1);

  async function move(status) {
    if (status === 'RESOLVED' && !window.confirm('Mark this alert as resolved? The alarm stops and the live link expires in 30 minutes.')) return;
    setBusy(status);
    setError(null);
    try {
      const updated = await apiRequest('POST', `/api/staff/alerts/${alert.alert_id}/status`, accessToken, {
        body: { status, ...(note.trim() ? { note: note.trim() } : {}) },
      });
      setNote('');
      onUpdated(updated);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="response" aria-labelledby="response-title">
      <h3 id="response-title">Response</h3>
      {nextSteps.length > 0 ? (
        <>
          <div className="response__actions">
            {nextSteps.map((status, i) => (
              <button
                key={status}
                type="button"
                className={`sw-button${i === 0 ? ' sw-button--primary' : ''}`}
                disabled={busy !== null}
                onClick={() => move(status)}
              >
                {busy === status ? 'Saving…' : ACTION_LABEL[status]}
              </button>
            ))}
          </div>
          <label className="label" htmlFor={`note-${alert.alert_id}`}>
            Note for the team (optional)
          </label>
          <input
            id={`note-${alert.alert_id}`}
            className="sw-input"
            maxLength={500}
            placeholder="e.g. Patrol unit 2 dispatched"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
          {error && <p className="form-error" role="alert">{error}</p>}
        </>
      ) : (
        <p className="sw-muted">This alert is resolved.</p>
      )}

      {alert.status_history && (
        <ol className="timeline" aria-label="Status history">
          {alert.status_history.map((h, i) => (
            <li key={`${h.new_status}-${h.updated_at}-${i}`}>
              <span className="timeline__time sw-num">{formatTime(h.updated_at)}</span>
              <span>
                <strong>{h.new_status === 'NEW' ? 'Alert raised' : ALERT_STATUS_LABEL[h.new_status]}</strong>
                {h.staff_name && <span className="sw-muted"> by {h.staff_name}</span>}
                {h.note && <span className="timeline__note">{h.note}</span>}
              </span>
            </li>
          ))}
          {alert.user_safe_at && (
            <li>
              <span className="timeline__time sw-num">{formatTime(alert.user_safe_at)}</span>
              <strong>User marked themselves safe</strong>
            </li>
          )}
        </ol>
      )}
    </section>
  );
}
