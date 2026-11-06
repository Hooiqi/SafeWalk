import { randomUUID } from 'node:crypto';
import { SOCKET_EVENTS as E, TRIP_STATUS } from '@safewalk/shared';

// Room names. Clients never choose a room: the server joins sockets to rooms
// after authenticating them (see socketServer.js).
export const rooms = {
  user: (userId) => `user:${userId}`,
  tripViewers: (tripId) => `trip:${tripId}`,
  staff: 'staff',
};

/**
 * Emits domain events to Socket.io rooms. Every payload carries an event_id so
 * clients can drop duplicates after a reconnect. Until a Socket.io server is
 * attached (e.g. in unit tests) events are recorded in `sent` instead.
 */
export function createPublisher() {
  let io = null;
  const sent = [];

  function emit(room, event, data) {
    const payload = { event_id: randomUUID(), emitted_at: new Date().toISOString(), ...data };
    if (io) io.to(room).emit(event, payload);
    else sent.push({ room, event, payload });
  }

  // What trusted contacts may see about a trip status change.
  const statusPayload = (trip) => ({
    trip_id: trip.trip_id,
    status: trip.status,
    eta_deadline: trip.eta_deadline,
    grace_expires_at: trip.grace_expires_at,
    ended_at: trip.ended_at,
    end_reason: trip.end_reason,
    escalated_at: trip.escalated_at,
  });

  return {
    sent,
    attach(server) {
      io = server;
    },

    tripStatus(trip) {
      const data = statusPayload(trip);
      emit(rooms.user(trip.user_id), E.TRIP_STATUS, data);
      emit(rooms.tripViewers(trip.trip_id), E.TRIP_STATUS, data);
      if (trip.escalated_at || trip.status === TRIP_STATUS.ESCALATED) emit(rooms.staff, E.TRIP_STATUS, data);
    },

    gracePrompt(trip) {
      emit(rooms.user(trip.user_id), E.TRIP_GRACE_PROMPT, {
        trip_id: trip.trip_id,
        grace_expires_at: trip.grace_expires_at,
      });
    },

    position(trip, sample) {
      const data = { trip_id: trip.trip_id, ...sample };
      emit(rooms.tripViewers(trip.trip_id), E.TRIP_POSITION, data);
      if (trip.status === TRIP_STATUS.ESCALATED) emit(rooms.staff, E.ALERT_POSITION, data);
    },

    signal(trip, { lost, since }) {
      const data = { trip_id: trip.trip_id, signal_lost: lost, signal_lost_at: since };
      emit(rooms.user(trip.user_id), E.TRIP_SIGNAL, data);
      emit(rooms.tripViewers(trip.trip_id), E.TRIP_SIGNAL, data);
      if (trip.status === TRIP_STATUS.ESCALATED) emit(rooms.staff, E.TRIP_SIGNAL, data);
    },

    alertNew(alert) {
      emit(rooms.staff, E.ALERT_NEW, { alert });
    },
  };
}
