/**
 * Module 4: campus safety analytics (proposal Module 4 "analyse campus safety
 * data"; section 6 "provide exact data to help the university allocate
 * resources for infrastructure repairs, such as fixing unlit pathways").
 *
 * Every number is computed from the records SafeWalk already keeps: alerts and
 * their status log, journeys, incident reports and incidents. Nothing is
 * estimated or filled in. Each figure carries its sample size `n`, and a median
 * is null when fewer than MIN_SAMPLE values exist, so the dashboard can say
 * "not enough data yet" instead of showing a misleading number.
 *
 * Days, hours and weeks are counted in Malaysia time.
 */
export const ANALYTICS_RANGES = [7, 30, 90, 365];
export const MIN_SAMPLE = 3;
const TZ = 'Asia/Kuala_Lumpur';
// Confirmed incidents closer than this are counted as one hotspot.
export const HOTSPOT_RADIUS_M = 75;
const REPAIR_CATEGORIES = ['BROKEN_LIGHTING', 'UNSAFE_PATH'];

const iso = (d) => (d ? new Date(d).toISOString() : null);
const num = (v) => (v === null || v === undefined ? null : Number(v));
const round = (v, digits = 0) => (v === null ? null : Number(v.toFixed(digits)));

/** { n, median_s, p90_s } from a list of seconds; medians need MIN_SAMPLE values. */
export function durationStats(values) {
  const v = values.filter((x) => x !== null && Number.isFinite(x) && x >= 0).sort((a, b) => a - b);
  const pct = (p) => {
    const i = (v.length - 1) * p;
    const lo = Math.floor(i);
    const hi = Math.ceil(i);
    return v[lo] + (v[hi] - v[lo]) * (i - lo);
  };
  if (v.length < MIN_SAMPLE) return { n: v.length, median_s: null, p90_s: null };
  return { n: v.length, median_s: round(pct(0.5)), p90_s: round(pct(0.9)) };
}

export function createAnalyticsService({ pool, clock = () => new Date() }) {
  async function alerts(from, to) {
    const { rows } = await pool.query(
      `select a.alert_id, a.trigger_type, a.status,
              extract(epoch from (select min(l.updated_at) from public.alert_status_log l
                                   where l.alert_id = a.alert_id and l.staff_id is not null) - a.triggered_at) as ack_s,
              extract(epoch from (select min(l.updated_at) from public.alert_status_log l
                                   where l.alert_id = a.alert_id and l.new_status = 'ARRIVED') - a.triggered_at) as arrive_s,
              extract(epoch from a.resolved_at - a.triggered_at) as resolve_s
         from public.sos_alert a
        where a.triggered_at >= $1 and a.triggered_at < $2`,
      [from, to],
    );
    const byType = { HOLD: 0, SILENT: 0, ETA: 0 };
    for (const r of rows) byType[r.trigger_type] = (byType[r.trigger_type] ?? 0) + 1;
    const pick = (k) => rows.map((r) => num(r[k]));
    return {
      total: rows.length,
      by_trigger: byType,
      open: rows.filter((r) => r.status !== 'RESOLVED').length,
      unacknowledged: rows.filter((r) => r.status === 'NEW').length,
      response: {
        acknowledge: durationStats(pick('ack_s')),
        arrive: durationStats(pick('arrive_s')),
        resolve: durationStats(pick('resolve_s')),
      },
    };
  }

  async function journeys(from, to) {
    const { rows } = await pool.query(
      `select count(*)::int as started,
              count(*) filter (where escalated_at is not null)::int as escalated,
              count(*) filter (where end_reason in ('ARRIVED', 'SAFE_CONFIRMED'))::int as arrived_safely,
              count(*) filter (where status in ('ACTIVE', 'GRACE_PROMPT', 'ESCALATED'))::int as in_progress
         from public.trip where started_at >= $1 and started_at < $2`,
      [from, to],
    );
    const r = rows[0];
    return { ...r, escalation_rate: r.started ? round(r.escalated / r.started, 3) : null };
  }

  async function reports(from, to) {
    const byCategory = await pool.query(
      `select category, count(*)::int as reports
         from public.incident_report where submitted_at >= $1 and submitted_at < $2
        group by category`,
      [from, to],
    );
    const groups = await pool.query(
      `select category, status, auto_verified, verified_by is not null as staff_reviewed,
              extract(epoch from reviewed_at - created_at) as review_s,
              extract(epoch from resolved_at - created_at) as resolve_s
         from public.incident_group where created_at >= $1 and created_at < $2`,
      [from, to],
    );
    const categories = {};
    for (const r of byCategory.rows) categories[r.category] = { reports: r.reports, incidents: 0, verified: 0, rejected: 0, resolved: 0, pending: 0 };
    for (const g of groups.rows) {
      const c = (categories[g.category] ??= { reports: 0, incidents: 0, verified: 0, rejected: 0, resolved: 0, pending: 0 });
      c.incidents += 1;
      c[g.status.toLowerCase()] += 1;
    }
    const all = groups.rows;
    const count = (s) => all.filter((g) => g.status === s).length;
    const decided = all.filter((g) => g.status !== 'PENDING').length;
    const confirmed = count('VERIFIED') + count('RESOLVED');
    return {
      reports: byCategory.rows.reduce((t, r) => t + r.reports, 0),
      incidents: all.length,
      by_status: { PENDING: count('PENDING'), VERIFIED: count('VERIFIED'), REJECTED: count('REJECTED'), RESOLVED: count('RESOLVED') },
      by_category: Object.entries(categories)
        .map(([category, c]) => ({ category, ...c }))
        .sort((a, b) => b.reports - a.reports || b.incidents - a.incidents),
      review: {
        decided,
        // Share of decided incidents that security rejected as false or misleading.
        rejected_rate: decided >= MIN_SAMPLE ? round(count('REJECTED') / decided, 3) : null,
        // Share of confirmed incidents confirmed by 3+ people rather than by staff.
        auto_verified_rate: confirmed >= MIN_SAMPLE ? round(all.filter((g) => g.auto_verified).length / confirmed, 3) : null,
        // Time from first report to a staff decision (auto-verified excluded).
        time_to_review: durationStats(all.filter((g) => !g.auto_verified).map((g) => num(g.review_s))),
        time_to_resolve: durationStats(all.map((g) => num(g.resolve_s))),
      },
    };
  }

  async function trend(from, to, unit) {
    const { rows } = await pool.query(
      `with buckets as (
         select generate_series(date_trunc($3, $1::timestamptz at time zone '${TZ}'),
                                date_trunc($3, ($2::timestamptz - interval '1 second') at time zone '${TZ}'),
                                ('1 ' || $3)::interval) as bucket
       ),
       r as (select date_trunc($3, submitted_at at time zone '${TZ}') as bucket, count(*)::int as n
               from public.incident_report where submitted_at >= $1 and submitted_at < $2 group by 1),
       s as (select date_trunc($3, triggered_at at time zone '${TZ}') as bucket,
                    count(*) filter (where trigger_type <> 'ETA')::int as sos,
                    count(*) filter (where trigger_type = 'ETA')::int as overdue
               from public.sos_alert where triggered_at >= $1 and triggered_at < $2 group by 1)
       select to_char(b.bucket, 'YYYY-MM-DD') as start, coalesce(r.n, 0) as reports,
              coalesce(s.sos, 0) as sos, coalesce(s.overdue, 0) as overdue
         from buckets b left join r using (bucket) left join s using (bucket)
        order by b.bucket`,
      [from, to, unit],
    );
    return rows;
  }

  async function byHour(from, to) {
    const { rows } = await pool.query(
      `with h as (select generate_series(0, 23) as hour),
       r as (select extract(hour from submitted_at at time zone '${TZ}')::int as hour, count(*)::int as n
               from public.incident_report where submitted_at >= $1 and submitted_at < $2 group by 1),
       s as (select extract(hour from triggered_at at time zone '${TZ}')::int as hour, count(*)::int as n
               from public.sos_alert where triggered_at >= $1 and triggered_at < $2 group by 1)
       select h.hour, coalesce(r.n, 0) as reports, coalesce(s.n, 0) as alerts
         from h left join r using (hour) left join s using (hour) order by h.hour`,
      [from, to],
    );
    return rows;
  }

  /** Confirmed incidents (verified or resolved) grouped by distance. */
  async function hotspots(from, to) {
    const { rows } = await pool.query(
      `with g as (
         select group_id, category, status, created_at, centroid_geom,
                st_clusterdbscan(st_transform(centroid_geom::geometry, 32647), eps => $3, minpoints => 1) over () as cluster
           from public.incident_group
          where created_at >= $1 and created_at < $2 and status in ('VERIFIED', 'RESOLVED')
       )
       select cluster, count(*)::int as incidents,
              count(*) filter (where status = 'VERIFIED')::int as still_open,
              max(created_at) as latest,
              st_y(st_centroid(st_collect(centroid_geom::geometry))) as lat,
              st_x(st_centroid(st_collect(centroid_geom::geometry))) as lng,
              jsonb_object_agg(category, n) as categories
         from (select g.*, count(*) over (partition by cluster, category)::int as n from g) x
        group by cluster
        order by incidents desc, latest desc
        limit 10`,
      [from, to, HOTSPOT_RADIUS_M],
    );
    return rows.map((r) => ({
      incidents: r.incidents,
      still_open: r.still_open,
      latest: iso(r.latest),
      location: { lat: r.lat, lng: r.lng },
      categories: r.categories,
      top_category: Object.entries(r.categories).sort((a, b) => b[1] - a[1])[0][0],
    }));
  }

  async function points(from, to) {
    const incidents = await pool.query(
      `select group_id, category, severity_level, status,
              st_y(centroid_geom::geometry) as lat, st_x(centroid_geom::geometry) as lng
         from public.incident_group
        where created_at >= $1 and created_at < $2 and status in ('VERIFIED', 'RESOLVED')
        order by created_at desc limit 500`,
      [from, to],
    );
    const alertsRes = await pool.query(
      `select alert_id, trigger_type,
              st_y(alert_location::geometry) as lat, st_x(alert_location::geometry) as lng
         from public.sos_alert
        where triggered_at >= $1 and triggered_at < $2 and alert_location is not null
        order by triggered_at desc limit 500`,
      [from, to],
    );
    return {
      incidents: incidents.rows.map((r) => ({ group_id: r.group_id, category: r.category, severity_level: r.severity_level, status: r.status, location: { lat: r.lat, lng: r.lng } })),
      alerts: alertsRes.rows.map((r) => ({ alert_id: r.alert_id, trigger_type: r.trigger_type, location: { lat: r.lat, lng: r.lng } })),
    };
  }

  /** Verified, not yet resolved lighting and path problems: a work list for repairs. */
  async function repairs(now) {
    const { rows } = await pool.query(
      `select group_id, category, severity_level, report_count, created_at, last_reported_at, public_note,
              st_y(centroid_geom::geometry) as lat, st_x(centroid_geom::geometry) as lng
         from public.incident_group
        where status = 'VERIFIED' and category = any($1::public.incident_category[])
        order by severity_level desc, created_at asc
        limit 100`,
      [REPAIR_CATEGORIES],
    );
    return rows.map((r) => ({
      group_id: r.group_id,
      category: r.category,
      severity_level: r.severity_level,
      report_count: r.report_count,
      first_reported_at: iso(r.created_at),
      last_reported_at: iso(r.last_reported_at),
      open_days: Math.floor((now - new Date(r.created_at)) / 86_400_000),
      public_note: r.public_note ?? null,
      location: { lat: r.lat, lng: r.lng },
    }));
  }

  return {
    async summary({ days = 30 } = {}) {
      const to = clock();
      const from = new Date(to.getTime() - days * 86_400_000);
      const unit = days > 31 ? 'week' : 'day';
      const [a, j, r, t, h, hs, p, rep] = await Promise.all([
        alerts(from, to),
        journeys(from, to),
        reports(from, to),
        trend(from, to, unit),
        byHour(from, to),
        hotspots(from, to),
        points(from, to),
        repairs(to),
      ]);
      return {
        range: { days, from: iso(from), to: iso(to), bucket: unit, timezone: TZ },
        min_sample: MIN_SAMPLE,
        hotspot_radius_m: HOTSPOT_RADIUS_M,
        alerts: a,
        journeys: j,
        reports: r,
        trend: t,
        by_hour: h,
        hotspots: hs,
        points: p,
        repairs: rep,
      };
    },
  };
}
