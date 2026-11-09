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
  static const incidentStatus = 'incident:status';
  static const incidentMap = 'incident:map';
  static const authExpired = 'auth:expired';
}

/// Module 3 incident reports (see docs/PLAN.md A20, A21).
class IncidentCategory {
  const IncidentCategory._();
  static const all = [
    'SUSPICIOUS_ACTIVITY',
    'HARASSMENT',
    'THEFT',
    'BROKEN_LIGHTING',
    'STRAY_ANIMAL',
    'UNSAFE_PATH',
    'OTHER',
  ];
}

class IncidentSeverity {
  const IncidentSeverity._();
  static const low = 'LOW';
  static const medium = 'MEDIUM';
  static const high = 'HIGH';
  static const all = [low, medium, high];
}

class IncidentStatus {
  const IncidentStatus._();
  static const pending = 'PENDING';
  static const verified = 'VERIFIED';
  static const rejected = 'REJECTED';
  static const resolved = 'RESOLVED';
}

/// Proposal Module 3: 3 or more people, within 50 m, over 30 minutes.
const autoVerifyReporters = 3;
const autoVerifyRadiusM = 50;
const autoVerifyWindowMinutes = 30;

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
