import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CircleMarker, MapContainer, TileLayer, Tooltip } from 'react-leaflet';
import { Download, RotateCw } from 'lucide-react';
import { formatDateTime, formatDuration } from '@safewalk/shared';
import { apiGet } from '../lib/api.js';
import { TILE_ATTRIBUTION, TILE_URL } from '../lib/config.js';
import { INCIDENT_CATEGORY_LABEL, SEVERITY_LABEL } from '../components/labels.js';
import { Category } from './ReportsPage.jsx';

const RANGES = [
  [7, '7 days'],
  [30, '30 days'],
  [90, '90 days'],
  [365, '12 months'],
];
const CAMPUS_CENTER = [5.3559, 100.3025]; // USM main campus (map start position only)
const pct = (v) => (v === null ? null : `${Math.round(v * 100)}%`);
const dayFmt = new Intl.DateTimeFormat('en-MY', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const bucketLabel = (start, unit) => (unit === 'week' ? `Week of ${dayFmt.format(new Date(`${start}T00:00:00Z`))}` : dayFmt.format(new Date(`${start}T00:00:00Z`)));

/** A figure, or the reason there is none. */
function Stat({ label, value, sub, empty }) {
  return (
    <div className="stat">
      <span className="stat__label">{label}</span>
      {value === null || value === undefined ? <span className="stat__empty">{empty}</span> : <span className="stat__value num">{value}</span>}
      {sub && <span className="stat__sub">{sub}</span>}
    </div>
  );
}

function durationStat(label, s, min) {
  return (
    <Stat
      label={label}
      value={s.median_s === null ? null : formatDuration(s.median_s)}
      empty={`Not enough data (${s.n} of ${min} needed)`}
      sub={s.median_s === null ? null : `Median of ${s.n} alerts. 9 in 10 within ${formatDuration(s.p90_s)}`}
    />
  );
}

/** Width of the chart's box in CSS pixels, so the SVG draws 1:1 and text stays at its real size. */
function useWidth() {
  const ref = useRef(null);
  const [width, setWidth] = useState(640);
  useEffect(() => {
    if (!ref.current) return undefined;
    const ro = new ResizeObserver(([entry]) => setWidth(Math.max(280, Math.round(entry.contentRect.width))));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return [ref, width];
}

/** Rounded "nice" axis maximum and ticks. */
function niceScale(max) {
  if (max <= 4) return { top: 4, ticks: [0, 1, 2, 3, 4] };
  const step = 10 ** Math.floor(Math.log10(max / 4));
  const unit = [1, 2, 5, 10].map((m) => m * step).find((u) => u * 4 >= max);
  return { top: unit * 4, ticks: [0, 1, 2, 3, 4].map((i) => i * unit) };
}

const SERIES = [
  { key: 'reports', label: 'Safety reports', cls: 's1' },
  { key: 'alerts', label: 'Emergency alerts', cls: 's2' },
];

/** Change over time: two series on one count axis, crosshair tooltip, table view. */
function TrendChart({ trend, unit }) {
  const rows = trend.map((d) => ({ ...d, alerts: d.sos + d.overdue }));
  const [hover, setHover] = useState(null);
  const [boxRef, W] = useWidth();
  const H = 240;
  const pad = { l: 36, r: 16, t: 12, b: 28 };
  const max = Math.max(1, ...rows.flatMap((d) => [d.reports, d.alerts]));
  const { top, ticks } = niceScale(max);
  const x = (i) => pad.l + (rows.length === 1 ? (W - pad.l - pad.r) / 2 : (i * (W - pad.l - pad.r)) / (rows.length - 1));
  const y = (v) => pad.t + (1 - v / top) * (H - pad.t - pad.b);
  const path = (k) => rows.map((d, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(d[k]).toFixed(1)}`).join('');
  const labelEvery = Math.ceil(rows.length / Math.max(2, Math.floor(W / 90)));
  const svgRef = useRef(null);

  function move(e) {
    const box = svgRef.current.getBoundingClientRect();
    const px = ((e.clientX - box.left) / box.width) * W;
    let best = 0;
    rows.forEach((_, i) => {
      if (Math.abs(x(i) - px) < Math.abs(x(best) - px)) best = i;
    });
    setHover(best);
  }
  const h = hover === null ? null : rows[hover];
  const last = rows.length - 1;

  return (
    <figure className="chart">
      <div className="chart__legend" aria-hidden="true">
        {SERIES.map((s) => (
          <span key={s.key} className="chart__key">
            <span className={`chart__swatch chart__swatch--${s.cls}`} /> {s.label}
          </span>
        ))}
      </div>
      <div className="chart__plot" ref={boxRef}>
        <svg ref={svgRef} width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Safety reports and emergency alerts per ${unit}`} onMouseMove={move} onMouseLeave={() => setHover(null)}>
          {ticks.map((t) => (
            <g key={t}>
              <line x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} className="chart__grid" />
              <text x={pad.l - 8} y={y(t)} className="chart__tick" textAnchor="end" dominantBaseline="middle">
                {t}
              </text>
            </g>
          ))}
          {rows.map((d, i) =>
            i % labelEvery === 0 ? (
              <text key={d.start} x={x(i)} y={H - 8} className="chart__tick" textAnchor="middle">
                {dayFmt.format(new Date(`${d.start}T00:00:00Z`))}
              </text>
            ) : null,
          )}
          {h && <line x1={x(hover)} x2={x(hover)} y1={pad.t} y2={H - pad.b} className="chart__cross" />}
          {SERIES.map((s) => (
            <path key={s.key} d={path(s.key)} className={`chart__line chart__line--${s.cls}`} />
          ))}
          {SERIES.map((s) => (
            <g key={s.key}>
              {(h ? [hover] : [last]).map((i) => (
                <circle key={i} cx={x(i)} cy={y(rows[i][s.key])} r="5" className={`chart__dot chart__dot--${s.cls}`} />
              ))}
            </g>
          ))}
        </svg>
        {h && (
          <div className="chart__tip" style={{ left: `${(x(hover) / W) * 100}%` }} role="status">
            <strong>{bucketLabel(h.start, unit)}</strong>
            <span>
              <span className="chart__swatch chart__swatch--s1" /> {h.reports} reports
            </span>
            <span>
              <span className="chart__swatch chart__swatch--s2" /> {h.alerts} alerts ({h.sos} SOS, {h.overdue} overdue)
            </span>
          </div>
        )}
      </div>
      <details className="chart__table">
        <summary>Show as a table</summary>
        <table className="table">
          <thead>
            <tr>
              <th scope="col">{unit === 'week' ? 'Week starting' : 'Day'}</th>
              <th scope="col">Reports</th>
              <th scope="col">SOS</th>
              <th scope="col">Overdue journeys</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((d) => (
              <tr key={d.start}>
                <td>{bucketLabel(d.start, unit)}</td>
                <td className="num">{d.reports}</td>
                <td className="num">{d.sos}</td>
                <td className="num">{d.overdue}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}

/** Hour of day: two small multiples on one shared scale. */
function HourChart({ byHour }) {
  const [hover, setHover] = useState(null);
  const max = Math.max(1, ...byHour.flatMap((h) => [h.reports, h.alerts]));
  const { top } = niceScale(max);
  const [boxRef, W] = useWidth();
  const H = 72;
  const bw = W / 24;
  return (
    <figure className="chart" ref={boxRef}>
      {SERIES.map((s) => (
        <div key={s.key} className="hours-row">
          <span className="hours-row__label">
            <span className={`chart__swatch chart__swatch--${s.cls}`} /> {s.label}
          </span>
          <div className="chart__plot">
            <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${s.label} by hour of the day`} onMouseLeave={() => setHover(null)}>
              <line x1="0" x2={W} y1={H - 0.5} y2={H - 0.5} className="chart__grid" />
              {byHour.map((h) => {
                const v = h[s.key];
                const bh = v ? Math.max(3, (v / top) * (H - 6)) : 0;
                return (
                  <g key={h.hour} onMouseEnter={() => setHover({ ...h, s })}>
                    <rect x={h.hour * bw} y="0" width={bw} height={H} fill="transparent" />
                    {v > 0 && <rect x={h.hour * bw + 1} y={H - bh} width={bw - 2} height={bh} rx="3" className={`chart__bar chart__bar--${s.cls}`} />}
                  </g>
                );
              })}
            </svg>
            {hover?.s.key === s.key && (
              <div className="chart__tip chart__tip--low" style={{ left: `${((hover.hour + 0.5) / 24) * 100}%` }} role="status">
                <strong>
                  {String(hover.hour).padStart(2, '0')}:00 to {String(hover.hour).padStart(2, '0')}:59
                </strong>
                <span>
                  {hover[s.key]} {s.key === 'reports' ? 'reports' : 'alerts'}
                </span>
              </div>
            )}
          </div>
        </div>
      ))}
      <div className="hours-axis" aria-hidden="true">
        {[0, 6, 12, 18].map((h) => (
          <span key={h} style={{ left: `${(h / 24) * 100}%` }}>
            {String(h).padStart(2, '0')}:00
          </span>
        ))}
      </div>
    </figure>
  );
}

function CategoryTable({ rows }) {
  const max = Math.max(1, ...rows.map((r) => r.reports));
  return (
    <table className="table cat-table">
      <thead>
        <tr>
          <th scope="col">Category</th>
          <th scope="col">Reports</th>
          <th scope="col">Confirmed</th>
          <th scope="col">Rejected</th>
          <th scope="col">Pending</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.category}>
            <td>
              <Category value={r.category} />
            </td>
            <td>
              <span className="cat-bar">
                <span className="cat-bar__fill" style={{ width: `${(r.reports / max) * 100}%` }} />
                <span className="num">{r.reports}</span>
              </span>
            </td>
            <td className="num">{r.verified + r.resolved}</td>
            <td className="num">{r.rejected}</td>
            <td className="num">{r.pending}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function downloadRepairs(repairs) {
  const head = ['Category', 'Severity', 'Reports', 'First reported (MYT)', 'Days open', 'Latitude', 'Longitude', 'Map link', 'Public note'];
  const esc = (v) => `"${String(v ?? '').replaceAll('"', '""')}"`;
  const lines = repairs.map((r) =>
    [
      INCIDENT_CATEGORY_LABEL[r.category],
      SEVERITY_LABEL[r.severity_level],
      r.report_count,
      formatDateTime(r.first_reported_at),
      r.open_days,
      r.location.lat.toFixed(6),
      r.location.lng.toFixed(6),
      `https://www.openstreetmap.org/?mlat=${r.location.lat}&mlon=${r.location.lng}#map=19/${r.location.lat}/${r.location.lng}`,
      r.public_note,
    ]
      .map(esc)
      .join(','),
  );
  const blob = new Blob([[head.map(esc).join(','), ...lines].join('\r\n')], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `safewalk-repairs-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function AnalyticsPage({ accessToken }) {
  const [days, setDays] = useState(30);
  const [data, setData] = useState(null);
  const [status, setStatus] = useState('loading');
  const [error, setError] = useState(null);

  const load = useCallback(
    async (signal) => {
      setStatus('loading');
      try {
        setData(await apiGet(`/api/staff/analytics?days=${days}`, accessToken, signal));
        setStatus('ready');
      } catch (err) {
        if (err.name === 'AbortError') return;
        setError(err);
        setStatus('error');
      }
    },
    [days, accessToken],
  );
  useEffect(() => {
    const ctrl = new AbortController();
    load(ctrl.signal);
    return () => ctrl.abort();
  }, [load]);

  const maxSpot = useMemo(() => Math.max(1, ...(data?.hotspots ?? []).map((h) => h.incidents)), [data]);

  return (
    <section className="page">
      <header className="page__header">
        <div>
          <h1>Campus safety analytics</h1>
          <p className="muted">From SafeWalk’s own records: alerts, response times, reports and where problems repeat. Malaysia time.</p>
        </div>
        <div className="page__actions">
          <div className="segmented" role="group" aria-label="Time range">
            {RANGES.map(([d, label]) => (
              <button key={d} type="button" className={`segmented__btn${d === days ? ' segmented__btn--on' : ''}`} aria-pressed={d === days} onClick={() => setDays(d)}>
                {label}
              </button>
            ))}
          </div>
          <button type="button" className="btn" onClick={() => load()} aria-label="Refresh">
            <RotateCw aria-hidden="true" />
          </button>
        </div>
      </header>

      {status === 'error' && (
        <div className="state state--error" role="alert">
          <p>Could not load analytics: {error.message}</p>
          <button type="button" className="btn" onClick={() => load()}>
            Try again
          </button>
        </div>
      )}
      {status === 'loading' && !data && <div className="skeleton skeleton--pane" aria-label="Loading analytics" />}

      {data && (
        <div className={`analytics${status === 'loading' ? ' analytics--stale' : ''}`} aria-busy={status === 'loading'}>
          <div className="stats">
            <Stat
              label="Emergency alerts"
              value={data.alerts.total}
              sub={`${data.alerts.by_trigger.HOLD} SOS, ${data.alerts.by_trigger.SILENT} silent SOS, ${data.alerts.by_trigger.ETA} overdue journeys`}
            />
            {durationStat('Time to acknowledge', data.alerts.response.acknowledge, data.min_sample)}
            {durationStat('Time to arrive on site', data.alerts.response.arrive, data.min_sample)}
            <Stat label="Safety reports" value={data.reports.reports} sub={`Grouped into ${data.reports.incidents} incidents`} />
            <Stat
              label="Rejected as false"
              value={pct(data.reports.review.rejected_rate)}
              empty={`Not enough data (${data.reports.review.decided} of ${data.min_sample} reviewed)`}
              sub={data.reports.review.rejected_rate === null ? null : `Of ${data.reports.review.decided} reviewed incidents`}
            />
            <Stat
              label="Journeys shared"
              value={data.journeys.started}
              sub={data.journeys.started ? `${data.journeys.escalated} escalated to security (${pct(data.journeys.escalation_rate)})` : 'No journeys in this period'}
            />
          </div>

          <section className="glass panel">
            <h2 className="panel__title">Reports and alerts over time</h2>
            <p className="muted small">Per {data.range.bucket}. Alerts are SOS and overdue journeys together.</p>
            <TrendChart trend={data.trend} unit={data.range.bucket} />
          </section>

          <div className="panels-2">
            <section className="glass panel">
              <h2 className="panel__title">Time of day</h2>
              <p className="muted small">When reports and alerts come in, by hour.</p>
              <HourChart byHour={data.by_hour} />
            </section>
            <section className="glass panel">
              <h2 className="panel__title">Reports by category</h2>
              {data.reports.by_category.length === 0 ? (
                <p className="muted">No reports in this period.</p>
              ) : (
                <CategoryTable rows={data.reports.by_category} />
              )}
            </section>
          </div>

          <div className="panels-2 panels-2--map">
            <section className="glass panel">
              <h2 className="panel__title">Where problems repeat</h2>
              <p className="muted small">
                Confirmed incidents within {data.hotspot_radius_m} m of each other count as one place. Larger circles mean more incidents.
              </p>
              <div className="chart__legend">
                <span className="chart__key">
                  <span className="chart__swatch chart__swatch--s1" /> Confirmed incidents
                </span>
                <span className="chart__key">
                  <span className="chart__swatch chart__swatch--s2 chart__swatch--dot" /> Emergency alerts
                </span>
              </div>
              <MapContainer center={CAMPUS_CENTER} zoom={16} className="analytics__map" scrollWheelZoom={false}>
                <TileLayer url={TILE_URL} attribution={TILE_ATTRIBUTION} className="sw-dark-tiles" maxZoom={19} />
                {data.points.alerts.map((a) => (
                  <CircleMarker key={a.alert_id} center={[a.location.lat, a.location.lng]} radius={4} className="map-alert" />
                ))}
                {data.hotspots.map((h, i) => (
                  <CircleMarker key={i} center={[h.location.lat, h.location.lng]} radius={8 + 14 * Math.sqrt(h.incidents / maxSpot)} className="map-hotspot">
                    <Tooltip>
                      {h.incidents} {h.incidents === 1 ? 'incident' : 'incidents'}, mostly {INCIDENT_CATEGORY_LABEL[h.top_category].toLowerCase()}
                    </Tooltip>
                  </CircleMarker>
                ))}
              </MapContainer>
            </section>
            <section className="glass panel">
              <h2 className="panel__title">Places with the most incidents</h2>
              {data.hotspots.length === 0 ? (
                <p className="muted">No confirmed incidents in this period.</p>
              ) : (
                <ol className="spots">
                  {data.hotspots.map((h, i) => (
                    <li key={i} className="spots__row">
                      <span className="spots__count num">{h.incidents}</span>
                      <span className="spots__main">
                        <span>
                          {Object.entries(h.categories)
                            .sort((a, b) => b[1] - a[1])
                            .map(([c, n]) => `${INCIDENT_CATEGORY_LABEL[c]} ${n}`)
                            .join(', ')}
                        </span>
                        <span className="muted small">
                          {h.still_open} still open, latest {formatDateTime(h.latest)}
                        </span>
                        <a className="small" href={`https://www.openstreetmap.org/?mlat=${h.location.lat}&mlon=${h.location.lng}#map=19/${h.location.lat}/${h.location.lng}`} target="_blank" rel="noreferrer">
                          Open in OpenStreetMap
                        </a>
                      </span>
                    </li>
                  ))}
                </ol>
              )}
            </section>
          </div>

          <section className="glass panel">
            <div className="panel__head">
              <div>
                <h2 className="panel__title">Repair list</h2>
                <p className="muted small">Confirmed broken lighting and unsafe paths that are not resolved yet, highest severity and oldest first. Not limited to the time range.</p>
              </div>
              <button type="button" className="btn" onClick={() => downloadRepairs(data.repairs)} disabled={data.repairs.length === 0}>
                <Download aria-hidden="true" /> Download CSV
              </button>
            </div>
            {data.repairs.length === 0 ? (
              <p className="muted">Nothing waiting for repair.</p>
            ) : (
              <table className="table">
                <thead>
                  <tr>
                    <th scope="col">Problem</th>
                    <th scope="col">Severity</th>
                    <th scope="col">Reports</th>
                    <th scope="col">First reported</th>
                    <th scope="col">Open for</th>
                    <th scope="col">Where</th>
                  </tr>
                </thead>
                <tbody>
                  {data.repairs.map((r) => (
                    <tr key={r.group_id}>
                      <td>
                        <Category value={r.category} />
                      </td>
                      <td>{SEVERITY_LABEL[r.severity_level]}</td>
                      <td className="num">{r.report_count}</td>
                      <td>{formatDateTime(r.first_reported_at)}</td>
                      <td className="num">{r.open_days === 1 ? '1 day' : `${r.open_days} days`}</td>
                      <td>
                        <a href={`https://www.openstreetmap.org/?mlat=${r.location.lat}&mlon=${r.location.lng}#map=19/${r.location.lat}/${r.location.lng}`} target="_blank" rel="noreferrer">
                          {r.location.lat.toFixed(5)}, {r.location.lng.toFixed(5)}
                        </a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
          <p className="muted small">
            Figures cover {formatDateTime(data.range.from)} to {formatDateTime(data.range.to)}. A median needs at least {data.min_sample} values.
          </p>
        </div>
      )}
    </section>
  );
}
