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
