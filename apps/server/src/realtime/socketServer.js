import { Server } from 'socket.io';
import { z } from 'zod';
import { SOCKET_EVENTS as E } from '@safewalk/shared';
import { resolveIdentity } from '../auth/identity.js';
import { HttpError } from '../lib/errors.js';
import { locationSampleSchema } from '../modules/trips/tripRoutes.js';
import { rooms } from './publisher.js';

const locationEventSchema = z.object({ trip_id: z.uuid(), sample: locationSampleSchema }).strict();
const sosLocationEventSchema = z.object({ alert_id: z.uuid(), sample: locationSampleSchema }).strict();
const MAX_TIMER_MS = 2_147_000_000; // setTimeout limit

/**
 * Socket.io server (proposal 5.2.3 2C). Three kinds of client connect:
 *   - app users (Supabase JWT)      -> room user:<id>; may stream their own trip GPS
 *   - security staff (Supabase JWT) -> room staff
 *   - trusted contacts (share token) -> room trip:<id> or alert:<id> for exactly one
 *     journey or SOS
 * Rooms are assigned by the server after authentication; there is no
 * client-side "join room" event, so nobody can subscribe to a trip or the
 * staff channel they are not entitled to.
 */
export function attachSocketServer(httpServer, deps) {
  const { config, pool, verifyToken, trackingService, tripService, sosService, publisher, logger } = deps;
  const io = new Server(httpServer, {
    cors: { origin: config.corsOrigins },
    // Recover missed events after short disconnects (e.g. switching networks).
    connectionStateRecovery: { maxDisconnectionDuration: 2 * 60 * 1000 },
  });

  io.use(async (socket, next) => {
    const { token, shareToken } = socket.handshake.auth ?? {};
    try {
      if (typeof token === 'string' && token) {
        const claims = await verifyToken(token);
        const identity = await resolveIdentity(pool, config, claims);
        if (!identity.isAppUser && !identity.isStaff) return next(new Error('FORBIDDEN'));
        socket.data.identity = identity;
        socket.data.expiresAt = claims.expiresAt;
        return next();
      }
      if (typeof shareToken === 'string' && shareToken) {
        const link = await trackingService.resolveToken(shareToken);
        socket.data.viewerRoom = link.kind === 'TRIP' ? rooms.tripViewers(link.id) : rooms.alertViewers(link.id);
        socket.data.expiresAt = link.expiresAt ? new Date(link.expiresAt).getTime() : null;
        return next();
      }
      next(new Error('UNAUTHORIZED'));
    } catch (err) {
      next(new Error(err instanceof HttpError ? err.code : 'UNAUTHORIZED'));
    }
  });

  io.on('connection', (socket) => {
    const { identity, viewerRoom, expiresAt } = socket.data;
    if (identity?.isAppUser) socket.join([rooms.user(identity.userId), rooms.appUsers]);
    if (identity?.isStaff) socket.join(rooms.staff);
    if (viewerRoom) socket.join(viewerRoom);

    // Disconnect when the session token (or tracking link) expires; the
    // client reconnects with a refreshed token.
    if (expiresAt) {
      const ms = Math.min(expiresAt - Date.now(), MAX_TIMER_MS);
      const timer = setTimeout(() => {
        socket.emit(E.AUTH_EXPIRED, {});
        socket.disconnect(true);
      }, Math.max(ms, 0));
      socket.on('disconnect', () => clearTimeout(timer));
    }

    // GPS samples and heartbeats from the owner of an open trip.
    const handleSample = (isHeartbeat) => async (payload, ack) => {
      const reply = typeof ack === 'function' ? ack : () => {};
      if (!identity?.isAppUser) return reply({ ok: false, error: 'FORBIDDEN' });
      const parsed = locationEventSchema.safeParse(payload);
      if (!parsed.success) return reply({ ok: false, error: 'BAD_REQUEST' });
      try {
        const sample = { ...parsed.data.sample, is_heartbeat: isHeartbeat };
        const result = await tripService.recordLocations(identity, parsed.data.trip_id, [sample]);
        reply({ ok: true, ...result });
      } catch (err) {
        if (!(err instanceof HttpError)) logger.error({ err }, 'socket location error');
        reply({ ok: false, error: err instanceof HttpError ? err.code : 'INTERNAL' });
      }
    };
    socket.on(E.TRIP_LOCATION, handleSample(false));
    socket.on(E.TRIP_HEARTBEAT, handleSample(true));

    // GPS during an SOS, from the person who raised it.
    socket.on(E.SOS_LOCATION, async (payload, ack) => {
      const reply = typeof ack === 'function' ? ack : () => {};
      if (!identity?.isAppUser) return reply({ ok: false, error: 'FORBIDDEN' });
      const parsed = sosLocationEventSchema.safeParse(payload);
      if (!parsed.success) return reply({ ok: false, error: 'BAD_REQUEST' });
      try {
        const result = await sosService.recordLocations(identity, parsed.data.alert_id, [parsed.data.sample]);
        reply({ ok: true, ...result });
      } catch (err) {
        if (!(err instanceof HttpError)) logger.error({ err }, 'socket SOS location error');
        reply({ ok: false, error: err instanceof HttpError ? err.code : 'INTERNAL' });
      }
    });
  });

  publisher.attach(io);
  return io;
}
