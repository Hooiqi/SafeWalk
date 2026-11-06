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
  const RoutePreview({required this.points, required this.distanceM, required this.duration, required this.isEstimate});

  factory RoutePreview.fromJson(Map<String, dynamic> j) => RoutePreview(
        points: _lineString(j['geometry']),
        distanceM: (j['distance_m'] as num).toInt(),
        duration: Duration(seconds: (j['duration_s'] as num).toInt()),
        isEstimate: j['source'] == 'STRAIGHT_LINE_ESTIMATE',
      );

  final List<LatLng> points;
  final int distanceM;
  final Duration duration;

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
