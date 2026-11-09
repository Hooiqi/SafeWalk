import { AUTO_VERIFY, INCIDENT_STATUS as S } from '@safewalk/shared';
import { withTransaction } from '../../db/pool.js';
import { HttpError, conflict, notFound } from '../../lib/errors.js';
import { lineWkt, pointWkt } from '../../lib/geo.js';
import { cleanPhoto } from './photoStorage.js';

const iso = (d) => (d ? new Date(d).toISOString() : null);

const GROUP_COLUMNS = `
  g.group_id, g.category, g.severity_level, g.status, g.auto_verified, g.report_count,
  g.created_at, g.last_reported_at, g.reviewed_at, g.resolved_at, g.public_note,
  st_y(g.centroid_geom::geometry) as lat, st_x(g.centroid_geom::geometry) as lng`;

/** What anyone signed in may see about an incident. No reporter, no description, no photo. */
export function toPublicIncident(row) {
  return {
    group_id: row.group_id,
    category: row.category,
    severity_level: row.severity_level,
    status: row.status,
    auto_verified: row.auto_verified,
    report_count: row.report_count,
    location: { lat: row.lat, lng: row.lng },
    first_reported_at: iso(row.created_at),
    last_reported_at: iso(row.last_reported_at),
    reviewed_at: iso(row.reviewed_at),
    resolved_at: iso(row.resolved_at),
    public_note: row.public_note ?? null,
  };
}

function toMyReport(row) {
  return {
    report_id: row.report_id,
    group_id: row.group_id,
    category: row.category,
    severity_level: row.severity_level,
    description: row.description,
    is_anonymous: row.is_anonymous,
    has_photo: Boolean(row.photo_url),
    location: { lat: row.lat, lng: row.lng },
    submitted_at: iso(row.submitted_at),
    // The status of a report is the status of the incident it belongs to.
    status: row.group_status,
    auto_verified: row.auto_verified,
    report_count: row.report_count,
    reviewed_at: iso(row.reviewed_at),
    resolved_at: iso(row.resolved_at),
    public_note: row.public_note ?? null,
  };
}

const MY_REPORT_SQL = `
  select r.report_id, r.group_id, r.category, r.severity_level, r.description, r.is_anonymous,
         r.photo_url, r.submitted_at,
         st_y(r.report_geom::geometry) as lat, st_x(r.report_geom::geometry) as lng,
         g.status as group_status, g.auto_verified, g.report_count, g.reviewed_at, g.resolved_at, g.public_note
    from public.incident_report r
    join public.incident_report_owner o on o.report_id = r.report_id
    join public.incident_group g on g.group_id = r.group_id`;

// Staff actions (proposal Module 3 / Module 4 "Safety Report Management").
// Each action names the statuses it may start from.
const ACTIONS = {
  verify: { from: [S.PENDING, S.VERIFIED], to: S.VERIFIED },
  reject: { from: [S.PENDING, S.VERIFIED], to: S.REJECTED },
  resolve: { from: [S.VERIFIED], to: S.RESOLVED },
};

const tooMany = (message) => new HttpError(429, 'RATE_LIMITED', message);

/**
 * Module 3: Incident Reporting and Safety Map.
 *
 * A report joins the nearest open incident of the same category within the
 * auto-verify radius that was last reported inside the time window
 * (spatio-temporal clustering with ST_DWithin, proposal 5.2.3 3A). When reports
 * from enough different people fall within that radius and window, the
 * incident is verified without waiting for security.
 */
export function createIncidentService({ pool, config, clock = () => new Date(), publisher, photoStorage }) {
  const radiusM = AUTO_VERIFY.RADIUS_M;
  const windowMs = AUTO_VERIFY.WINDOW_MINUTES * 60_000;

  async function loadGroup(db, groupId) {
    const { rows } = await db.query(`select ${GROUP_COLUMNS} from public.incident_group g where g.group_id = $1`, [groupId]);
    return rows[0] ? toPublicIncident(rows[0]) : null;
  }

  async function owners(db, groupId) {
    const { rows } = await db.query(
      `select o.user_id, o.report_id
         from public.incident_report_owner o
         join public.incident_report r on r.report_id = o.report_id
        where r.group_id = $1`,
      [groupId],
    );
    return rows;
  }

  /** Tell security, the reporters and (when the map changed) every app user. */
  async function announce(group, { isNew = false, statusChanged = false, mapChanged = false } = {}) {
    publisher.incidentForStaff(group, { isNew });
    if (statusChanged) publisher.incidentStatus(group, await owners(pool, group.group_id));
    if (mapChanged) publisher.incidentMap(group);
  }

  return {
    // ---- Students and staff (app) ------------------------------------------

    async submit(identity, input) {
      const now = clock();
      const point = pointWkt(input.location);
      const windowStart = new Date(now.getTime() - windowMs);

      const outcome = await withTransaction(pool, async (db) => {
        if (input.client_request_id) {
          const { rows } = await db.query(
            `select report_id from public.incident_report_owner where user_id = $1 and client_request_id = $2`,
            [identity.userId, input.client_request_id],
          );
          if (rows[0]) return { reportId: rows[0].report_id, replay: true };
        }

        const { rows: recent } = await db.query(
          `select count(*)::int as n from public.incident_report_owner where user_id = $1 and created_at > $2`,
          [identity.userId, new Date(now.getTime() - 3_600_000)],
        );
        if (recent[0].n >= config.INCIDENT_REPORTS_PER_HOUR) {
          throw tooMany('You have sent many reports in the last hour. Please wait before sending another.');
        }

        // One report at a time per category, so two people reporting the same
        // thing at once cannot start two separate incidents.
        await db.query(`select pg_advisory_xact_lock(hashtext('incident:' || $1))`, [input.category]);

        const { rows: matches } = await db.query(
          `select g.group_id, g.status
             from public.incident_group g
            where g.category = $1
              and g.status in ('PENDING', 'VERIFIED')
              and g.last_reported_at >= $2
              and st_dwithin(g.centroid_geom, $3::geography, $4)
            order by g.centroid_geom <-> $3::geography
            limit 1`,
          [input.category, windowStart, point, radiusM],
        );
        // Lock the incident by its key (row locks cannot be combined with the
        // nearest-neighbour index scan). Security may have closed it meanwhile.
        let match = null;
        if (matches[0]) {
          const { rows } = await db.query(
            `select group_id, status from public.incident_group
              where group_id = $1 and status in ('PENDING', 'VERIFIED') for update`,
            [matches[0].group_id],
          );
          match = rows[0] ?? null;
        }

        if (match) {
          const { rows: mine } = await db.query(
            `select 1 from public.incident_report r
               join public.incident_report_owner o on o.report_id = r.report_id
              where r.group_id = $1 and o.user_id = $2 and r.submitted_at >= $3`,
            [match.group_id, identity.userId, windowStart],
          );
          if (mine[0]) {
            throw conflict('ALREADY_REPORTED', 'You already reported this incident. You can follow it in My reports.');
          }
        }

        let groupId = match?.group_id;
        if (!groupId) {
          const { rows } = await db.query(
            `insert into public.incident_group
               (category, severity_level, centroid_geom, created_at, last_reported_at, updated_at)
             values ($1, $2, $3::geography, $4, $4, $4)
             returning group_id`,
            [input.category, input.severity_level, point, now],
          );
          groupId = rows[0].group_id;
        }

        const { rows: inserted } = await db.query(
          `insert into public.incident_report
             (group_id, user_id, is_anonymous, description, report_geom, submitted_at, category, severity_level, accuracy_m)
           values ($1, $2, $3, $4, $5::geography, $6, $7, $8, $9)
           returning report_id`,
          [
            groupId,
            input.is_anonymous ? null : identity.userId,
            input.is_anonymous,
            input.description,
            point,
            now,
            input.category,
            input.severity_level,
            input.accuracy_m ?? null,
          ],
        );
        const reportId = inserted[0].report_id;
        await db.query(
          `insert into public.incident_report_owner (report_id, user_id, client_request_id, created_at) values ($1, $2, $3, $4)`,
          [reportId, identity.userId, input.client_request_id ?? null, now],
        );

        if (match) {
          // The pin moves to the middle of the reports; the severity is the highest reported.
          await db.query(
            `update public.incident_group g
                set report_count = s.n,
                    centroid_geom = s.centroid,
                    severity_level = greatest(g.severity_level, $2::public.incident_severity),
                    last_reported_at = $3,
                    updated_at = $3
               from (select count(*)::int as n,
                            st_centroid(st_collect(report_geom::geometry))::geography as centroid
                       from public.incident_report where group_id = $1) s
              where g.group_id = $1`,
            [groupId, input.severity_level, now],
          );
        }

        // Crowdsourced auto-verification: different people, within the radius
        // of this report, inside the time window.
        let autoVerified = false;
        if (match?.status !== S.VERIFIED) {
          const { rows } = await db.query(
            `select count(distinct o.user_id)::int as reporters
               from public.incident_report r
               join public.incident_report_owner o on o.report_id = r.report_id
              where r.group_id = $1
                and r.submitted_at >= $2
                and st_dwithin(r.report_geom, $3::geography, $4)`,
            [groupId, windowStart, point, radiusM],
          );
          if (rows[0].reporters >= AUTO_VERIFY.MIN_REPORTERS) {
            const res = await db.query(
              `update public.incident_group
                  set status = 'VERIFIED', auto_verified = true, reviewed_at = $2, updated_at = $2
                where group_id = $1 and status = 'PENDING'`,
              [groupId, now],
            );
            autoVerified = res.rowCount === 1;
          }
        }

        return { reportId, groupId, isNew: !match, joinedVerified: match?.status === S.VERIFIED, autoVerified };
      });

      if (!outcome.replay) {
        const group = await loadGroup(pool, outcome.groupId);
        await announce(group, {
          isNew: outcome.isNew,
          statusChanged: outcome.autoVerified,
          mapChanged: outcome.autoVerified || outcome.joinedVerified,
        });
      }
      return this.getMine(identity, outcome.reportId);
    },

    async getMine(identity, reportId) {
      const { rows } = await pool.query(`${MY_REPORT_SQL} where o.user_id = $1 and r.report_id = $2`, [identity.userId, reportId]);
      if (!rows[0]) throw notFound('Report not found');
      return toMyReport(rows[0]);
    },

    async listMine(identity, { limit = 50 } = {}) {
      const { rows } = await pool.query(`${MY_REPORT_SQL} where o.user_id = $1 order by r.submitted_at desc limit $2`, [
        identity.userId,
        limit,
      ]);
      return rows.map(toMyReport);
    },

    /** Optional photo, sent by the reporter shortly after the report. */
    async attachPhoto(identity, reportId, body) {
      if (!photoStorage.configured) {
        throw new HttpError(503, 'PHOTO_STORAGE_NOT_CONFIGURED', 'Photo upload is not set up on this server yet. Your report was sent without it.');
      }
      const { rows } = await pool.query(
        `select r.report_id, r.group_id, r.photo_url, r.submitted_at
           from public.incident_report r
           join public.incident_report_owner o on o.report_id = r.report_id
          where r.report_id = $1 and o.user_id = $2`,
        [reportId, identity.userId],
      );
      const report = rows[0];
      if (!report) throw notFound('Report not found');
      if (report.photo_url) throw conflict('PHOTO_ALREADY_ADDED', 'This report already has a photo');
      const ageMinutes = (clock().getTime() - new Date(report.submitted_at).getTime()) / 60_000;
      if (ageMinutes > config.PHOTO_UPLOAD_WINDOW_MINUTES) {
        throw conflict('PHOTO_WINDOW_CLOSED', 'Photos can only be added just after sending a report');
      }

      const { buffer, contentType } = cleanPhoto(body);
      const objectPath = `reports/${reportId}.${contentType === 'image/png' ? 'png' : 'jpg'}`;
      await photoStorage.put(objectPath, buffer, contentType);
      const res = await pool.query(
        `update public.incident_report set photo_url = $2 where report_id = $1 and photo_url is null`,
        [reportId, objectPath],
      );
      if (res.rowCount !== 1) throw conflict('PHOTO_ALREADY_ADDED', 'This report already has a photo');
      publisher.incidentForStaff(await loadGroup(pool, report.group_id));
      return { report_id: reportId, has_photo: true };
    },

    /**
     * Shared safety map: verified incidents inside the visible area only
     * (PostGIS bounding box, proposal 5.2.3 3B), highest severity first.
     */
    async inBounds({ south, west, north, east }, { limit = 200 } = {}) {
      const { rows } = await pool.query(
        `select ${GROUP_COLUMNS}
           from public.incident_group g
          where g.status = 'VERIFIED'
            and g.centroid_geom && st_makeenvelope($1, $2, $3, $4, 4326)::geography
          order by g.severity_level desc, g.last_reported_at desc
          limit $5`,
        [west, south, east, north, limit + 1],
      );
      return { incidents: rows.slice(0, limit).map(toPublicIncident), truncated: rows.length > limit };
    },

    /** Module 1 integration: verified incidents within the radius of a planned route. */
    async alongRoute(coordinates) {
      if (!coordinates?.length) return [];
      const geom = coordinates.length === 1 ? pointWkt({ lng: coordinates[0][0], lat: coordinates[0][1] }) : lineWkt(coordinates);
      const { rows } = await pool.query(
        `select ${GROUP_COLUMNS}, st_distance(g.centroid_geom, $1::geography) as distance_m
           from public.incident_group g
          where g.status = 'VERIFIED' and st_dwithin(g.centroid_geom, $1::geography, $2)
          order by g.severity_level desc, distance_m
          limit 20`,
        [geom, radiusM],
      );
      return rows.map((r) => ({ ...toPublicIncident(r), distance_from_route_m: Math.round(r.distance_m) }));
    },

    /** Details of one incident: verified ones, or one the person reported. */
    async getPublic(identity, groupId) {
      const { rows } = await pool.query(
        `select ${GROUP_COLUMNS}
           from public.incident_group g
          where g.group_id = $1
            and (g.status in ('VERIFIED', 'RESOLVED')
                 or exists (select 1 from public.incident_report r
                              join public.incident_report_owner o on o.report_id = r.report_id
                             where r.group_id = g.group_id and o.user_id = $2))`,
        [groupId, identity.userId],
      );
      if (!rows[0]) throw notFound('Incident not found');
      return toPublicIncident(rows[0]);
    },

    // ---- Security staff (dashboard) ----------------------------------------

    async listForStaff({ statuses = [S.PENDING, S.VERIFIED], limit = 100 } = {}) {
      const { rows } = await pool.query(
        `select ${GROUP_COLUMNS},
                (select count(distinct o.user_id)::int from public.incident_report r
                   join public.incident_report_owner o on o.report_id = r.report_id
                  where r.group_id = g.group_id) as reporters,
                (select count(*)::int from public.incident_report r
                  where r.group_id = g.group_id and r.photo_url is not null) as photo_count,
                (select r.description from public.incident_report r
                  where r.group_id = g.group_id order by r.submitted_at desc limit 1) as latest_description
           from public.incident_group g
          where g.status = any($1::public.incident_status[])
          order by (g.status = 'PENDING') desc, g.severity_level desc, g.last_reported_at desc
          limit $2`,
        [statuses, limit],
      );
      return rows.map((r) => ({
        ...toPublicIncident(r),
        reporters: r.reporters,
        photo_count: r.photo_count,
        latest_description: r.latest_description,
      }));
    },

    async getForStaff(groupId) {
      const { rows } = await pool.query(
        `select ${GROUP_COLUMNS}, g.staff_note, s.full_name as reviewed_by_name
           from public.incident_group g
           left join public.security_staff s on s.staff_id = g.verified_by
          where g.group_id = $1`,
        [groupId],
      );
      const g = rows[0];
      if (!g) throw notFound('Incident not found');

      // Identity only for named reports; anonymous ones have no user_id here.
      const { rows: reports } = await pool.query(
        `select r.report_id, r.category, r.severity_level, r.description, r.is_anonymous,
                r.photo_url is not null as has_photo, r.submitted_at, r.accuracy_m,
                st_y(r.report_geom::geometry) as lat, st_x(r.report_geom::geometry) as lng,
                u.full_name, u.matric_or_staff_id, u.phone_number, u.email
           from public.incident_report r
           left join public.app_user u on u.user_id = r.user_id
          where r.group_id = $1
          order by r.submitted_at`,
        [groupId],
      );
      const { rows: reporters } = await pool.query(
        `select count(distinct o.user_id)::int as n from public.incident_report r
           join public.incident_report_owner o on o.report_id = r.report_id where r.group_id = $1`,
        [groupId],
      );
      // Open incidents close by, which security may merge into this one.
      const { rows: nearby } = await pool.query(
        `select ${GROUP_COLUMNS}, st_distance(g.centroid_geom, c.centroid_geom) as distance_m
           from public.incident_group g, public.incident_group c
          where c.group_id = $1 and g.group_id <> c.group_id
            and g.status in ('PENDING', 'VERIFIED')
            and st_dwithin(g.centroid_geom, c.centroid_geom, 200)
          order by distance_m
          limit 10`,
        [groupId],
      );

      return {
        ...toPublicIncident(g),
        staff_note: g.staff_note ?? null,
        reviewed_by: g.reviewed_by_name ?? null,
        reporters: reporters[0].n,
        reports: reports.map((r) => ({
          report_id: r.report_id,
          category: r.category,
          severity_level: r.severity_level,
          description: r.description,
          is_anonymous: r.is_anonymous,
          reporter: r.is_anonymous || !r.full_name
            ? null
            : { full_name: r.full_name, matric_or_staff_id: r.matric_or_staff_id, phone_number: r.phone_number, email: r.email },
          has_photo: r.has_photo,
          location: { lat: r.lat, lng: r.lng },
          accuracy_m: r.accuracy_m,
          submitted_at: iso(r.submitted_at),
        })),
        nearby: nearby.map((n) => ({ ...toPublicIncident(n), distance_m: Math.round(n.distance_m) })),
      };
    },

    async photoForStaff(reportId) {
      const { rows } = await pool.query(`select photo_url from public.incident_report where report_id = $1`, [reportId]);
      if (!rows[0]?.photo_url) throw notFound('This report has no photo');
      const photo = await photoStorage.get(rows[0].photo_url);
      if (!photo) throw notFound('The photo could not be found in storage');
      return photo;
    },

    /** Verify, reject (remove a false report) or mark resolved. */
    async review(staffId, groupId, action, { severity_level, public_note, staff_note } = {}) {
      const rule = ACTIONS[action];
      const now = clock();
      const { rows: before } = await pool.query(`select status from public.incident_group where group_id = $1`, [groupId]);
      if (!before[0]) throw notFound('Incident not found');

      const { rows } = await pool.query(
        `update public.incident_group
            set status = $3::public.incident_status,
                verified_by = $2,
                severity_level = coalesce($4::public.incident_severity, severity_level),
                public_note = case when $5::boolean then $6 else public_note end,
                staff_note = case when $7::boolean then $8 else staff_note end,
                reviewed_at = case when $3::public.incident_status in ('VERIFIED', 'REJECTED') then $9 else reviewed_at end,
                resolved_at = case when $3::public.incident_status = 'RESOLVED' then $9 else resolved_at end,
                updated_at = $9
          where group_id = $1 and status = any($10::public.incident_status[])
          returning group_id`,
        [
          groupId,
          staffId,
          rule.to,
          severity_level ?? null,
          public_note !== undefined,
          public_note ?? null,
          staff_note !== undefined,
          staff_note ?? null,
          now,
          rule.from,
        ],
      );
      if (!rows[0]) {
        throw conflict('INVALID_TRANSITION', `An incident that is ${before[0].status.toLowerCase()} cannot be ${action === 'verify' ? 'verified' : `${action}d`}`);
      }

      const group = await loadGroup(pool, groupId);
      const wasOnMap = before[0].status === S.VERIFIED;
      await announce(group, {
        statusChanged: before[0].status !== group.status,
        mapChanged: wasOnMap || group.status === S.VERIFIED,
      });
      return this.getForStaff(groupId);
    },

    /** Group duplicate reports: move every report of `sourceId` into `targetId`. */
    async merge(staffId, sourceId, targetId) {
      if (sourceId === targetId) throw conflict('INVALID_MERGE', 'Choose a different incident to merge with');
      const now = clock();
      const result = await withTransaction(pool, async (db) => {
        const { rows } = await db.query(
          `select group_id, status from public.incident_group where group_id = any($1::uuid[]) order by group_id for update`,
          [[sourceId, targetId]],
        );
        const source = rows.find((r) => r.group_id === sourceId);
        const target = rows.find((r) => r.group_id === targetId);
        if (!source || !target) throw notFound('Incident not found');
        const open = [S.PENDING, S.VERIFIED];
        if (!open.includes(source.status) || !open.includes(target.status)) {
          throw conflict('INVALID_MERGE', 'Only pending or verified incidents can be merged');
        }
        await db.query(`update public.incident_report set group_id = $2 where group_id = $1`, [sourceId, targetId]);
        await db.query(
          `update public.incident_group g
              set report_count = s.n,
                  centroid_geom = s.centroid,
                  severity_level = s.severity,
                  last_reported_at = s.last_at,
                  created_at = least(g.created_at, s.first_at),
                  updated_at = $2,
                  staff_note = coalesce(g.staff_note, '') ||
                               case when g.staff_note is null then '' else E'\\n' end ||
                               'Merged ' || (s.n - g.report_count) || ' report(s) from another incident'
             from (select count(*)::int as n,
                          st_centroid(st_collect(report_geom::geometry))::geography as centroid,
                          max(severity_level) as severity,
                          max(submitted_at) as last_at,
                          min(submitted_at) as first_at
                     from public.incident_report where group_id = $1) s
            where g.group_id = $1`,
          [targetId, now],
        );
        await db.query(`delete from public.incident_group where group_id = $1`, [sourceId]);
        return { sourceWasVerified: source.status === S.VERIFIED, statusDiffers: source.status !== target.status };
      });

      const group = await loadGroup(pool, targetId);
      publisher.incidentForStaff({ group_id: sourceId, merged_into: targetId, status: 'MERGED' });
      await announce(group, {
        statusChanged: result.statusDiffers,
        mapChanged: result.sourceWasVerified || group.status === S.VERIFIED,
      });
      return this.getForStaff(targetId);
    },
  };
}
