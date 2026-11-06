import 'dart:async';

import 'package:battery_plus/battery_plus.dart';
import 'package:flutter/foundation.dart';
import 'package:geolocator/geolocator.dart';
import 'package:latlong2/latlong.dart';

class LocationReading {
  const LocationReading({required this.position, required this.timestamp, this.accuracyM});
  final LatLng position;
  final DateTime timestamp;
  final double? accuracyM;
}

class LocationUnavailable implements Exception {
  const LocationUnavailable(this.message, {this.canOpenSettings = false});
  final String message;
  final bool canOpenSettings;
  @override
  String toString() => message;
}

/// Source of GPS fixes and battery level. Abstract so the trip tracker can be
/// tested without a device.
abstract class LocationSource {
  Future<LocationReading> current();
  Stream<LocationReading> watch();
  Future<int?> batteryLevel();
}

class GeolocatorLocationSource implements LocationSource {
  final _battery = Battery();

  Future<void> _ensurePermission() async {
    if (!await Geolocator.isLocationServiceEnabled()) {
      throw const LocationUnavailable('Location services are turned off. Turn on GPS to share your journey.', canOpenSettings: true);
    }
    var permission = await Geolocator.checkPermission();
    if (permission == LocationPermission.denied) permission = await Geolocator.requestPermission();
    if (permission == LocationPermission.denied) {
      throw const LocationUnavailable('SafeWalk needs location access to track your journey.');
    }
    if (permission == LocationPermission.deniedForever) {
      throw const LocationUnavailable('Location access is blocked. Allow it in Settings to use journey tracking.', canOpenSettings: true);
    }
  }

  LocationReading _toReading(Position p) => LocationReading(
        position: LatLng(p.latitude, p.longitude),
        timestamp: p.timestamp.toUtc(),
        accuracyM: p.accuracy.isFinite && p.accuracy >= 0 ? p.accuracy : null,
      );

  @override
  Future<LocationReading> current() async {
    await _ensurePermission();
    final p = await Geolocator.getCurrentPosition(
      locationSettings: const LocationSettings(accuracy: LocationAccuracy.high, timeLimit: Duration(seconds: 20)),
    );
    return _toReading(p);
  }

  /// Continuous updates that keep running with the screen off: an Android
  /// foreground service (visible notification) and iOS background updates.
  @override
  Stream<LocationReading> watch() async* {
    await _ensurePermission();
    final LocationSettings settings;
    if (!kIsWeb && defaultTargetPlatform == TargetPlatform.android) {
      settings = AndroidSettings(
        accuracy: LocationAccuracy.high,
        distanceFilter: 10,
        intervalDuration: const Duration(seconds: 5),
        foregroundNotificationConfig: const ForegroundNotificationConfig(
          notificationTitle: 'SafeWalk journey in progress',
          notificationText: 'Your trusted contacts can see your live location until you arrive.',
          notificationChannelName: 'Journey tracking',
          enableWakeLock: true,
          setOngoing: true,
        ),
      );
    } else if (!kIsWeb && defaultTargetPlatform == TargetPlatform.iOS) {
      settings = AppleSettings(
        accuracy: LocationAccuracy.high,
        distanceFilter: 10,
        activityType: ActivityType.fitness,
        allowBackgroundLocationUpdates: true,
        showBackgroundLocationIndicator: true,
        pauseLocationUpdatesAutomatically: false,
      );
    } else {
      settings = const LocationSettings(accuracy: LocationAccuracy.high, distanceFilter: 10);
    }
    yield* Geolocator.getPositionStream(locationSettings: settings).map(_toReading);
  }

  @override
  Future<int?> batteryLevel() async {
    try {
      return await _battery.batteryLevel;
    } catch (_) {
      return null; // not available on every platform
    }
  }

  static Future<bool> openSettings() => Geolocator.openLocationSettings();
}
