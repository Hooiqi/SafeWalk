import 'package:flutter_test/flutter_test.dart';
import 'package:safewalk/data/models.dart';
import 'package:safewalk/services/trip_tracker.dart';

import 'fakes.dart';

void main() {
  late FakeTrips trips;
  late FakeLocation location;
  late FakeRealtime realtime;
  late TripTracker tracker;

  setUp(() {
    trips = FakeTrips();
    location = FakeLocation();
    realtime = FakeRealtime();
    tracker = TripTracker(trips: trips, location: location, realtime: realtime, heartbeatEvery: const Duration(hours: 1));
  });

  tearDown(() => tracker.dispose());

  Future<void> settle() => Future<void>.delayed(Duration.zero);

  test('streams GPS fixes for the active trip over the socket', () async {
    tracker.begin(Trip.fromJson(tripJson()));
    location.emit(5.3570, 100.3030, DateTime.utc(2026, 11, 6, 14, 1));
    await settle();

    expect(realtime.sent, hasLength(1));
    final (event, payload) = realtime.sent.single;
    final sample = payload['sample'] as Map<String, dynamic>;
    expect(event, 'trip:location');
    expect(payload['trip_id'], 'trip-1');
    expect(sample['lat'], 5.3570);
    expect(sample['recorded_at'], '2026-11-06T14:01:00.000Z');
    expect(sample['battery_level'], 55);
    expect(sample.containsKey('is_heartbeat'), isFalse, reason: 'the server sets it from the event name');
    expect(tracker.myPosition?.latitude, 5.3570);
  });

  test('buffers samples while offline and uploads them when the connection returns', () async {
    tracker.begin(Trip.fromJson(tripJson()));
    realtime.setConnected(false);
    location.emit(5.3570, 100.3030, DateTime.utc(2026, 11, 6, 14, 1));
    location.emit(5.3575, 100.3035, DateTime.utc(2026, 11, 6, 14, 2));
    await settle();
    expect(tracker.bufferedSamples, 2);
    expect(realtime.sent, isEmpty);

    trips.activeTrip = Trip.fromJson(tripJson());
    realtime.setConnected(true);
    await settle();
    await settle();
    expect(trips.uploads, hasLength(1));
    expect(trips.uploads.single.map((s) => s['lat']), [5.3570, 5.3575]);
    expect(trips.uploads.single.first['is_heartbeat'], isFalse);
    expect(tracker.bufferedSamples, 0);
  });

  test('shows the grace prompt when the server says the ETA has passed', () async {
    tracker.begin(Trip.fromJson(tripJson()));
    realtime.push('trip:grace_prompt', {'trip_id': 'trip-1', 'grace_expires_at': '2026-11-06T14:11:00.000Z'});
    await settle();
    expect(tracker.gracePromptPending, isTrue);
    expect(tracker.trip!.status, 'GRACE_PROMPT');
    expect(tracker.trip!.graceExpiresAt, DateTime.utc(2026, 11, 6, 14, 11));
  });

  test('ignores events for other trips', () async {
    tracker.begin(Trip.fromJson(tripJson()));
    realtime.push('trip:status', {'trip_id': 'someone-else', 'status': 'ESCALATED'});
    await settle();
    expect(tracker.trip!.status, 'ACTIVE');
  });

  test('extending clears the grace prompt; arriving stops location streaming', () async {
    tracker.begin(Trip.fromJson(tripJson(status: 'GRACE_PROMPT')));
    expect(tracker.gracePromptPending, isTrue);
    await tracker.extend(10);
    expect(trips.calls, ['extend:10']);
    expect(tracker.gracePromptPending, isFalse);
    expect(tracker.trip!.etaDeadline, DateTime.utc(2026, 11, 6, 14, 18));

    await tracker.arrive();
    expect(tracker.trip!.status, 'COMPLETED');
    location.emit(5.3590, 100.3048, DateTime.utc(2026, 11, 6, 14, 9));
    await settle();
    expect(realtime.sent, isEmpty, reason: 'no location is shared after the journey ends');
  });

  test('escalation from the server is reflected immediately', () async {
    tracker.begin(Trip.fromJson(tripJson(status: 'GRACE_PROMPT')));
    realtime.push('trip:status', {
      'trip_id': 'trip-1',
      'status': 'ESCALATED',
      'eta_deadline': '2026-11-06T14:08:00.000Z',
      'escalated_at': '2026-11-06T14:11:00.000Z',
    });
    await settle();
    expect(tracker.trip!.status, 'ESCALATED');
    expect(tracker.trip!.isOpen, isTrue, reason: 'location keeps streaming to security');
    expect(tracker.gracePromptPending, isFalse);
  });

  test('resumes an open journey after the app restarts', () async {
    trips.activeTrip = Trip.fromJson(tripJson());
    await tracker.resume();
    expect(tracker.trip?.id, 'trip-1');
  });
}
