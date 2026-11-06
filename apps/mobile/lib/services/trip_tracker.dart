import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:latlong2/latlong.dart';

import '../core/api_client.dart';
import '../core/constants.dart';
import '../data/models.dart';
import '../data/repositories.dart';
import 'location_service.dart';
import 'realtime_service.dart';

/// Owns the user's current journey on the device (Module 1).
///
/// The phone streams GPS samples and a periodic heartbeat to the server. The
/// ETA countdown itself is NOT kept here: the server watchdog decides when the
/// grace period starts and when to escalate, and tells the app through
/// `trip:status` / `trip:grace_prompt` events. If the socket is down, samples
/// are buffered and uploaded over HTTP when the connection returns.
class TripTracker extends ChangeNotifier {
  TripTracker({
    required this.trips,
    required this.location,
    required this.realtime,
    DateTime Function()? clock,
    this.heartbeatEvery = heartbeatInterval,
  }) : _clock = clock ?? DateTime.now {
    _eventSub = realtime.events.listen(_onEvent);
    realtime.connected.addListener(_onConnectionChange);
  }

  static const maxBufferedSamples = 500;

  final TripsRepository trips;
  final LocationSource location;
  final RealtimeChannel realtime;
  final DateTime Function() _clock;
  final Duration heartbeatEvery;

  late final StreamSubscription<RealtimeEvent> _eventSub;
  StreamSubscription<LocationReading>? _gpsSub;
  Timer? _heartbeat;
  int? _battery;
  bool _flushing = false;

  Trip? _trip;
  LocationReading? _lastFix;
  bool _gracePromptPending = false;
  String? _trackingError;
  final List<Map<String, dynamic>> _buffer = [];

  bool _restored = false;

  /// False until [resume] has asked the server for an open journey.
  bool get restored => _restored;
  Trip? get trip => _trip;
  LatLng? get myPosition => _lastFix?.position;
  bool get gracePromptPending => _gracePromptPending;
  String? get trackingError => _trackingError;
  int get bufferedSamples => _buffer.length;
  bool get isConnected => realtime.connected.value;

  /// Restores a journey that is still open on the server (e.g. after the app restarted).
  Future<void> resume() async {
    final open = await trips.active();
    _restored = true;
    if (open != null && open.id != _trip?.id) {
      _begin(open);
    } else {
      notifyListeners();
    }
  }

  /// Call after the server has created the trip.
  void begin(Trip trip) => _begin(trip);

  void _begin(Trip trip) {
    _trip = trip;
    _gracePromptPending = trip.status == TripStatus.gracePrompt;
    _trackingError = null;
    _startStreaming();
    notifyListeners();
  }

  Future<void> extend(int minutes) => _apply(() => trips.extend(_trip!.id, minutes));
  Future<void> arrive() => _apply(() => trips.arrive(_trip!.id));
  Future<void> confirmSafe() => _apply(() => trips.confirmSafe(_trip!.id));
  Future<void> cancel() => _apply(() => trips.cancel(_trip!.id));

  /// Clears a finished journey from the screen.
  void dismiss() {
    if (_trip?.isOpen ?? false) return;
    _trip = null;
    notifyListeners();
  }

  Future<void> _apply(Future<Trip> Function() action) async {
    // Upload anything buffered first so the route history is complete.
    await _flush();
    _setTrip(await action());
  }

  void _setTrip(Trip updated) {
    _trip = updated;
    if (updated.status != TripStatus.gracePrompt) _gracePromptPending = false;
    if (!updated.isOpen) _stopStreaming();
    notifyListeners();
  }

  // ---- GPS streaming -------------------------------------------------------

  void _startStreaming() {
    _stopStreaming();
    location.batteryLevel().then((level) => _battery = level);
    _gpsSub = location.watch().listen(
      (fix) {
        _lastFix = fix;
        _trackingError = null;
        notifyListeners();
        _send(SocketEvents.tripLocation, fix, fix.timestamp);
      },
      onError: (Object e) {
        _trackingError = e is LocationUnavailable ? e.message : 'Location updates stopped. Check that GPS is on.';
        notifyListeners();
      },
    );
    _heartbeat = Timer.periodic(heartbeatEvery, (_) async {
      _battery = await location.batteryLevel();
      final fix = _lastFix;
      if (fix != null) _send(SocketEvents.tripHeartbeat, fix, _clock().toUtc());
    });
  }

  void _stopStreaming() {
    _gpsSub?.cancel();
    _gpsSub = null;
    _heartbeat?.cancel();
    _heartbeat = null;
  }

  Map<String, dynamic> _sample(LocationReading fix, DateTime recordedAt, {required bool heartbeat}) => {
        'lat': fix.position.latitude,
        'lng': fix.position.longitude,
        'recorded_at': recordedAt.toUtc().toIso8601String(),
        if (_battery != null) 'battery_level': _battery,
        if (fix.accuracyM != null) 'accuracy_m': fix.accuracyM,
        'is_heartbeat': heartbeat,
      };

  Future<void> _send(String event, LocationReading fix, DateTime recordedAt) async {
    final trip = _trip;
    if (trip == null || !trip.isOpen) return;
    final heartbeat = event == SocketEvents.tripHeartbeat;
    final sample = _sample(fix, recordedAt, heartbeat: heartbeat);
    final socketSample = Map<String, dynamic>.from(sample)..remove('is_heartbeat');
    final error = await realtime.sendSample(event, trip.id, socketSample);
    if (error == null) return;
    if (error == 'TRIP_NOT_ACTIVE') {
      await _refreshFromServer();
    } else if (error == 'OFFLINE' || error == 'INTERNAL') {
      _buffer.add(sample);
      if (_buffer.length > maxBufferedSamples) _buffer.removeAt(0);
      notifyListeners();
    }
  }

  void _onConnectionChange() {
    if (realtime.connected.value) {
      _flush();
      _refreshFromServer(); // catch up on status changes missed while offline
    }
    notifyListeners();
  }

  Future<void> _flush() async {
    final trip = _trip;
    if (_flushing || _buffer.isEmpty || trip == null || !trip.isOpen) return;
    _flushing = true;
    final batch = List<Map<String, dynamic>>.from(_buffer);
    try {
      await trips.uploadLocations(trip.id, batch);
      _buffer.removeRange(0, batch.length);
      notifyListeners();
    } on ApiException catch (e) {
      if (e.code == 'TRIP_NOT_ACTIVE') _buffer.clear();
    } finally {
      _flushing = false;
    }
  }

  Future<void> _refreshFromServer() async {
    final current = _trip;
    if (current == null) return;
    try {
      final open = await trips.active();
      if (open != null && open.id == current.id) {
        _gracePromptPending = open.status == TripStatus.gracePrompt;
        _setTrip(open);
      } else if (open == null && current.isOpen) {
        // Ended elsewhere (e.g. another device); keep the last state but stop streaming.
        _stopStreaming();
      }
    } on ApiException {
      // Offline: try again on the next reconnect.
    }
  }

  // ---- Server events -------------------------------------------------------

  void _onEvent(RealtimeEvent event) {
    final trip = _trip;
    if (trip == null || event.data['trip_id'] != trip.id) return;
    switch (event.name) {
      case SocketEvents.tripGracePrompt:
        _gracePromptPending = true;
        _setTrip(trip.withStatusEvent({
          'status': TripStatus.gracePrompt,
          'eta_deadline': trip.etaDeadline.toIso8601String(),
          'grace_expires_at': event.data['grace_expires_at'],
        }));
      case SocketEvents.tripStatus:
        _setTrip(trip.withStatusEvent(event.data));
    }
  }

  @override
  void dispose() {
    _stopStreaming();
    _eventSub.cancel();
    realtime.connected.removeListener(_onConnectionChange);
    super.dispose();
  }
}
