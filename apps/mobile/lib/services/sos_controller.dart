import 'dart:async';

import 'package:flutter/foundation.dart';

import '../core/api_client.dart';
import '../core/constants.dart';
import '../core/ids.dart';
import '../data/models.dart';
import '../data/repositories.dart';
import 'location_service.dart';
import 'realtime_service.dart';

enum SosPhase { idle, sending, active, ended }

/// Emergency SOS on the phone (proposal Module 2).
///
/// Sending: one idempotency key per SOS press, reused on every retry, so a
/// flaky connection can never create two alerts. Network failures are retried
/// with back-off until the server confirms; GPS is attached if a fix arrives
/// within a few seconds, otherwise the SOS is sent without it and the live
/// stream supplies the position.
///
/// While the SOS is open the phone streams GPS to the server (security and
/// the contacts' live link), buffering samples while offline.
class SosController extends ChangeNotifier {
  SosController({
    required this.sos,
    required this.location,
    required this.realtime,
    this.gpsWait = const Duration(seconds: 6),
    this.retryDelays = const [Duration(seconds: 1), Duration(seconds: 2), Duration(seconds: 4), Duration(seconds: 8)],
  }) {
    _eventSub = realtime.events.listen(_onEvent);
    realtime.connected.addListener(_onConnectionChange);
  }

  final SosRepository sos;
  final LocationSource location;
  final RealtimeChannel realtime;
  final Duration gpsWait;
  final List<Duration> retryDelays;

  late final StreamSubscription<RealtimeEvent> _eventSub;
  StreamSubscription<LocationReading>? _gpsSub;
  final List<Map<String, dynamic>> _buffer = [];
  bool _flushing = false;
  bool _disposed = false;

  SosPhase _phase = SosPhase.idle;
  SosAlert? _alert;
  bool _silent = false;
  int _attempt = 0;
  String? _error;
  String? _gpsProblem;

  SosPhase get phase => _phase;
  SosAlert? get alert => _alert;
  bool get silent => _alert?.isSilent ?? _silent;
  int get attempt => _attempt;
  String? get error => _error;
  String? get gpsProblem => _gpsProblem;
  int get bufferedSamples => _buffer.length;
  bool get isConnected => realtime.connected.value;

  /// Restores an SOS that is still open on the server (e.g. after an app restart).
  Future<void> resume() async {
    if (_phase == SosPhase.sending) return;
    final open = await sos.active();
    if (open != null && open.isOpen) {
      _alert = open;
      _phase = SosPhase.active;
      _startStreaming();
      _notify();
    }
  }

  /// Called after the hold-to-confirm gesture (or the silent SOS confirmation).
  Future<void> trigger({required bool silent}) async {
    if (_phase == SosPhase.sending || _phase == SosPhase.active) return;
    _silent = silent;
    _phase = SosPhase.sending;
    _attempt = 0;
    _error = null;
    _notify();

    final requestId = uuidV4();
    final fix = await _quickFix();
    final battery = await location.batteryLevel();

    while (!_disposed) {
      _attempt++;
      _notify();
      try {
        _alert = await sos.create(
          silent: silent,
          requestId: requestId,
          location: fix?.position,
          accuracyM: fix?.accuracyM,
          batteryLevel: battery,
          recordedAt: fix?.timestamp,
        );
        _phase = SosPhase.active;
        _error = null;
        _startStreaming();
        _notify();
        return;
      } on ApiException catch (e) {
        final retryable = e.isNetwork || e.statusCode >= 500 || e.statusCode == 429;
        if (!retryable) {
          _phase = SosPhase.idle;
          _error = e.message;
          _notify();
          return;
        }
        _error = 'No connection. Still trying to send your SOS… Call for help if you can.';
        _notify();
        await Future<void>.delayed(retryDelays[(_attempt - 1).clamp(0, retryDelays.length - 1)]);
      }
    }
  }

  Future<LocationReading?> _quickFix() async {
    try {
      final fix = await location.current().timeout(gpsWait);
      _gpsProblem = null;
      return fix;
    } on LocationUnavailable catch (e) {
      _gpsProblem = e.message;
    } catch (_) {
      _gpsProblem = 'No GPS position yet. Your SOS is sent without it and updates when one is found.';
    }
    return null;
  }

  /// The user reports they are safe: stops sharing and tells security and contacts.
  Future<void> markSafe() async {
    final current = _alert;
    if (current == null) return;
    await _flush();
    _alert = await sos.markSafe(current.id);
    _end();
  }

  /// Clears a finished SOS from the screen.
  void dismiss() {
    if (_alert?.isOpen ?? false) return;
    _alert = null;
    _phase = SosPhase.idle;
    _notify();
  }

  void _end() {
    _stopStreaming();
    _buffer.clear();
    _phase = SosPhase.ended;
    _notify();
  }

  // ---- live location -------------------------------------------------------

  void _startStreaming() {
    _stopStreaming();
    _gpsSub = location.watch().listen(
      (fix) {
        _gpsProblem = null;
        _send(fix);
      },
      onError: (Object e) {
        _gpsProblem = e is LocationUnavailable ? e.message : 'Location updates stopped. Check that GPS is on.';
        _notify();
      },
    );
  }

  void _stopStreaming() {
    _gpsSub?.cancel();
    _gpsSub = null;
  }

  Future<void> _send(LocationReading fix) async {
    final current = _alert;
    if (current == null || !current.isOpen) return;
    final sample = {
      'lat': fix.position.latitude,
      'lng': fix.position.longitude,
      'recorded_at': fix.timestamp.toUtc().toIso8601String(),
      if (fix.accuracyM != null) 'accuracy_m': fix.accuracyM,
    };
    final error = await realtime.send(SocketEvents.sosLocation, {'alert_id': current.id, 'sample': sample});
    if (error == null) return;
    if (error == 'SOS_NOT_ACTIVE') {
      await resume().catchError((_) {});
      if (!(_alert?.isOpen ?? false)) _end();
    } else if (error == 'OFFLINE' || error == 'INTERNAL') {
      _buffer.add(sample);
      if (_buffer.length > 500) _buffer.removeAt(0);
      _notify();
    }
  }

  void _onConnectionChange() {
    if (realtime.connected.value) _flush();
    _notify();
  }

  Future<void> _flush() async {
    final current = _alert;
    if (_flushing || _buffer.isEmpty || current == null || !current.isOpen) return;
    _flushing = true;
    final batch = List<Map<String, dynamic>>.from(_buffer);
    try {
      await sos.uploadLocations(current.id, batch);
      _buffer.removeRange(0, batch.length);
      _notify();
    } on ApiException catch (e) {
      if (e.code == 'SOS_NOT_ACTIVE') _buffer.clear();
    } finally {
      _flushing = false;
    }
  }

  // ---- updates from USM Security --------------------------------------------

  void _onEvent(RealtimeEvent event) {
    final current = _alert;
    if (event.name != SocketEvents.alertStatus || current == null || event.data['alert_id'] != current.id) return;
    _alert = current.withStatusEvent(event.data);
    if (!_alert!.isOpen) {
      _end();
    } else {
      _notify();
    }
  }

  void _notify() {
    if (!_disposed) notifyListeners();
  }

  @override
  void dispose() {
    _disposed = true;
    _stopStreaming();
    _eventSub.cancel();
    realtime.connected.removeListener(_onConnectionChange);
    super.dispose();
  }
}
