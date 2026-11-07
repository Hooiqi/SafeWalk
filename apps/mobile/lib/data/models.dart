import 'package:latlong2/latlong.dart';

import '../core/constants.dart';

DateTime? _date(Object? v) => v == null ? null : DateTime.parse(v as String);
LatLng _point(Map<String, dynamic> m) => LatLng((m['lat'] as num).toDouble(), (m['lng'] as num).toDouble());
Map<String, double> pointJson(LatLng p) => {'lat': p.latitude, 'lng': p.longitude};

List<LatLng> _lineString(Object? geometry) {
  if (geometry is! Map || geometry['coordinates'] is! List) return const [];
  return (geometry['coordinates'] as List)
      .map((c) => LatLng(((c as List)[1] as num).toDouble(), (c[0] as num).toDouble()))
      .toList();
}

class TrustedContact {
  const TrustedContact({required this.id, required this.name, this.phoneNumber, this.telegramChatId, this.email});

  factory TrustedContact.fromJson(Map<String, dynamic> j) => TrustedContact(
        id: j['contact_id'] as String,
        name: j['contact_name'] as String,
        phoneNumber: j['phone_number'] as String?,
        telegramChatId: j['telegram_chat_id'] as String?,
        email: j['email'] as String?,
      );

  final String id;
  final String name;
  final String? phoneNumber;
  final String? telegramChatId;
  final String? email;

  /// Which alert channels this contact can receive, for display.
  List<String> get channels => [
        if (phoneNumber != null) 'SMS',
        if (telegramChatId != null) 'Telegram',
        if (email != null) 'Email',
      ];
}

class RoutePreview {
  const RoutePreview({
    required this.points,
    required this.distanceM,
    required this.duration,
    required this.isEstimate,
    this.steps = const [],
  });

  factory RoutePreview.fromJson(Map<String, dynamic> j) => RoutePreview(
        points: _lineString(j['geometry']),
        distanceM: (j['distance_m'] as num).toInt(),
        duration: Duration(seconds: (j['duration_s'] as num).toInt()),
        isEstimate: j['source'] == 'STRAIGHT_LINE_ESTIMATE',
        steps: [
          for (final s in (j['steps'] as List? ?? const []))
            RouteStep((s as Map)['instruction'] as String, ((s['distance_m'] as num?) ?? 0).toInt()),
        ],
      );

  final List<LatLng> points;
  final int distanceM;
  final Duration duration;

  /// Turn-by-turn walking directions (empty for straight-line estimates).
  final List<RouteStep> steps;

  /// True when OSRM was unreachable and the server used a straight-line estimate.
  final bool isEstimate;
}

class LocationFix {
  const LocationFix({required this.position, required this.recordedAt, this.batteryLevel});

  factory LocationFix.fromJson(Map<String, dynamic> j) => LocationFix(
        position: _point(j),
        recordedAt: DateTime.parse(j['recorded_at'] as String),
        batteryLevel: (j['battery_level'] as num?)?.toInt(),
      );

  final LatLng position;
  final DateTime recordedAt;
  final int? batteryLevel;
}

class Trip {
  const Trip({
    required this.id,
    required this.status,
    required this.origin,
    required this.destination,
    required this.route,
    required this.startedAt,
    required this.etaDeadline,
    this.destinationLabel,
    this.distanceM,
    this.routeIsEstimate = false,
    this.graceExpiresAt,
    this.signalLostAt,
    this.escalatedAt,
    this.endedAt,
    this.endReason,
    this.extensionCount = 0,
    this.lastLocation,
    this.trackingUrl,
    this.contactNames = const [],
    this.linkDelivery = const [],
  });

  factory Trip.fromJson(Map<String, dynamic> j) {
    final dest = j['destination'] as Map<String, dynamic>;
    final route = j['route'] as Map<String, dynamic>;
    return Trip(
      id: j['trip_id'] as String,
      status: j['status'] as String,
      origin: _point(j['origin'] as Map<String, dynamic>),
      destination: _point(dest),
      destinationLabel: dest['label'] as String?,
      route: _lineString(route['geometry']),
      distanceM: (route['distance_m'] as num?)?.toInt(),
      routeIsEstimate: route['source'] == 'STRAIGHT_LINE_ESTIMATE',
      startedAt: DateTime.parse(j['started_at'] as String),
      etaDeadline: DateTime.parse(j['eta_deadline'] as String),
      graceExpiresAt: _date(j['grace_expires_at']),
      signalLostAt: _date(j['signal_lost_at']),
      escalatedAt: _date(j['escalated_at']),
      endedAt: _date(j['ended_at']),
      endReason: j['end_reason'] as String?,
      extensionCount: (j['extension_count'] as num?)?.toInt() ?? 0,
      lastLocation: j['last_location'] == null ? null : LocationFix.fromJson(j['last_location'] as Map<String, dynamic>),
      trackingUrl: j['tracking_url'] as String?,
      contactNames: [for (final c in (j['contacts'] as List? ?? const [])) (c as Map)['contact_name'] as String],
      linkDelivery: [for (final d in (j['link_delivery'] as List? ?? const [])) LinkDelivery.fromJson(d as Map<String, dynamic>)],
    );
  }

  final String id;
  final String status;
  final LatLng origin;
  final LatLng destination;
  final String? destinationLabel;
  final List<LatLng> route;
  final int? distanceM;
  final bool routeIsEstimate;
  final DateTime startedAt;
  final DateTime etaDeadline;
  final DateTime? graceExpiresAt;
  final DateTime? signalLostAt;
  final DateTime? escalatedAt;
  final DateTime? endedAt;
  final String? endReason;
  final int extensionCount;
  final LocationFix? lastLocation;
  final String? trackingUrl;
  final List<String> contactNames;
  final List<LinkDelivery> linkDelivery;

  bool get isOpen => TripStatus.open.contains(status);

  /// Applies a `trip:status` socket event.
  Trip withStatusEvent(Map<String, dynamic> e) => Trip(
        id: id,
        status: e['status'] as String? ?? status,
        origin: origin,
        destination: destination,
        destinationLabel: destinationLabel,
        route: route,
        distanceM: distanceM,
        routeIsEstimate: routeIsEstimate,
        startedAt: startedAt,
        etaDeadline: _date(e['eta_deadline']) ?? etaDeadline,
        graceExpiresAt: _date(e['grace_expires_at']),
        signalLostAt: signalLostAt,
        escalatedAt: _date(e['escalated_at']) ?? escalatedAt,
        endedAt: _date(e['ended_at']),
        endReason: e['end_reason'] as String?,
        extensionCount: extensionCount,
        lastLocation: lastLocation,
        trackingUrl: trackingUrl,
        contactNames: contactNames,
        linkDelivery: linkDelivery,
      );
}

/// Result of sending the tracking link to a contact over one channel.
class LinkDelivery {
  const LinkDelivery({required this.channel, required this.recipient, required this.status, this.reason});

  factory LinkDelivery.fromJson(Map<String, dynamic> j) => LinkDelivery(
        channel: j['channel'] as String,
        recipient: j['recipient'] as String,
        status: j['status'] as String,
        reason: j['reason'] as String?,
      );

  final String channel;
  final String recipient;
  final String status; // sent | skipped | failed
  final String? reason;
}

class UserProfile {
  const UserProfile({required this.fullName, required this.email, this.matricOrStaffId, this.phoneNumber});

  factory UserProfile.fromJson(Map<String, dynamic> j) => UserProfile(
        fullName: j['full_name'] as String,
        email: j['email'] as String,
        matricOrStaffId: j['matric_or_staff_id'] as String?,
        phoneNumber: j['phone_number'] as String?,
      );

  final String fullName;
  final String email;
  final String? matricOrStaffId;
  final String? phoneNumber;
}

class RouteStep {
  const RouteStep(this.instruction, this.distanceM);
  final String instruction;
  final int distanceM;
}

// ---- Module 2: safe points --------------------------------------------------

class SafePointCategory {
  const SafePointCategory._();
  static const securityPost = 'SECURITY_POST';
  static const medical = 'MEDICAL';
  static const studyArea = 'STUDY_AREA';
  static const residentialCollege = 'RESIDENTIAL_COLLEGE';
  static const publicBuilding = 'PUBLIC_BUILDING';
  static const policeStation = 'POLICE_STATION';

  static String label(String category) => switch (category) {
        securityPost => 'Security post',
        medical => 'Medical',
        studyArea => 'Study area',
        residentialCollege => 'Residential college',
        publicBuilding => 'Public building',
        policeStation => 'Police station',
        _ => category,
      };
}

class OpeningStatus {
  const OpeningStatus({required this.isOpen, required this.always, this.closesAt, this.opensAt});

  factory OpeningStatus.fromJson(Map<String, dynamic> j) => OpeningStatus(
        isOpen: j['is_open'] as bool,
        always: j['always'] as bool? ?? false,
        closesAt: _date(j['closes_at']),
        opensAt: _date(j['opens_at']),
      );

  final bool isOpen;
  final bool always;
  final DateTime? closesAt;
  final DateTime? opensAt;
}

class WalkingEstimate {
  const WalkingEstimate({required this.distanceM, required this.duration, required this.isEstimate});

  factory WalkingEstimate.fromJson(Map<String, dynamic> j) => WalkingEstimate(
        distanceM: (j['distance_m'] as num).toInt(),
        duration: Duration(seconds: (j['duration_s'] as num).toInt()),
        isEstimate: j['source'] == 'STRAIGHT_LINE_ESTIMATE',
      );

  final int distanceM;
  final Duration duration;
  final bool isEstimate;
}

class SafePoint {
  const SafePoint({
    required this.id,
    required this.name,
    required this.category,
    required this.location,
    required this.operatingHours,
    required this.opening,
    this.locationDescription,
    this.contactPhone,
    this.contactNotes,
    this.notes,
    this.walking,
  });

  factory SafePoint.fromJson(Map<String, dynamic> j) => SafePoint(
        id: j['safe_point_id'] as String,
        name: j['name'] as String,
        category: j['category'] as String,
        location: _point(j['location'] as Map<String, dynamic>),
        locationDescription: j['location_description'] as String?,
        operatingHours: j['operating_hours'] as String,
        opening: OpeningStatus.fromJson(j['opening'] as Map<String, dynamic>),
        contactPhone: j['contact_phone'] as String?,
        contactNotes: j['contact_notes'] as String?,
        notes: j['notes'] as String?,
        walking: j['walking'] == null ? null : WalkingEstimate.fromJson(j['walking'] as Map<String, dynamic>),
      );

  final String id;
  final String name;
  final String category;
  final LatLng location;
  final String? locationDescription;
  final String operatingHours;
  final OpeningStatus opening;
  final String? contactPhone;
  final String? contactNotes;
  final String? notes;

  /// Only present in nearest-safe-point results.
  final WalkingEstimate? walking;
}

// ---- Module 2: SOS ------------------------------------------------------------

class StatusEntry {
  const StatusEntry({required this.newStatus, required this.at, this.staffName, this.note});

  factory StatusEntry.fromJson(Map<String, dynamic> j) => StatusEntry(
        newStatus: j['new_status'] as String,
        at: DateTime.parse(j['updated_at'] as String),
        staffName: j['staff_name'] as String?,
        note: j['note'] as String?,
      );

  final String newStatus;
  final DateTime at;
  final String? staffName;
  final String? note;
}

class SosAlert {
  const SosAlert({
    required this.id,
    required this.triggerType,
    required this.status,
    required this.triggeredAt,
    this.resolvedAt,
    this.userSafeAt,
    this.trackingUrl,
    this.history = const [],
  });

  factory SosAlert.fromJson(Map<String, dynamic> j) => SosAlert(
        id: j['alert_id'] as String,
        triggerType: j['trigger_type'] as String,
        status: j['status'] as String,
        triggeredAt: DateTime.parse(j['triggered_at'] as String),
        resolvedAt: _date(j['resolved_at']),
        userSafeAt: _date(j['user_safe_at']),
        trackingUrl: j['tracking_url'] as String?,
        history: [for (final h in (j['status_history'] as List? ?? const [])) StatusEntry.fromJson(h as Map<String, dynamic>)],
      );

  final String id;
  final String triggerType; // HOLD | SILENT
  final String status; // NEW | RECEIVED | ON_THE_WAY | ARRIVED | RESOLVED
  final DateTime triggeredAt;
  final DateTime? resolvedAt;
  final DateTime? userSafeAt;
  final String? trackingUrl;
  final List<StatusEntry> history;

  bool get isSilent => triggerType == 'SILENT';

  /// Still sharing location: not resolved by security and not marked safe.
  bool get isOpen => status != 'RESOLVED' && userSafeAt == null;

  /// Applies an `alert:status` socket event.
  SosAlert withStatusEvent(Map<String, dynamic> e) {
    final latest = e['latest'] is Map ? StatusEntry.fromJson(Map<String, dynamic>.from(e['latest'] as Map)) : null;
    final duplicate = latest != null && history.any((h) => h.newStatus == latest.newStatus && h.at == latest.at);
    return SosAlert(
      id: id,
      triggerType: triggerType,
      status: e['status'] as String? ?? status,
      triggeredAt: triggeredAt,
      resolvedAt: _date(e['resolved_at']) ?? resolvedAt,
      userSafeAt: _date(e['user_safe_at']) ?? userSafeAt,
      trackingUrl: trackingUrl,
      history: latest == null || duplicate ? history : [...history, latest],
    );
  }
}
