import cron from 'node-cron';
import { ANNOUNCEMENT_PRIORITY as P } from '@safewalk/shared';
import { badRequest, conflict, notFound } from '../../lib/errors.js';

const iso = (d) => (d ? new Date(d).toISOString() : null);
const PUSH_BATCH = 50;

const COLUMNS = `
  a.announce_id, a.title, a.message_body, a.priority, a.published_at, a.expires_at,
  a.withdrawn_at, a.announced_at, a.push_summary, a.created_at, a.updated_at,
  s.full_name as staff_name, w.full_name as withdrawn_by_name`;
const FROM = `
  from public.announcement a
  left join public.security_staff s on s.staff_id = a.staff_id
  left join public.security_staff w on w.staff_id = a.withdrawn_by`;

/** Where an announcement is in its life, at time `now`. */
export function announcementState(row, now) {
  const t = now.getTime();
  if (row.withdrawn_at) return 'WITHDRAWN';
  if (new Date(row.published_at).getTime() > t) return 'SCHEDULED';
  if (row.expires_at && new Date(row.expires_at).getTime() <= t) return 'EXPIRED';
  return 'LIVE';
}

/** What app users see. No staff names. */
export function toPublicAnnouncement(row) {
  return {
    announce_id: row.announce_id,
    title: row.title,
    message_body: row.message_body,
    priority: row.priority,
    published_at: iso(row.published_at),
    expires_at: iso(row.expires_at),
    updated_at: iso(row.updated_at),
  };
}

function toStaffAnnouncement(row, now) {
  return {
    ...toPublicAnnouncement(row),
    state: announcementState(row, now),
    staff_name: row.staff_name ?? null,
    withdrawn_at: iso(row.withdrawn_at),
    withdrawn_by_name: row.withdrawn_by_name ?? null,
    announced_at: iso(row.announced_at),
    push_summary: row.push_summary ?? null,
    created_at: iso(row.created_at),
  };
}

export function announcementPushMessage(row) {
  const body = row.message_body.length > 180 ? `${row.message_body.slice(0, 177)}...` : row.message_body;
  return {
    subject: `USM Security: ${row.title}`,
    text: body,
    data: { type: 'ANNOUNCEMENT', announce_id: row.announce_id },
  };
}

/**
 * Module 4: security announcements (proposal objective 4, use case
 * "Publish safety announcement"). Staff create, schedule, edit and withdraw
 * them; every app user sees live ones on the home screen. When one goes live
 * the app is told over Socket.io, and URGENT ones are also pushed (FCM) to
 * every phone that registered for notifications.
 */
export function createAnnouncementService({ pool, publisher, dispatcher, logger, config, clock = () => new Date() }) {
  async function load(db, id) {
    const { rows } = await db.query(`select ${COLUMNS} ${FROM} where a.announce_id = $1`, [id]);
    return rows[0] ?? null;
  }

  /** Push an URGENT announcement to every app user with a registered phone. */
  async function pushToEveryone(row) {
    const { rows: users } = await pool.query(
      `select user_id, device_fcm_token from public.app_user where device_fcm_token is not null`,
    );
    const message = announcementPushMessage(row);
    const summary = { recipients: users.length, sent: 0, failed: 0, skipped: 0 };
    for (let i = 0; i < users.length; i += PUSH_BATCH) {
      const results = await Promise.all(
        users.slice(i, i + PUSH_BATCH).map((u) => dispatcher.toUser(u, message, { announce_id: row.announce_id })),
      );
      for (const r of results) if (r) summary[r.status] = (summary[r.status] ?? 0) + 1;
    }
    await pool.query('update public.announcement set push_summary = $2 where announce_id = $1', [row.announce_id, summary]);
    logger.info({ announce_id: row.announce_id, ...summary }, 'urgent announcement pushed');
    return summary;
  }

  /**
   * Announce everything that is due and not announced yet. The conditional
   * UPDATE claims each row once, so overlapping ticks or two server instances
   * never announce (or push) twice.
   */
  async function announceDue() {
    const now = clock();
    const { rows } = await pool.query(
      `update public.announcement set announced_at = $1
        where announced_at is null and withdrawn_at is null and published_at <= $1
          and (expires_at is null or expires_at > $1)
        returning announce_id`,
      [now],
    );
    for (const { announce_id } of rows) {
      const row = await load(pool, announce_id);
      publisher.announcementLive(toPublicAnnouncement(row));
      if (row.priority === P.URGENT) await pushToEveryone(row);
    }
    return rows.length;
  }

  async function listLive({ limit = 20 } = {}) {
    const { rows } = await pool.query(
      `select ${COLUMNS} ${FROM}
        where a.withdrawn_at is null and a.published_at <= $1 and (a.expires_at is null or a.expires_at > $1)
        order by (a.priority = 'URGENT') desc, a.published_at desc
        limit $2`,
      [clock(), limit],
    );
    return rows.map(toPublicAnnouncement);
  }

  async function getLive(id) {
    const row = await load(pool, id);
    if (!row || announcementState(row, clock()) !== 'LIVE') throw notFound('Announcement not found');
    return toPublicAnnouncement(row);
  }

  async function listForStaff({ state, limit = 100 } = {}) {
    const now = clock();
    const { rows } = await pool.query(`select ${COLUMNS} ${FROM} order by a.published_at desc limit 500`);
    return rows
      .map((r) => toStaffAnnouncement(r, now))
      .filter((a) => !state || a.state === state)
      .slice(0, limit);
  }

  async function getForStaff(id) {
    const row = await load(pool, id);
    if (!row) throw notFound('Announcement not found');
    return toStaffAnnouncement(row, clock());
  }

  function checkTimes(publishedAt, expiresAt, now) {
    if (expiresAt && expiresAt <= (publishedAt ?? now)) throw badRequest('The end time must be after the start time');
    if (expiresAt && expiresAt <= now) throw badRequest('The end time has already passed');
  }

  async function create(staffId, body) {
    const now = clock();
    const publishedAt = body.published_at ? new Date(body.published_at) : now;
    const expiresAt = body.expires_at ? new Date(body.expires_at) : null;
    checkTimes(publishedAt, expiresAt, now);
    // A start time in the past (e.g. a slow clock on the dashboard PC) means "now".
    const start = publishedAt < now ? now : publishedAt;
    const { rows } = await pool.query(
      `insert into public.announcement (staff_id, title, message_body, priority, published_at, expires_at)
       values ($1, $2, $3, $4, $5, $6) returning announce_id`,
      [staffId, body.title, body.message_body, body.priority, start, expiresAt],
    );
    const id = rows[0].announce_id;
    logger.info({ announce_id: id, priority: body.priority, scheduled: start > now }, 'announcement created');
    await announceDue();
    return getForStaff(id);
  }

  async function update(staffId, id, body) {
    const now = clock();
    const current = await load(pool, id);
    if (!current) throw notFound('Announcement not found');
    const state = announcementState(current, now);
    if (state === 'WITHDRAWN') throw conflict('ANNOUNCEMENT_WITHDRAWN', 'A withdrawn announcement cannot be edited');

    const next = {
      title: body.title ?? current.title,
      message_body: body.message_body ?? current.message_body,
      priority: body.priority ?? current.priority,
      published_at: current.published_at,
      expires_at: body.expires_at === undefined ? current.expires_at : body.expires_at ? new Date(body.expires_at) : null,
    };
    if (body.published_at !== undefined) {
      // Only a scheduled announcement can be moved; a live one already went out.
      if (state !== 'SCHEDULED') throw conflict('ALREADY_PUBLISHED', 'This announcement is already published');
      const p = new Date(body.published_at);
      next.published_at = p < now ? now : p;
    }
    checkTimes(new Date(next.published_at), next.expires_at && new Date(next.expires_at), now);

    // Raising a live announcement to URGENT pushes it once (if it was never pushed).
    const pushNow = state === 'LIVE' && next.priority === P.URGENT && !current.push_summary;
    await pool.query(
      `update public.announcement
          set title = $2, message_body = $3, priority = $4, published_at = $5, expires_at = $6
        where announce_id = $1`,
      [id, next.title, next.message_body, next.priority, next.published_at, next.expires_at],
    );
    const row = await load(pool, id);
    if (current.announced_at) publisher.announcementUpdated(toPublicAnnouncement(row), announcementState(row, clock()));
    if (pushNow) await pushToEveryone(row);
    logger.info({ announce_id: id, staff_id: staffId }, 'announcement edited');
    await announceDue();
    return getForStaff(id);
  }

  async function withdraw(staffId, id) {
    const { rows } = await pool.query(
      `update public.announcement set withdrawn_at = $3, withdrawn_by = $2
        where announce_id = $1 and withdrawn_at is null
        returning announce_id, announced_at`,
      [id, staffId, clock()],
    );
    if (!rows[0]) {
      if (!(await load(pool, id))) throw notFound('Announcement not found');
      throw conflict('ANNOUNCEMENT_WITHDRAWN', 'This announcement was already withdrawn');
    }
    const row = await load(pool, id);
    if (rows[0].announced_at) publisher.announcementUpdated(toPublicAnnouncement(row), 'WITHDRAWN');
    logger.info({ announce_id: id, staff_id: staffId }, 'announcement withdrawn');
    return getForStaff(id);
  }

  let task = null;
  let running = false;
  async function tick() {
    if (running) return null;
    running = true;
    try {
      return await announceDue();
    } catch (err) {
      logger.error({ err }, 'announcement tick failed');
      return null;
    } finally {
      running = false;
    }
  }

  return {
    listLive,
    getLive,
    listForStaff,
    getForStaff,
    create,
    update,
    withdraw,
    announceDue,
    tick,
    start() {
      task = cron.schedule(config.WATCHDOG_CRON, tick, { name: 'announcements' });
    },
    stop() {
      task?.stop();
    },
  };
}
