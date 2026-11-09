import { useCallback, useEffect, useState } from 'react';
import { CircleMarker, MapContainer, TileLayer, Tooltip } from 'react-leaflet';
import {
  Camera,
  Check,
  CircleHelp,
  Construction,
  Dog,
  Eye,
  EyeOff,
  ImageOff,
  LightbulbOff,
  Merge,
  RotateCw,
  ShieldAlert,
  ChevronDown,
  ChevronUp,
  ChevronsUp,
  Users,
  Wallet,
  X,
} from 'lucide-react';
import { INCIDENT_SEVERITY, formatAgo, formatTime } from '@safewalk/shared';
import { ApiError, apiGet, apiRequest } from '../lib/api.js';
import { API_URL, TILE_ATTRIBUTION, TILE_URL } from '../lib/config.js';
import { INCIDENT_CATEGORY_LABEL, INCIDENT_STATUS_LABEL, INCIDENT_STATUS_SHORT, SEVERITY_LABEL, incidentTone } from '../components/labels.js';

const CATEGORY_ICON = {
  SUSPICIOUS_ACTIVITY: Eye,
  HARASSMENT: ShieldAlert,
  THEFT: Wallet,
  BROKEN_LIGHTING: LightbulbOff,
  STRAY_ANIMAL: Dog,
  UNSAFE_PATH: Construction,
  OTHER: CircleHelp,
};
const SEVERITY_ICON = { LOW: ChevronDown, MEDIUM: ChevronUp, HIGH: ChevronsUp };

const FILTERS = [
  ['OPEN', 'Open (pending and verified)'],
  ['PENDING', 'Pending review'],
  ['VERIFIED', 'Verified'],
  ['RESOLVED', 'Resolved'],
  ['REJECTED', 'Rejected'],
  ['ALL', 'All'],
];

export function Category({ value }) {
  const Icon = CATEGORY_ICON[value] ?? CircleHelp;
  return (
    <span className="queue__type">
      <Icon aria-hidden="true" /> {INCIDENT_CATEGORY_LABEL[value] ?? value}
    </span>
  );
}

export function Severity({ value }) {
  const Icon = SEVERITY_ICON[value];
  return (
    <span className={`sev sev--${value}`}>
      <Icon aria-hidden="true" /> {SEVERITY_LABEL[value]} severity
    </span>
  );
}

/** Photos are private: fetched with the staff token and shown from a blob URL. */
function ReportPhoto({ reportId, accessToken }) {
  const [src, setSrc] = useState(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let url = null;
    const ctrl = new AbortController();
    fetch(`${API_URL}/api/staff/incidents/reports/${reportId}/photo`, { headers: { Authorization: `Bearer ${accessToken}` }, signal: ctrl.signal })
      .then((res) => {
        if (!res.ok) throw new Error(String(res.status));
        return res.blob();
      })
      .then((blob) => {
        url = URL.createObjectURL(blob);
        setSrc(url);
      })
      .catch((err) => {
        if (err.name !== 'AbortError') setFailed(true);
      });
    return () => {
      ctrl.abort();
      if (url) URL.revokeObjectURL(url);
    };
  }, [reportId, accessToken]);
  if (failed) {
    return (
      <p className="muted small report__photo-missing">
        <ImageOff aria-hidden="true" /> The photo could not be loaded.
      </p>
    );
  }
  if (!src) return <div className="skeleton report__photo" aria-label="Loading photo" />;
  return (
    <a href={src} target="_blank" rel="noreferrer" className="report__photo-link">
      <img className="report__photo" src={src} alt="Photo attached to this report" />
    </a>
  );
}

function ReviewForm({ incident, accessToken, onDone }) {
  const [severity, setSeverity] = useState(incident.severity_level);
  const [publicNote, setPublicNote] = useState(incident.public_note ?? '');
  const [staffNote, setStaffNote] = useState(incident.staff_note ?? '');
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    setSeverity(incident.severity_level);
    setPublicNote(incident.public_note ?? '');
    setStaffNote(incident.staff_note ?? '');
    setError(null);
  }, [incident.group_id, incident.status, incident.severity_level, incident.public_note, incident.staff_note]);

  async function act(action) {
    setBusy(action);
    setError(null);
    try {
      const body = { public_note: publicNote.trim() || null, staff_note: staffNote.trim() || null };
      if (action === 'verify') body.severity_level = severity;
      const updated = await apiRequest('POST', `/api/staff/incidents/${incident.group_id}/${action}`, accessToken, { body });
      onDone(updated);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(null);
    }
  }

  const closed = incident.status === 'REJECTED' || incident.status === 'RESOLVED';
  if (closed) {
    return (
      <p className="muted">
        {incident.status === 'RESOLVED' ? `Resolved ${formatTime(incident.resolved_at)}.` : `Rejected ${formatTime(incident.reviewed_at)}.`} A new report at
        this place starts a new incident.
      </p>
    );
  }

  return (
    <form className="review" onSubmit={(e) => e.preventDefault()}>
      <div className="field">
        <label htmlFor="rv-severity">Severity on the map</label>
        <select id="rv-severity" className="input" value={severity} onChange={(e) => setSeverity(e.target.value)}>
          {Object.values(INCIDENT_SEVERITY).map((s) => (
            <option key={s} value={s}>{SEVERITY_LABEL[s]}</option>
          ))}
        </select>
      </div>
      <div className="field">
        <label htmlFor="rv-public">Note everyone can see</label>
        <textarea id="rv-public" className="input" rows={2} maxLength={300} value={publicNote} onChange={(e) => setPublicNote(e.target.value)} placeholder="e.g. Patrol added on this path after 10 pm" />
      </div>
      <div className="field">
        <label htmlFor="rv-staff">Note for security only</label>
        <textarea id="rv-staff" className="input" rows={2} maxLength={500} value={staffNote} onChange={(e) => setStaffNote(e.target.value)} placeholder="What was arranged, who was informed" />
      </div>
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="review__actions">
        <button type="button" className="btn btn--primary" disabled={Boolean(busy)} onClick={() => act('verify')}>
          <Check aria-hidden="true" /> {busy === 'verify' ? 'Saving…' : incident.status === 'PENDING' ? 'Verify and show on map' : 'Save changes'}
        </button>
        {incident.status === 'VERIFIED' && (
          <button type="button" className="btn" disabled={Boolean(busy)} onClick={() => act('resolve')}>
            {busy === 'resolve' ? 'Saving…' : 'Mark resolved'}
          </button>
        )}
        <button type="button" className="btn" disabled={Boolean(busy)} onClick={() => act('reject')}>
          <X aria-hidden="true" /> {busy === 'reject' ? 'Saving…' : incident.status === 'PENDING' ? 'Reject as false' : 'Remove from map'}
        </button>
      </div>
    </form>
  );
}

function IncidentDetail({ groupId, accessToken, version, onChanged, onGone }) {
  const [incident, setIncident] = useState(null);
  const [state, setState] = useState('loading');
  const [error, setError] = useState(null);
  const [merging, setMerging] = useState(null);
  const [mergeError, setMergeError] = useState(null);

  const load = useCallback(async () => {
    try {
      setIncident(await apiGet(`/api/staff/incidents/${groupId}`, accessToken));
      setState('ready');
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) return onGone();
      setError(err);
      setState('error');
    }
  }, [groupId, accessToken, onGone]);

  useEffect(() => {
    setState('loading');
    load();
  }, [load]);
  useEffect(() => {
    if (version) load();
  }, [version, load]);

  async function mergeIn(otherId) {
    setMerging(otherId);
    setMergeError(null);
    try {
      setIncident(await apiRequest('POST', `/api/staff/incidents/${otherId}/merge`, accessToken, { body: { into_group_id: groupId } }));
      onChanged();
    } catch (err) {
      setMergeError(err.message);
    } finally {
      setMerging(null);
    }
  }

  if (state === 'loading') return <div className="skeleton skeleton--pane" aria-busy="true" />;
  if (state === 'error') {
    return (
      <div className="pane glass state state--error" role="alert">
        <p>Could not load this incident: {error.message}</p>
        <button type="button" className="btn" onClick={load}><RotateCw aria-hidden="true" /> Try again</button>
      </div>
    );
  }

  const i = incident;
  const tone = incidentTone(i.status);
  const anonymous = i.reports.filter((r) => r.is_anonymous).length;
  return (
    <article className="pane glass" aria-labelledby="incident-title">
      <div className="pane__head">
        <div>
          <h2 id="incident-title">{INCIDENT_CATEGORY_LABEL[i.category]}</h2>
          <p className="muted">
            First reported {formatTime(i.first_reported_at)}, last {formatAgo(i.last_reported_at)}
          </p>
        </div>
        <span className={`status${tone ? ` status--${tone}` : ''}`}>{INCIDENT_STATUS_LABEL[i.status]}</span>
      </div>
      <p className="pane__note">
        <Severity value={i.severity_level} />
        {' · '}
        {i.report_count} report{i.report_count > 1 ? 's' : ''} from {i.reporters} {i.reporters === 1 ? 'person' : 'people'}
        {i.auto_verified ? ' · verified automatically by matching reports' : i.reviewed_by ? ` · reviewed by ${i.reviewed_by}` : ''}
      </p>

      <MapContainer key={i.group_id} className="pane__map" center={[i.location.lat, i.location.lng]} zoom={18} scrollWheelZoom={false}>
        <TileLayer url={TILE_URL} attribution={TILE_ATTRIBUTION} className="sw-dark-tiles" maxZoom={19} />
        {i.reports.map((r, n) => (
          <CircleMarker key={r.report_id} center={[r.location.lat, r.location.lng]} radius={5} className="mark-report">
            <Tooltip>Report {n + 1}, {formatTime(r.submitted_at)}</Tooltip>
          </CircleMarker>
        ))}
        <CircleMarker key={`${i.group_id}-${i.severity_level}`} center={[i.location.lat, i.location.lng]} radius={11} className={`mark-incident mark-incident--${i.severity_level}`}>
          <Tooltip permanent direction="top" offset={[0, -10]}>Incident location</Tooltip>
        </CircleMarker>
      </MapContainer>

      <div className="pane__body">
        <section aria-labelledby="reports-title">
          <h3 id="reports-title" className="section-title">
            <Users aria-hidden="true" /> Reports
          </h3>
          {anonymous > 0 && <p className="muted small">{anonymous} sent anonymously. SafeWalk does not show who sent those.</p>}
          <ol className="reports ruled">
            {i.reports.map((r) => (
              <li key={r.report_id} className="report">
                <div className="report__head">
                  <span className="num">{formatTime(r.submitted_at)}</span>
                  <Severity value={r.severity_level} />
                </div>
                {r.category !== i.category && <Category value={r.category} />}
                <p className="report__text">{r.description}</p>
                <p className="muted small">
                  {r.is_anonymous ? (
                    <span className="inline-icon"><EyeOff aria-hidden="true" /> Anonymous</span>
                  ) : (
                    <>
                      {r.reporter?.full_name}
                      {r.reporter?.matric_or_staff_id ? `, ${r.reporter.matric_or_staff_id}` : ''}
                      {r.reporter?.phone_number && (
                        <>
                          {', '}
                          <a href={`tel:${r.reporter.phone_number}`}>{r.reporter.phone_number}</a>
                        </>
                      )}
                    </>
                  )}
                  {r.accuracy_m != null && ` · GPS ± ${Math.round(r.accuracy_m)} m`}
                </p>
                {r.has_photo && (
                  <>
                    <p className="muted small inline-icon"><Camera aria-hidden="true" /> Photo</p>
                    <ReportPhoto reportId={r.report_id} accessToken={accessToken} />
                  </>
                )}
              </li>
            ))}
          </ol>
        </section>

        <section aria-label="Review this incident" className="review-col">
          <ReviewForm
            incident={i}
            accessToken={accessToken}
            onDone={(updated) => {
              setIncident(updated);
              onChanged();
            }}
          />

          {i.nearby.length > 0 && (i.status === 'PENDING' || i.status === 'VERIFIED') && (
            <div className="nearby">
              <h3 className="section-title"><Merge aria-hidden="true" /> Open incidents nearby</h3>
              <p className="muted small">If one is the same event, merge it here. Its reports move into this incident.</p>
              <ul className="ruled">
                {i.nearby.map((n) => (
                  <li key={n.group_id} className="nearby__row">
                    <span>
                      <Category value={n.category} />
                      <span className="muted small">
                        {n.distance_m} m away, {n.report_count} report{n.report_count > 1 ? 's' : ''}, {INCIDENT_STATUS_LABEL[n.status].toLowerCase()}
                      </span>
                    </span>
                    <button type="button" className="btn" disabled={Boolean(merging)} onClick={() => mergeIn(n.group_id)}>
                      {merging === n.group_id ? 'Merging…' : 'Merge here'}
                    </button>
                  </li>
                ))}
              </ul>
              {mergeError && <p className="form-error" role="alert">{mergeError}</p>}
            </div>
          )}
        </section>
      </div>
    </article>
  );
}

export default function ReportsPage({ accessToken, reports, filter, onFilter }) {
  const { incidents, status, error, pendingCount, version, reload } = reports;
  const [selectedId, setSelectedId] = useState(null);

  useEffect(() => {
    if (status === 'ready' && !incidents.some((i) => i.group_id === selectedId)) setSelectedId(incidents[0]?.group_id ?? null);
  }, [status, incidents, selectedId]);

  const onGone = useCallback(() => {
    setSelectedId(null);
    reload();
  }, [reload]);

  if (status === 'loading') {
    return (
      <div className="page" aria-busy="true">
        <div className="skeleton skeleton--title" />
        <div className="split">
          <div className="queue-panel">
            {[0, 1, 2].map((n) => <div key={n} className="skeleton skeleton--row" />)}
          </div>
          <div className="skeleton skeleton--pane" />
        </div>
      </div>
    );
  }
  if (status === 'error') {
    return (
      <div className="state state--error" role="alert">
        <p>Could not load reports: {error.message}</p>
        <button type="button" className="btn" onClick={reload}><RotateCw aria-hidden="true" /> Try again</button>
      </div>
    );
  }

  return (
    <div className="page">
      <header className="page__header">
        <div>
          <h1>Safety reports</h1>
          <p className="muted">Reports from students and staff, grouped by place. Verified incidents appear on everyone’s safety map.</p>
        </div>
        <div className="field page__actions">
          <label htmlFor="rp-filter" className="visually-hidden">Show</label>
          <select id="rp-filter" className="input" value={filter} onChange={(e) => onFilter(e.target.value)}>
            {FILTERS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </div>
      </header>

      {pendingCount > 0 && (
        <div className="strip" role="status">
          <strong>{pendingCount} report{pendingCount > 1 ? 's wait' : ' waits'} for review</strong>
          <span>Verify what is real, reject what is false. Three matching reports within 50 m and 30 minutes verify themselves.</span>
        </div>
      )}

      {incidents.length === 0 ? (
        <div className="state state--empty">
          <h2>No reports here</h2>
          <p className="muted">{filter === 'OPEN' ? 'New reports from the app appear here as they arrive.' : 'Nothing matches this filter.'}</p>
        </div>
      ) : (
        <div className="split">
          <ul className="queue-panel" aria-label="Incidents">
            {incidents.map((i) => {
              const tone = incidentTone(i.status);
              return (
                <li key={i.group_id}>
                  <button
                    type="button"
                    className={`queue__row queue__row--report${i.group_id === selectedId ? ' queue__row--selected' : ''}`}
                    aria-current={i.group_id === selectedId}
                    onClick={() => setSelectedId(i.group_id)}
                  >
                    <span className="queue__main">
                      <Category value={i.category} />
                      <Severity value={i.severity_level} />
                      {i.latest_description && <span className="queue__note queue__clamp">{i.latest_description}</span>}
                    </span>
                    <span className="queue__side">
                      <span className="num">{formatAgo(i.last_reported_at)}</span>
                      <span className="muted">
                        {i.report_count} report{i.report_count > 1 ? 's' : ''}
                        {i.photo_count > 0 && <Camera className="queue__icon" aria-label="has a photo" />}
                      </span>
                      <span className={`queue__note${tone === 'open' ? ' queue__note--open' : tone === 'done' ? ' queue__note--done' : ''}`}>{INCIDENT_STATUS_SHORT[i.status]}</span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
          {selectedId && (
            <IncidentDetail key={selectedId} groupId={selectedId} accessToken={accessToken} version={version} onChanged={reload} onGone={onGone} />
          )}
        </div>
      )}
    </div>
  );
}
