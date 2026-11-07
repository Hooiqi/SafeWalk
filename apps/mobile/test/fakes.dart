import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:latlong2/latlong.dart';
import 'package:safewalk/core/api_client.dart';
import 'package:safewalk/data/models.dart';
import 'package:safewalk/data/repositories.dart';
import 'package:safewalk/services/location_service.dart';
import 'package:safewalk/services/realtime_service.dart';

Map<String, dynamic> tripJson({String status = 'ACTIVE', String id = 'trip-1'}) => {
      'trip_id': id,
      'status': status,
      'origin': {'lat': 5.3561, 'lng': 100.3021},
      'destination': {'lat': 5.3592, 'lng': 100.3049, 'label': 'Sample hostel'},
      'route': {
        'geometry': {
          'type': 'LineString',
          'coordinates': [
            [100.3021, 5.3561],
            [100.3049, 5.3592],
          ],
        },
        'distance_m': 600,
        'duration_s': 480,
        'source': 'OSRM',
      },
      'started_at': '2026-11-06T14:00:00.000Z',
      'eta_deadline': '2026-11-06T14:08:00.000Z',
      'grace_expires_at': null,
      'extension_count': 0,
      'last_location': {'lat': 5.3561, 'lng': 100.3021, 'recorded_at': '2026-11-06T14:00:00.000Z', 'battery_level': 80},
      'tracking_url': 'http://localhost:5173/t/abc',
      'contacts': [
        {'contact_id': 'c1', 'contact_name': 'Ali'},
      ],
      'link_delivery': [
        {'channel': 'sms', 'recipient': 'all contacts', 'status': 'skipped', 'reason': 'not configured'},
      ],
    };

class FakeLocation implements LocationSource {
  final controller = StreamController<LocationReading>.broadcast();

  void emit(double lat, double lng, DateTime at) =>
      controller.add(LocationReading(position: LatLng(lat, lng), timestamp: at, accuracyM: 5));

  /// When set, current() fails with this (e.g. no GPS fix).
  Object? currentError;

  @override
  Future<LocationReading> current() async {
    if (currentError != null) throw currentError!;
    return LocationReading(position: const LatLng(5.3561, 100.3021), timestamp: DateTime.utc(2026, 11, 6, 14), accuracyM: 7);
  }
  @override
  Stream<LocationReading> watch() => controller.stream;
  @override
  Future<int?> batteryLevel() async => 55;
}

class FakeRealtime implements RealtimeChannel {
  final _connected = ValueNotifier<bool>(true);
  final events$ = StreamController<RealtimeEvent>.broadcast();
  /// (event, payload) of every successfully sent message.
  final sent = <(String, Map<String, dynamic>)>[];
  String? nextError;

  void setConnected(bool v) => _connected.value = v;
  void push(String name, Map<String, dynamic> data) => events$.add(RealtimeEvent(name, data));

  @override
  ValueListenable<bool> get connected => _connected;
  @override
  Stream<RealtimeEvent> get events => events$.stream;
  @override
  Future<String?> send(String event, Map<String, dynamic> payload) async {
    if (!_connected.value) return 'OFFLINE';
    if (nextError != null) return nextError;
    sent.add((event, payload));
    return null;
  }
}

class FakeTrips extends TripsRepository {
  FakeTrips() : super(ApiClient(tokenProvider: () => null, baseUrl: 'http://unused'));

  Trip? activeTrip;
  final uploads = <List<Map<String, dynamic>>>[];
  final calls = <String>[];

  @override
  Future<Trip?> active() async => activeTrip;
  @override
  Future<void> uploadLocations(String tripId, List<Map<String, dynamic>> samples) async => uploads.add(List.of(samples));
  @override
  Future<Trip> arrive(String tripId) async {
    calls.add('arrive');
    return Trip.fromJson({...tripJson(status: 'COMPLETED'), 'ended_at': '2026-11-06T14:07:00.000Z', 'end_reason': 'ARRIVED'});
  }
  @override
  Future<Trip> extend(String tripId, int minutes) async {
    calls.add('extend:$minutes');
    return Trip.fromJson({...tripJson(), 'eta_deadline': '2026-11-06T14:18:00.000Z', 'extension_count': 1});
  }
}

Map<String, dynamic> sosJson({String status = 'NEW', String id = 'alert-1', String trigger = 'HOLD', String? userSafeAt}) => {
      'alert_id': id,
      'trigger_type': trigger,
      'status': status,
      'triggered_at': '2026-11-07T14:30:00.000Z',
      'resolved_at': status == 'RESOLVED' ? '2026-11-07T14:50:00.000Z' : null,
      'user_safe_at': userSafeAt,
      'tracking_url': 'http://localhost:5173/t/sos-token',
      'status_history': [
        {'previous_status': null, 'new_status': 'NEW', 'updated_at': '2026-11-07T14:30:00.000Z', 'note': null, 'staff_name': null},
      ],
    };

/// SOS API fake: records every create call; can fail the first N calls.
class FakeSos extends SosRepository {
  FakeSos() : super(ApiClient(tokenProvider: () => null, baseUrl: 'http://unused'));

  final creates = <Map<String, Object?>>[];
  final uploads = <List<Map<String, dynamic>>>[];
  int failNetworkTimes = 0;
  ApiException? failWith;
  SosAlert? activeAlert;

  @override
  Future<SosAlert> create({
    required bool silent,
    required String requestId,
    LatLng? location,
    double? accuracyM,
    int? batteryLevel,
    DateTime? recordedAt,
  }) async {
    creates.add({'silent': silent, 'requestId': requestId, 'location': location, 'battery': batteryLevel});
    if (failWith != null) throw failWith!;
    if (failNetworkTimes > 0) {
      failNetworkTimes--;
      throw ApiException(0, 'NETWORK', 'offline');
    }
    return SosAlert.fromJson(sosJson(trigger: silent ? 'SILENT' : 'HOLD'));
  }

  @override
  Future<SosAlert?> active() async => activeAlert;

  @override
  Future<SosAlert> markSafe(String alertId) async => SosAlert.fromJson(sosJson(userSafeAt: '2026-11-07T14:40:00.000Z'));

  @override
  Future<void> uploadLocations(String alertId, List<Map<String, dynamic>> samples) async => uploads.add(List.of(samples));
}
