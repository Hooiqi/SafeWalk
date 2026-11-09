import { Check, CircleDot } from 'lucide-react';
import { useState } from 'react';
import { ALERT_STATUS_ORDER, formatTime } from '@safewalk/shared';
import { apiRequest } from '../lib/api.js';
import { ACTION_LABEL, ALERT_STATUS_LABEL } from './labels.js';

/**
 * Emergency response workflow (proposal Module 4): Received Alert, On the Way,
 * Arrived at Location, Resolved. Statuses only move forward; the next step is
 * the primary action, later steps can be chosen to skip ahead.
 */
export default function ResponsePanel({ alert, accessToken, onUpdated }) {
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState(null);
  const current = ALERT_STATUS_ORDER.indexOf(alert.status);
  const nextSteps = ALERT_STATUS_ORDER.slice(current + 1);
  const history = alert.status_history ?? [];

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
                className={`btn${i === 0 ? ' btn--primary' : ''}`}
                disabled={busy !== null}
                onClick={() => move(status)}
              >
                {busy === status ? 'Saving' : ACTION_LABEL[status]}
              </button>
            ))}
          </div>
          <div className="field">
            <label htmlFor={`note-${alert.alert_id}`}>Note for the team</label>
            <input
              id={`note-${alert.alert_id}`}
              className="input"
              maxLength={500}
              placeholder="Patrol unit 2 dispatched"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>
          {error && <p className="form-error" role="alert">{error}</p>}
        </>
      ) : (
        <p className="muted">This alert is resolved.</p>
      )}

      {history.length > 0 && (
        <ol className="timeline ruled" aria-label="Status history">
          {history.map((h, i) => {
            const latest = i === history.length - 1 && alert.status !== 'RESOLVED';
            return (
              <li key={`${h.new_status}-${h.updated_at}-${i}`} className={latest ? 'timeline__item timeline__item--current' : 'timeline__item'}>
                {latest ? <CircleDot aria-hidden="true" /> : <Check aria-hidden="true" />}
                <span className="num muted">{formatTime(h.updated_at)}</span>
                <span>
                  <span className="timeline__what">{h.new_status === 'NEW' ? 'Alert raised' : ALERT_STATUS_LABEL[h.new_status]}</span>
                  {h.staff_name && <span className="muted"> by {h.staff_name}</span>}
                  {h.note && <span className="timeline__note">{h.note}</span>}
                </span>
              </li>
            );
          })}
          {alert.user_safe_at && (
            <li className="timeline__item">
              <Check aria-hidden="true" />
              <span className="num muted">{formatTime(alert.user_safe_at)}</span>
              <span className="timeline__what">Marked themselves safe</span>
            </li>
          )}
        </ol>
      )}
    </section>
  );
}
