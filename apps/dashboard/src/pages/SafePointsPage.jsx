import { useCallback, useEffect, useMemo, useState } from 'react';
import { CircleMarker, MapContainer, TileLayer, Tooltip, useMap, useMapEvents } from 'react-leaflet';
import { MapPin, Plus, RotateCw } from 'lucide-react';
import { SAFE_POINT_CATEGORY } from '@safewalk/shared';
import { apiGet, apiRequest } from '../lib/api.js';
import { TILE_ATTRIBUTION, TILE_URL } from '../lib/config.js';
import { CATEGORY_LABEL } from '../components/labels.js';

const CAMPUS_CENTER = [5.3559, 100.3025]; // USM main campus (map start position only)
const DAYS = [
  ['mon', 'Monday'],
  ['tue', 'Tuesday'],
  ['wed', 'Wednesday'],
  ['thu', 'Thursday'],
  ['fri', 'Friday'],
  ['sat', 'Saturday'],
  ['sun', 'Sunday'],
];
const EMPTY = {
  name: '',
  category: 'SECURITY_POST',
  location: null,
  location_description: '',
  operating_hours: '',
  always: true,
  days: Object.fromEntries(DAYS.map(([d]) => [d, ''])),
  contact_phone: '',
  contact_notes: '',
  notes: '',
  is_active: true,
};

// "08:00-17:00, 14:45-17:00"  <->  [["08:00","17:00"],["14:45","17:00"]]
const rangesToText = (ranges = []) => ranges.map(([a, b]) => `${a}-${b}`).join(', ');
function textToRanges(text) {
  if (!text.trim()) return [];
  return text.split(',').map((part) => {
    const m = part.trim().match(/^(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})$/);
    if (!m) throw new Error(`"${part.trim()}" is not a time range like 08:00-17:00`);
    return [`${m[1].padStart(2, '0')}:${m[2]}`, `${m[3].padStart(2, '0')}:${m[4]}`];
  });
}

function toDraft(p) {
  return {
    ...EMPTY,
    ...p,
    location_description: p.location_description ?? '',
    contact_phone: p.contact_phone ?? '',
    contact_notes: p.contact_notes ?? '',
    notes: p.notes ?? '',
    always: Boolean(p.opening_schedule?.always),
    days: Object.fromEntries(DAYS.map(([d]) => [d, rangesToText(p.opening_schedule?.weekly?.[d])])),
  };
}

function toPayload(d) {
  const weekly = {};
  if (!d.always) {
    for (const [day, label] of DAYS) {
      try {
        const ranges = textToRanges(d.days[day]);
        if (ranges.length) weekly[day] = ranges;
      } catch (err) {
        throw new Error(`${label}: ${err.message}`);
      }
    }
  }
  return {
    name: d.name.trim(),
    category: d.category,
    location: d.location,
    location_description: d.location_description.trim() || null,
    operating_hours: d.operating_hours.trim(),
    opening_schedule: d.always ? { always: true } : { weekly },
    contact_phone: d.contact_phone.trim() || null,
    contact_notes: d.contact_notes.trim() || null,
    notes: d.notes.trim() || null,
    is_active: d.is_active,
  };
}

/** Pan to a point when a different safe point is selected (not on every click). */
function PanToSelection({ selectedId, location }) {
  const map = useMap();
  useEffect(() => {
    if (location) map.setView([location.lat, location.lng], Math.max(map.getZoom(), 17));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, selectedId]);
  return null;
}

function PickLocation({ onPick }) {
  useMapEvents({ click: (e) => onPick({ lat: Number(e.latlng.lat.toFixed(6)), lng: Number(e.latlng.lng.toFixed(6)) }) });
  return null;
}

export default function SafePointsPage({ accessToken }) {
  const [points, setPoints] = useState([]);
  const [state, setState] = useState('loading');
  const [loadError, setLoadError] = useState(null);
  const [filter, setFilter] = useState('ALL');
  const [selectedId, setSelectedId] = useState(null); // 'new' for a new point
  const [draft, setDraft] = useState(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState(null);
  const [saved, setSaved] = useState(null);

  const load = useCallback(async () => {
    try {
      const { safe_points } = await apiGet('/api/staff/safe-points', accessToken);
      setPoints(safe_points);
      setState('ready');
    } catch (err) {
      setLoadError(err);
      setState('error');
    }
  }, [accessToken]);

  useEffect(() => {
    load();
  }, [load]);

  const pending = points.filter((p) => p.is_active && !p.location).length;
  const visible = useMemo(
    () =>
      points.filter((p) =>
        filter === 'PENDING' ? p.is_active && !p.location : filter === 'INACTIVE' ? !p.is_active : filter === 'ALL' ? true : p.category === filter,
      ),
    [points, filter],
  );

  function select(p) {
    setSelectedId(p ? p.safe_point_id : 'new');
    setDraft(p ? toDraft(p) : { ...EMPTY, days: { ...EMPTY.days } });
    setFormError(null);
    setSaved(null);
  }

  const set = (field) => (e) => setDraft((d) => ({ ...d, [field]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));

  async function save(e) {
    e.preventDefault();
    setFormError(null);
    let payload;
    try {
      payload = toPayload(draft);
    } catch (err) {
      setFormError(err.message);
      return;
    }
    setSaving(true);
    try {
      const result =
        selectedId === 'new'
          ? await apiRequest('POST', '/api/staff/safe-points', accessToken, { body: payload })
          : await apiRequest('PATCH', `/api/staff/safe-points/${selectedId}`, accessToken, { body: payload });
      await load();
      setSelectedId(result.safe_point_id);
      setDraft(toDraft(result));
      setSaved(`Saved ${result.name}. Students see the change immediately.`);
    } catch (err) {
      setFormError(err.message);
    } finally {
      setSaving(false);
    }
  }

  if (state === 'loading') {
    return (
      <div className="page" aria-busy="true">
        <div className="skeleton skeleton--title" />
        <div className="split split--wide">
          <div className="queue-panel">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="skeleton skeleton--row" />
            ))}
          </div>
          <div className="skeleton skeleton--pane" />
        </div>
      </div>
    );
  }
  if (state === 'error') {
    return (
      <div className="state state--error" role="alert">
        <p>Could not load safe points: {loadError.message}</p>
        <button type="button" className="btn" onClick={load}>
          <RotateCw aria-hidden="true" /> Try again
        </button>
      </div>
    );
  }

  const mapPoints = points.filter((p) => p.location && p.safe_point_id !== selectedId);

  return (
    <div className="page">
      <header className="page__header">
        <div>
          <h1>Safe points</h1>
          <p className="muted">Where the navigator sends students. It uses active points that have a map location.</p>
        </div>
        <div className="page__actions">
          <button type="button" className="btn btn--primary" onClick={() => select(null)}>
            <Plus aria-hidden="true" /> Add safe point
          </button>
        </div>
      </header>

      {pending > 0 && (
        <div className="strip" role="status">
          <strong>{pending} safe point{pending > 1 ? 's need' : ' needs'} a map location</strong>
          <span>Select one, then click its position on the map and save. Until then the navigator cannot use it.</span>
        </div>
      )}

      <div className="split split--wide">
        <div>
          <div className="field">
          <label htmlFor="sp-filter">Show</label>
          <select id="sp-filter" className="input" value={filter} onChange={(e) => setFilter(e.target.value)}>
            <option value="ALL">All ({points.length})</option>
            <option value="PENDING">Needs location ({pending})</option>
            <option value="INACTIVE">Inactive</option>
            {Object.values(SAFE_POINT_CATEGORY).map((c) => (
              <option key={c} value={c}>{CATEGORY_LABEL[c]}</option>
            ))}
          </select>
          </div>
          <ul className="sp-list ruled" aria-label="Safe points">
            {visible.map((p) => (
              <li key={`${p.safe_point_id}-${p.is_active && p.opening.is_open ? 'on' : 'off'}`}>
                <button
                  type="button"
                  className={`sp-row${p.safe_point_id === selectedId ? ' sp-row--selected' : ''}`}
                  onClick={() => select(p)}
                  aria-current={p.safe_point_id === selectedId}
                >
                  <span className="sp-row__name">{p.name}</span>
                  <span className="sp-row__meta">
                    <span>{CATEGORY_LABEL[p.category]}</span>
                    {!p.is_active ? (
                      <span className="status">Inactive</span>
                    ) : !p.location ? (
                      <span className="status status--open">
                        <MapPin aria-hidden="true" /> Needs location
                      </span>
                    ) : (
                      <span className={`status${p.opening.is_open ? ' status--done' : ''}`}>{p.opening.is_open ? 'Open now' : 'Closed now'}</span>
                    )}
                  </span>
                </button>
              </li>
            ))}
            {visible.length === 0 && <li className="muted state">No safe points match this filter.</li>}
          </ul>
        </div>

        <div className="sp-editor glass">
          <MapContainer className="sp-map" center={draft?.location ? [draft.location.lat, draft.location.lng] : CAMPUS_CENTER} zoom={16}>
            <TileLayer url={TILE_URL} attribution={TILE_ATTRIBUTION} className="sw-dark-tiles" maxZoom={19} />
            {mapPoints.map((p) => (
              <CircleMarker
                key={p.safe_point_id}
                center={[p.location.lat, p.location.lng]}
                radius={7}
                className={p.is_active && p.opening.is_open ? 'mark-point' : 'mark-point mark-point--off'} pathOptions={{ weight: 2 }}
                eventHandlers={{ click: () => select(p) }}
              >
                <Tooltip>{p.name}</Tooltip>
              </CircleMarker>
            ))}
            {draft?.location && (
              <CircleMarker center={[draft.location.lat, draft.location.lng]} radius={11} className="mark-selected" pathOptions={{ weight: 3 }}>
                <Tooltip permanent direction="top" offset={[0, -10]}>{draft.name || 'New safe point'}</Tooltip>
              </CircleMarker>
            )}
            {draft && <PickLocation onPick={(location) => setDraft((d) => ({ ...d, location }))} />}
            <PanToSelection selectedId={selectedId} location={draft?.location} />
          </MapContainer>

          {!draft ? (
            <p className="muted sp-hint">Select a safe point from the list, or add a new one.</p>
          ) : (
            <form className="sp-form" onSubmit={save} noValidate>
              <h2>{selectedId === 'new' ? 'New safe point' : draft.name}</h2>
              <p className="muted">
                {draft.location
                  ? `Location ${draft.location.lat}, ${draft.location.lng}. Click the map to move it.`
                  : 'No location yet: click the map where this place is.'}
                {draft.location && (
                  <button type="button" className="link-button" onClick={() => setDraft((d) => ({ ...d, location: null }))}>
                    Remove location
                  </button>
                )}
              </p>

              <div className="form-grid">
                <label className="label" htmlFor="sp-name">Name <span className="req" aria-hidden="true">*</span></label>
                <input id="sp-name" className="input" required maxLength={160} value={draft.name} onChange={set('name')} />

                <label className="label" htmlFor="sp-category">Category <span className="req" aria-hidden="true">*</span></label>
                <select id="sp-category" className="input" value={draft.category} onChange={set('category')}>
                  {Object.values(SAFE_POINT_CATEGORY).map((c) => (
                    <option key={c} value={c}>{CATEGORY_LABEL[c]}</option>
                  ))}
                </select>

                <label className="label" htmlFor="sp-where">Where on campus</label>
                <input id="sp-where" className="input" maxLength={300} value={draft.location_description} onChange={set('location_description')} placeholder="Building code, landmark" />

                <label className="label" htmlFor="sp-hours">Opening hours shown to students <span className="req" aria-hidden="true">*</span></label>
                <input id="sp-hours" className="input" required maxLength={300} value={draft.operating_hours} onChange={set('operating_hours')} placeholder="e.g. 8:10 AM - 5:10 PM, Mon-Fri" />
              </div>

              <fieldset className="hours">
                <legend>Opening schedule used by the navigator (Malaysia time)</legend>
                <label className="check">
                  <input type="checkbox" checked={draft.always} onChange={set('always')} /> Open 24 hours, every day
                </label>
                {!draft.always && (
                  <>
                    <p className="muted small hours__help">One or more ranges per day, e.g. <code>08:00-12:15, 14:45-17:00</code>. Leave empty if closed. A range like <code>22:00-02:00</code> runs past midnight.</p>
                    {DAYS.map(([day, label]) => (
                      <div className="hours__row" key={day}>
                        <label htmlFor={`sp-${day}`}>{label}</label>
                        <input
                          id={`sp-${day}`}
                          className="input"
                          value={draft.days[day]}
                          placeholder="Closed"
                          onChange={(e) => setDraft((d) => ({ ...d, days: { ...d.days, [day]: e.target.value } }))}
                        />
                      </div>
                    ))}
                  </>
                )}
              </fieldset>

              <div className="form-grid">
                <label className="label" htmlFor="sp-phone">Phone to call (international format)</label>
                <input id="sp-phone" className="input" value={draft.contact_phone} onChange={set('contact_phone')} placeholder="+6046534999" />

                <label className="label" htmlFor="sp-contact-notes">Other numbers</label>
                <input id="sp-contact-notes" className="input" maxLength={500} value={draft.contact_notes} onChange={set('contact_notes')} />

                <label className="label" htmlFor="sp-notes">Notes for students</label>
                <input id="sp-notes" className="input" maxLength={500} value={draft.notes} onChange={set('notes')} placeholder="e.g. Closed on public holidays" />
              </div>

              <label className="check">
                <input type="checkbox" checked={draft.is_active} onChange={set('is_active')} /> Active (shown to students)
              </label>

              {formError && <p className="form-error" role="alert">{formError}</p>}
              {saved && <p className="form-ok" role="status">{saved}</p>}

              <div className="sp-form__actions">
                <button type="submit" className="btn btn--primary" disabled={saving || !draft.name.trim() || !draft.operating_hours.trim()}>
                  {saving ? 'Saving…' : 'Save'}
                </button>
                <button type="button" className="btn" onClick={() => { setDraft(null); setSelectedId(null); }}>
                  Close
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
