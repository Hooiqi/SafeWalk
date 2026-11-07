// Mirrors packages/shared/src/index.js. Change both together.

class TripStatus {
  const TripStatus._();
  static const active = 'ACTIVE';
  static const gracePrompt = 'GRACE_PROMPT';
  static const escalated = 'ESCALATED';
  static const completed = 'COMPLETED';
  static const cancelled = 'CANCELLED';

  static const open = {active, gracePrompt, escalated};
}

class SocketEvents {
  const SocketEvents._();
  static const tripLocation = 'trip:location';
  static const tripHeartbeat = 'trip:heartbeat';
  static const sosLocation = 'sos:location';
  static const tripStatus = 'trip:status';
  static const tripGracePrompt = 'trip:grace_prompt';
  static const tripSignal = 'trip:signal';
  static const alertStatus = 'alert:status';
  static const authExpired = 'auth:expired';
}

/// Interval of the device heartbeat sent during a journey. The server marks
/// the signal as lost after HEARTBEAT_STALE_SECONDS (default 60 s).
const heartbeatInterval = Duration(seconds: 20);

/// Official emergency number in Malaysia (proposal Module 2).
const nationalEmergencyNumber = '999';

/// How long the SOS button must be held (proposal Diagram 12.2: about 3 s).
const sosHoldDuration = Duration(seconds: 3);

/// Security response workflow (proposal Module 4), shown to the person who raised the alert.
class AlertStatus {
  const AlertStatus._();
  static const newAlert = 'NEW';
  static const received = 'RECEIVED';
  static const onTheWay = 'ON_THE_WAY';
  static const arrived = 'ARRIVED';
  static const resolved = 'RESOLVED';

  static String describe(String status) => switch (status) {
        newAlert => 'Waiting for USM Security to respond',
        received => 'USM Security has received your alert',
        onTheWay => 'USM Security is on the way',
        arrived => 'USM Security has arrived',
        resolved => 'USM Security has resolved your alert',
        _ => status,
      };
}
