import { randomBytes } from 'node:crypto';
import { OPEN_TRIP_STATUSES, TRIP_STATUS } from '@safewalk/shared';
import { withTransaction } from '../../db/pool.js';
import { badRequest, conflict, notFound } from '../../lib/errors.js';
import { lineWkt, pointWkt } from '../../lib/geo.js';
import { safeConfirmedMessage, trackingLinkMessage } from '../notifications/messages.js';
import { InvalidTransitionError, TRANSITIONS, TRIP_EVENTS, nextTripState } from './tripStateMachine.js';
import { TRIP_SELECT, toTripDto } from './tripQueries.js';

// Columns a state transition is allowed to write.
const UPDATABLE = new Set([
  'status', 'grace_expires_at', 'escalated_at', 'eta_deadline', 'extension_count',
  'ended_at', 'end_reason', 'share_expires_at',
]);

/** 256-bit random, URL-safe token for the trusted-contact tracking link. */
export const generateShareToken = () => randomBytes(32).toString('base64url');

/**
 * Apply a state-machine change with a conditional UPDATE. Returns the updated
 * row, or null if the trip was no longer in one of the `from` states (someone
 * else - usually the watchdog - changed it first).
 */
export async function applyTransition(db, tripId, event, changes) {
  const entries = Object.entries(changes).filter(([k]) => UPDATABLE.has(k));
  const sets = entries.map(([k], i) => `${k} = $${i + 3}`);
  const { rows } = await db.query(
    `update public.trip set ${sets.join(', ')}
      where trip_id = $1 and status = any($2::public.trip_status[])
      returning trip_id`,
    [tripId, TRANSITIONS[event].from, ...entries.map(([, v]) => v)],
  );
  return rows[0] ?? null;
}

export function createTripService({ pool, config, routing, publisher, dispatcher, logger, clock = () => new Date() }) {
  const dtoOptions = { trackingPageUrl: config.TRACKING_PAGE_URL };

  async function loadTrip(db, tripId) {
    const { rows } = await db.query(`${TRIP_SELECT} where t.trip_id = $1`, [tripId]);
    return rows[0] ?? null;
  }

  async function loadOwnTrip(userId, tripId) {
    const trip = await loadTrip(pool, tripId);
    // 404 rather than 403 so trip ids of other users cannot be probed.
    if (!trip || trip.user_id !== userId) throw notFound('Trip not found');
    return trip;
  }

  async function tripContacts(db, tripId) {
    const { rows } = await db.query(
      `select c.contact_id, c.contact_name, c.phone_number, c.telegram_chat_id, c.email
         from public.trip_trusted_contact tc
         join public.trusted_contact c on c.contact_id = tc.contact_id
        where tc.trip_id = $1`,
      [tripId],
    );
    return rows;
  }

  async function userProfile(db, userId) {
    const { rows } = await db.query(
      'select user_id, full_name, matric_or_staff_id, phone_number, email, device_fcm_token from public.app_user where user_id = $1',
      [userId],
    );
    return rows[0];
  }

  return {
    loadTrip,
    tripContacts,
    userProfile,

    /** Start a tracked journey (Module 1, Feature 1 and 2). */
    async startTrip(identity, input) {
      const now = clock();
      const contactIds = [...new Set(input.contact_ids)];
      const { rows: contacts } = await pool.query(
        `select contact_id, contact_name, phone_number, telegram_chat_id, email
           from public.trusted_contact where user_id = $1 and contact_id = any($2::uuid[])`,
        [identity.userId, contactIds],
      );
      if (contacts.length !== contactIds.length) {
        throw badRequest('One or more selected trusted contacts do not exist');
      }

      // The ETA is always computed on the server; the client's estimate is never trusted.
      const route = await routing.walkingRoute(input.origin, input.destination);
      const etaSeconds = config.devEtaOverrideSeconds ?? route.duration_s + config.ETA_BUFFER_SECONDS;
      const etaDeadline = new Date(now.getTime() + etaSeconds * 1000);
      const shareToken = generateShareToken();

      let tripId;
      try {
        tripId = await withTransaction(pool, async (db) => {
          const { rows } = await db.query(
            `insert into public.trip
               (user_id, origin_geom, dest_geom, route_line, eta_deadline, last_heartbeat_at, status,
                share_token, started_at, destination_label, route_distance_m, route_duration_s, route_source)
             values ($1, $2, $3, $4, $5, $6, 'ACTIVE', $7, $6, $8, $9, $10, $11)
             returning trip_id`,
            [
              identity.userId, pointWkt(input.origin), pointWkt(input.destination),
              route.geometry.coordinates.length >= 2 ? lineWkt(route.geometry.coordinates) : null,
              etaDeadline, now, shareToken, input.destination_label ?? null,
              route.distance_m, route.duration_s, route.source,
            ],
          );
          const id = rows[0].trip_id;
          await db.query(
            `insert into public.trip_trusted_contact (trip_id, contact_id)
             select $1, unnest($2::uuid[])`,
            [id, contactIds],
          );
          // The starting point is the first entry of the route history.
          await db.query(
            `insert into public.location_log (trip_id, coordinates, is_heartbeat, recorded_at, battery_level, accuracy_m)
             values ($1, $2, false, $3, $4, $5)`,
            [id, pointWkt(input.origin), now, input.battery_level ?? null, input.accuracy_m ?? null],
          );
          return id;
        });
      } catch (err) {
        if (err.code === '23505' && err.constraint === 'trip_one_open_per_user') {
          throw conflict('TRIP_ALREADY_OPEN', 'You already have a journey in progress. Finish it before starting another.');
        }
        throw err;
      }

      const trip = await loadTrip(pool, tripId);
      publisher.tripStatus(trip);
      const dto = toTripDto(trip, { ...dtoOptions, includeShareLink: true });

      const profile = await userProfile(pool, identity.userId);
      const linkDelivery = await dispatcher.toContacts(
        contacts,
        trackingLinkMessage({
          userName: profile.full_name,
          destinationLabel: trip.destination_label,
          etaDeadline: trip.eta_deadline,
          trackingUrl: dto.tracking_url,
        }),
        { trip_id: tripId, kind: 'tracking_link' },
      );
      logger.info({ trip_id: tripId, eta_seconds: etaSeconds, route_source: route.source }, 'trip started');
      return { ...dto, contacts: contacts.map(({ contact_id, contact_name }) => ({ contact_id, contact_name })), link_delivery: linkDelivery };
    },

    async getOpenTrip(identity) {
      const { rows } = await pool.query(
        `${TRIP_SELECT} where t.user_id = $1 and t.status = any($2::public.trip_status[])`,
        [identity.userId, OPEN_TRIP_STATUSES],
      );
      return rows[0] ? toTripDto(rows[0], { ...dtoOptions, includeShareLink: true }) : null;
    },

    async getTrip(identity, tripId) {
      const trip = await loadOwnTrip(identity.userId, tripId);
      const dto = toTripDto(trip, { ...dtoOptions, includeShareLink: true });
      const contacts = await tripContacts(pool, tripId);
      return { ...dto, contacts: contacts.map(({ contact_id, contact_name }) => ({ contact_id, contact_name })) };
    },

    /** Journey history, newest first, keyset-paginated by started_at. */
    async listTrips(identity, { limit, before }) {
      const { rows } = await pool.query(
        `${TRIP_SELECT}
          where t.user_id = $1 and ($2::timestamptz is null or t.started_at < $2)
          order by t.started_at desc limit $3`,
        [identity.userId, before ?? null, limit],
      );
      return rows.map((r) => toTripDto(r, dtoOptions));
    },

    /** EXTEND, ARRIVE, CONFIRM_SAFE or CANCEL requested by the trip owner. */
    async applyUserEvent(identity, tripId, event, { extendMinutes } = {}) {
      const trip = await loadOwnTrip(identity.userId, tripId);
      let changes;
      try {
        changes = nextTripState(trip, event, {
          now: clock(),
          graceSeconds: config.GRACE_PERIOD_SECONDS,
          extendSeconds: (extendMinutes ?? 0) * 60,
          linkTtlMinutes: config.TRACKING_LINK_TTL_AFTER_END_MINUTES,
          maxExtensions: config.MAX_TRIP_EXTENSIONS,
        });
      } catch (err) {
        if (err instanceof InvalidTransitionError) throw conflict('INVALID_TRIP_STATE', err.message);
        throw err;
      }
      const updated = await applyTransition(pool, tripId, event, changes);
      if (!updated) {
        throw conflict('INVALID_TRIP_STATE', 'The journey changed state at the same moment. Refresh and try again.');
      }
      const fresh = await loadTrip(pool, tripId);
      publisher.tripStatus(fresh);
      logger.info({ trip_id: tripId, event, from: trip.status, to: fresh.status }, 'trip transition');

      // Contacts were told about an emergency, so tell them it is over.
      if (event === TRIP_EVENTS.CONFIRM_SAFE && trip.status === TRIP_STATUS.ESCALATED) {
        const [contacts, profile] = await Promise.all([tripContacts(pool, tripId), userProfile(pool, trip.user_id)]);
        dispatcher
          .toContacts(contacts, safeConfirmedMessage({ userName: profile.full_name }), { trip_id: tripId, kind: 'safe_confirmed' })
          .catch((err) => logger.error({ err }, 'safe-confirmed notification failed'));
      }
      return toTripDto(fresh, { ...dtoOptions, includeShareLink: true });
    },

    /**
     * Store GPS samples / heartbeats from the device (socket or HTTP batch).
     * Duplicates (same device timestamp) are ignored; samples older than the
     * newest stored one are kept in the history but not broadcast as "current".
     */
    async recordLocations(identity, tripId, samples) {
      const trip = await loadOwnTrip(identity.userId, tripId);
      if (!OPEN_TRIP_STATUSES.includes(trip.status)) {
        throw conflict('TRIP_NOT_ACTIVE', 'This journey has ended');
      }
      const now = clock();
      const maxFuture = now.getTime() + 2 * 60 * 1000;
      const valid = samples.filter((s) => {
        const t = new Date(s.recorded_at).getTime();
        return t <= maxFuture && t >= new Date(trip.started_at).getTime() - 60 * 1000;
      });
      if (valid.length === 0) throw badRequest('No location samples within the journey time window');

      const { rows: inserted } = await pool.query(
        `insert into public.location_log (trip_id, coordinates, battery_level, is_heartbeat, recorded_at, accuracy_m)
         select $1, st_setsrid(st_makepoint(s.lng, s.lat), 4326)::geography, s.battery_level, s.is_heartbeat, s.recorded_at, s.accuracy_m
           from jsonb_to_recordset($2::jsonb)
                as s(lat float8, lng float8, battery_level int, is_heartbeat bool, recorded_at timestamptz, accuracy_m real)
         on conflict (trip_id, recorded_at) do nothing
         returning recorded_at`,
        [tripId, JSON.stringify(valid.map((s) => ({ ...s, is_heartbeat: Boolean(s.is_heartbeat) })))],
      );

      // The heartbeat is the time the server last heard from the device.
      const { rows: hb } = await pool.query(
        `update public.trip t set last_heartbeat_at = $2, signal_lost_at = null
           from (select signal_lost_at as was_lost from public.trip where trip_id = $1) prev
          where t.trip_id = $1 returning prev.was_lost`,
        [tripId, now],
      );
      if (hb[0]?.was_lost) publisher.signal(trip, { lost: false, since: null });

      const newest = valid.reduce((a, b) => (new Date(a.recorded_at) > new Date(b.recorded_at) ? a : b));
      const previous = trip.last_location ? new Date(trip.last_location.recorded_at).getTime() : 0;
      const isFresh = new Date(newest.recorded_at).getTime() > previous;
      if (isFresh && inserted.length > 0) {
        publisher.position(trip, {
          lat: newest.lat,
          lng: newest.lng,
          recorded_at: new Date(newest.recorded_at).toISOString(),
          battery_level: newest.battery_level ?? null,
          accuracy_m: newest.accuracy_m ?? null,
        });
      }
      return { accepted: inserted.length, duplicates: valid.length - inserted.length, rejected: samples.length - valid.length };
    },
  };
}

