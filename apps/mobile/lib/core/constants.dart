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
  static const tripStatus = 'trip:status';
  static const tripGracePrompt = 'trip:grace_prompt';
  static const tripSignal = 'trip:signal';
  static const authExpired = 'auth:expired';
}

/// Interval of the device heartbeat sent during a journey. The server marks
/// the signal as lost after HEARTBEAT_STALE_SECONDS (default 60 s).
const heartbeatInterval = Duration(seconds: 20);

/// Official emergency number in Malaysia (proposal Module 2).
const nationalEmergencyNumber = '999';
