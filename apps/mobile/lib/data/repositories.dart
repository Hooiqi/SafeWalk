import 'package:latlong2/latlong.dart';

import '../core/api_client.dart';
import 'models.dart';

class ContactsRepository {
  ContactsRepository(this._api);
  final ApiClient _api;

  Future<List<TrustedContact>> list() async =>
      [for (final c in await _api.get('/api/contacts') as List) TrustedContact.fromJson(c as Map<String, dynamic>)];

  Future<TrustedContact> create(Map<String, String?> fields) async =>
      TrustedContact.fromJson(await _api.post('/api/contacts', fields) as Map<String, dynamic>);

  Future<TrustedContact> update(String id, Map<String, String?> fields) async =>
      TrustedContact.fromJson(await _api.patch('/api/contacts/$id', fields) as Map<String, dynamic>);

  Future<void> delete(String id) => _api.delete('/api/contacts/$id');
}

class TripsRepository {
  TripsRepository(this._api);
  final ApiClient _api;

  Future<RoutePreview> previewRoute(LatLng origin, LatLng destination) async => RoutePreview.fromJson(
        await _api.post('/api/trips/route-preview', {'origin': pointJson(origin), 'destination': pointJson(destination)})
            as Map<String, dynamic>,
      );

  Future<Trip> start({
    required LatLng origin,
    required LatLng destination,
    required List<String> contactIds,
    String? destinationLabel,
    int? batteryLevel,
    double? accuracyM,
  }) async =>
      Trip.fromJson(await _api.post('/api/trips', {
        'origin': pointJson(origin),
        'destination': pointJson(destination),
        'contact_ids': contactIds,
        if (destinationLabel != null && destinationLabel.trim().isNotEmpty) 'destination_label': destinationLabel.trim(),
        'battery_level': ?batteryLevel,
        'accuracy_m': ?accuracyM,
      }) as Map<String, dynamic>);

  Future<Trip?> active() async {
    final body = await _api.get('/api/trips/active') as Map<String, dynamic>;
    return body['trip'] == null ? null : Trip.fromJson(body['trip'] as Map<String, dynamic>);
  }

  Future<List<Trip>> history({DateTime? before}) async {
    final query = before == null ? '' : '&before=${Uri.encodeQueryComponent(before.toUtc().toIso8601String())}';
    final body = await _api.get('/api/trips?limit=20$query') as Map<String, dynamic>;
    return [for (final t in body['trips'] as List) Trip.fromJson(t as Map<String, dynamic>)];
  }

  Future<Trip> extend(String tripId, int minutes) async =>
      Trip.fromJson(await _api.post('/api/trips/$tripId/extend', {'minutes': minutes}) as Map<String, dynamic>);
  Future<Trip> arrive(String tripId) async => Trip.fromJson(await _api.post('/api/trips/$tripId/arrive') as Map<String, dynamic>);
  Future<Trip> confirmSafe(String tripId) async =>
      Trip.fromJson(await _api.post('/api/trips/$tripId/confirm-safe') as Map<String, dynamic>);
  Future<Trip> cancel(String tripId) async => Trip.fromJson(await _api.post('/api/trips/$tripId/cancel') as Map<String, dynamic>);

  /// HTTP fallback used to flush samples buffered while the socket was down.
  Future<void> uploadLocations(String tripId, List<Map<String, dynamic>> samples) =>
      _api.post('/api/trips/$tripId/locations', {'samples': samples});
}

class ProfileRepository {
  ProfileRepository(this._api);
  final ApiClient _api;

  Future<UserProfile> me() async => UserProfile.fromJson(await _api.get('/api/me') as Map<String, dynamic>);

  Future<UserProfile> update(Map<String, String?> fields) async =>
      UserProfile.fromJson(await _api.patch('/api/me', fields) as Map<String, dynamic>);

  Future<void> registerPushToken(String token) => _api.patch('/api/me', {'device_fcm_token': token});
}

class SafePointsRepository {
  SafePointsRepository(this._api);
  final ApiClient _api;

  String _at(LatLng p) => 'lat=${p.latitude}&lng=${p.longitude}';

  /// All active safe points on the map, and how many official ones still need a location.
  Future<({List<SafePoint> points, int pendingLocation})> all() async {
    final body = await _api.get('/api/safe-points') as Map<String, dynamic>;
    return (
      points: [for (final p in body['safe_points'] as List) SafePoint.fromJson(p as Map<String, dynamic>)],
      pendingLocation: (body['pending_location_count'] as num?)?.toInt() ?? 0,
    );
  }

  /// Open safe points nearest to [from], ranked by walking time.
  Future<List<SafePoint>> nearest(LatLng from, {int limit = 5}) async {
    final body = await _api.get('/api/safe-points/nearest?${_at(from)}&limit=$limit') as Map<String, dynamic>;
    return [for (final p in body['safe_points'] as List) SafePoint.fromJson(p as Map<String, dynamic>)];
  }

  Future<RoutePreview> directions(String safePointId, LatLng from) async {
    final body = await _api.get('/api/safe-points/$safePointId/directions?${_at(from)}') as Map<String, dynamic>;
    return RoutePreview.fromJson(body['route'] as Map<String, dynamic>);
  }
}

class SosRepository {
  SosRepository(this._api);
  final ApiClient _api;

  Future<SosAlert> create({
    required bool silent,
    required String requestId,
    LatLng? location,
    double? accuracyM,
    int? batteryLevel,
    DateTime? recordedAt,
  }) async =>
      SosAlert.fromJson(await _api.post('/api/sos', {
        'trigger_type': silent ? 'SILENT' : 'HOLD',
        'client_request_id': requestId,
        if (location != null) 'location': pointJson(location),
        'accuracy_m': ?accuracyM,
        'battery_level': ?batteryLevel,
        if (location != null && recordedAt != null) 'recorded_at': recordedAt.toUtc().toIso8601String(),
      }) as Map<String, dynamic>);

  Future<SosAlert?> active() async {
    final body = await _api.get('/api/sos/active') as Map<String, dynamic>;
    return body['alert'] == null ? null : SosAlert.fromJson(body['alert'] as Map<String, dynamic>);
  }

  Future<SosAlert> markSafe(String alertId) async =>
      SosAlert.fromJson(await _api.post('/api/sos/$alertId/safe') as Map<String, dynamic>);

  Future<void> uploadLocations(String alertId, List<Map<String, dynamic>> samples) =>
      _api.post('/api/sos/$alertId/locations', {'samples': samples});
}

/// Module 3: incident reports and the shared safety map.
class IncidentsRepository {
  IncidentsRepository(this._api);
  final ApiClient _api;

  Future<MyReport> submit({
    required String category,
    required String severity,
    required String description,
    required LatLng location,
    required bool anonymous,
    required String requestId,
    double? accuracyM,
  }) async =>
      MyReport.fromJson(await _api.post('/api/incidents', {
        'category': category,
        'severity_level': severity,
        'description': description.trim(),
        'location': pointJson(location),
        'is_anonymous': anonymous,
        'client_request_id': requestId,
        'accuracy_m': ?accuracyM,
      }) as Map<String, dynamic>);

  /// Optional photo, sent right after the report (JPEG or PNG).
  Future<void> attachPhoto(String reportId, List<int> bytes, {String contentType = 'image/jpeg'}) =>
      _api.postBytes('/api/incidents/reports/$reportId/photo', bytes, contentType);

  Future<List<MyReport>> mine() async {
    final body = await _api.get('/api/incidents/mine') as Map<String, dynamic>;
    return [for (final r in body['reports'] as List) MyReport.fromJson(r as Map<String, dynamic>)];
  }

  /// Verified incidents inside the visible map area only.
  Future<({List<Incident> incidents, bool truncated})> inArea({
    required double south,
    required double west,
    required double north,
    required double east,
  }) async {
    String f(double v) => v.toStringAsFixed(6);
    final body = await _api.get('/api/incidents/map?south=${f(south)}&west=${f(west)}&north=${f(north)}&east=${f(east)}')
        as Map<String, dynamic>;
    return (
      incidents: [for (final i in body['incidents'] as List) Incident.fromJson(i as Map<String, dynamic>)],
      truncated: body['truncated'] as bool? ?? false,
    );
  }

  Future<Incident> get(String incidentId) async =>
      Incident.fromJson(await _api.get('/api/incidents/$incidentId') as Map<String, dynamic>);
}
