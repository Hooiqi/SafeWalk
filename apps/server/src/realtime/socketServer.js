import { Server } from 'socket.io';
import { z } from 'zod';
import { SOCKET_EVENTS as E } from '@safewalk/shared';
import { resolveIdentity } from '../auth/identity.js';
import { HttpError } from '../lib/errors.js';
import { locationSampleSchema } from '../modules/trips/tripRoutes.js';
import { rooms } from './publisher.js';

const locationEventSchema = z.object({ trip_id: z.uuid(), sample: locationSampleSchema }).strict();
const MAX_TIMER_MS = 2_147_000_000; // setTimeout limit

/**
 * Socket.io server (proposal 5.2.3 2C). Three kinds of client connect:
 *   - app users (Supabase JWT)      -> room user:<id>; may stream their own trip GPS
 *   - security staff (Supabase JWT) -> room staff
 *   - trusted contacts (share token) -> room trip:<id> for exactly one trip
 * Rooms are assigned by the server after authentication; there is no
 * client-side "join room" event, so nobody can subscribe to a trip or the
 * staff channel they are not entitled to.
 */
export function attachSocketServer(httpServer, deps) {
  const { config, pool, verifyToken, trackingService, tripService, publisher, logger } = deps;
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
        const trip = await trackingService.resolveToken(shareToken);
        socket.data.viewerTripId = trip.trip_id;
        socket.data.expiresAt = trip.share_expires_at ? new Date(trip.share_expires_at).getTime() : null;
        return next();
      }
      next(new Error('UNAUTHORIZED'));
    } catch (err) {
      next(new Error(err instanceof HttpError ? err.code : 'UNAUTHORIZED'));
    }
  });

  io.on('connection', (socket) => {
    const { identity, viewerTripId, expiresAt } = socket.data;
    if (identity?.isAppUser) socket.join(rooms.user(identity.userId));
    if (identity?.isStaff) socket.join(rooms.staff);
    if (viewerTripId) socket.join(rooms.tripViewers(viewerTripId));

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
  });

  publisher.attach(io);
  return io;
}
