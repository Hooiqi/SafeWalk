import 'dart:async';

import 'package:flutter_test/flutter_test.dart';
import 'package:safewalk/core/api_client.dart';
import 'package:safewalk/data/models.dart';
import 'package:safewalk/services/location_service.dart';
import 'package:safewalk/services/sos_controller.dart';

import 'fakes.dart';

void main() {
  late FakeSos sos;
  late FakeLocation location;
  late FakeRealtime realtime;
  late SosController controller;

  setUp(() {
    sos = FakeSos();
    location = FakeLocation();
    realtime = FakeRealtime();
    controller = SosController(
      sos: sos,
      location: location,
      realtime: realtime,
      gpsWait: const Duration(milliseconds: 50),
      retryDelays: const [Duration.zero],
    );
  });

  tearDown(() => controller.dispose());

  Future<void> settle() => Future<void>.delayed(Duration.zero);

  test('sends the SOS with GPS, identity comes from the session, then streams location', () async {
    await controller.trigger(silent: false);
    expect(controller.phase, SosPhase.active);
    expect(sos.creates.single['location'], isNotNull);
    expect(sos.creates.single['battery'], 55);
    expect(controller.alert!.trackingUrl, 'http://localhost:5173/t/sos-token');

    location.emit(5.3575, 100.3035, DateTime.utc(2026, 11, 7, 14, 31));
    await settle();
    final (event, payload) = realtime.sent.single;
    expect(event, 'sos:location');
    expect(payload['alert_id'], 'alert-1');
    expect((payload['sample'] as Map)['lat'], 5.3575);
  });

  test('keeps retrying through network failures with the same request id', () async {
    sos.failNetworkTimes = 3;
    await controller.trigger(silent: true);
    expect(controller.phase, SosPhase.active);
    expect(sos.creates, hasLength(4));
    expect(sos.creates.map((c) => c['requestId']).toSet(), hasLength(1), reason: 'one idempotency key per SOS press');
    expect(sos.creates.every((c) => c['silent'] == true), isTrue);
    expect(controller.alert!.isSilent, isTrue);
  });

  test('sends without GPS when no fix is available', () async {
    location.currentError = const LocationUnavailable('Location services are turned off.');
    await controller.trigger(silent: false);
    expect(controller.phase, SosPhase.active);
    expect(sos.creates.single['location'], isNull);
    expect(controller.gpsProblem, contains('turned off'));

    // Same when GPS just takes too long.
    controller.dispose();
    location.currentError = TimeoutException('slow');
    controller = SosController(sos: FakeSos(), location: location, realtime: realtime, gpsWait: const Duration(milliseconds: 10));
    await controller.trigger(silent: false);
    expect(controller.phase, SosPhase.active);
  });

  test('a rejected request is reported instead of retried forever', () async {
    sos.failWith = ApiException(400, 'BAD_REQUEST', 'Request validation failed');
    await controller.trigger(silent: false);
    expect(controller.phase, SosPhase.idle);
    expect(controller.error, 'Request validation failed');
    expect(sos.creates, hasLength(1));
  });

  test('pressing again while an SOS is active does nothing', () async {
    await controller.trigger(silent: false);
    await controller.trigger(silent: false);
    expect(sos.creates, hasLength(1));
  });

  test('follows USM Security status updates and stops when resolved', () async {
    await controller.trigger(silent: false);
    realtime.push('alert:status', {
      'alert_id': 'alert-1',
      'status': 'ON_THE_WAY',
      'latest': {'new_status': 'ON_THE_WAY', 'updated_at': '2026-11-07T14:33:00.000Z', 'staff_name': 'Officer Sample', 'note': 'Patrol 2'},
    });
    await settle();
    expect(controller.alert!.status, 'ON_THE_WAY');
    expect(controller.alert!.history.last.staffName, 'Officer Sample');

    realtime.push('alert:status', {'alert_id': 'other', 'status': 'RESOLVED'});
    await settle();
    expect(controller.phase, SosPhase.active, reason: 'events for other alerts are ignored');

    realtime.push('alert:status', {'alert_id': 'alert-1', 'status': 'RESOLVED', 'resolved_at': '2026-11-07T14:50:00.000Z'});
    await settle();
    expect(controller.phase, SosPhase.ended);
    location.emit(5.36, 100.31, DateTime.utc(2026, 11, 7, 14, 51));
    await settle();
    expect(realtime.sent, isEmpty, reason: 'no location is shared after the SOS ends');
  });

  test('buffers locations while offline and uploads them on reconnect', () async {
    await controller.trigger(silent: false);
    realtime.setConnected(false);
    location.emit(5.3575, 100.3035, DateTime.utc(2026, 11, 7, 14, 31));
    location.emit(5.3576, 100.3036, DateTime.utc(2026, 11, 7, 14, 32));
    await settle();
    expect(controller.bufferedSamples, 2);
    realtime.setConnected(true);
    await settle();
    expect(sos.uploads.single, hasLength(2));
    expect(controller.bufferedSamples, 0);
  });

  test('"I am safe" stops sharing; an open SOS is restored after restart', () async {
    await controller.trigger(silent: false);
    await controller.markSafe();
    expect(controller.phase, SosPhase.ended);
    expect(controller.alert!.userSafeAt, isNotNull);
    controller.dismiss();
    expect(controller.phase, SosPhase.idle);
  });

  test('an SOS still open on the server is restored after an app restart and keeps streaming', () async {
    await controller.resume();
    expect(controller.phase, SosPhase.idle, reason: 'nothing open on the server');

    sos.activeAlert = SosAlertFixtures.open();
    await controller.resume();
    expect(controller.phase, SosPhase.active);
    location.emit(5.3575, 100.3035, DateTime.utc(2026, 11, 7, 14, 31));
    await settle();
    expect(realtime.sent.single.$1, 'sos:location');
  });
}

class SosAlertFixtures {
  static SosAlert open() => SosAlert.fromJson(sosJson());
}
