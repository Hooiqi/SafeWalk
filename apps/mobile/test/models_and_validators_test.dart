import 'package:flutter_test/flutter_test.dart';
import 'package:safewalk/core/formatting.dart';
import 'package:safewalk/data/models.dart';
import 'package:safewalk/features/auth/validators.dart';

import 'fakes.dart';

void main() {
  group('Trip.fromJson', () {
    test('parses the server trip shape', () {
      final t = Trip.fromJson(tripJson());
      expect(t.status, 'ACTIVE');
      expect(t.destinationLabel, 'Sample hostel');
      expect(t.route.first.latitude, 5.3561, reason: 'GeoJSON is [lng, lat]');
      expect(t.route.first.longitude, 100.3021);
      expect(t.distanceM, 600);
      expect(t.contactNames, ['Ali']);
      expect(t.linkDelivery.single.status, 'skipped');
      expect(t.lastLocation?.batteryLevel, 80);
      expect(t.isOpen, isTrue);
    });

    test('flags straight-line estimates', () {
      final json = tripJson();
      (json['route'] as Map)['source'] = 'STRAIGHT_LINE_ESTIMATE';
      expect(Trip.fromJson(json).routeIsEstimate, isTrue);
    });

    test('terminal statuses are not open', () {
      expect(Trip.fromJson(tripJson(status: 'COMPLETED')).isOpen, isFalse);
      expect(Trip.fromJson(tripJson(status: 'CANCELLED')).isOpen, isFalse);
      expect(Trip.fromJson(tripJson(status: 'ESCALATED')).isOpen, isTrue);
    });
  });

  test('trusted contact lists the channels it can be reached on', () {
    final c = TrustedContact.fromJson({'contact_id': 'x', 'contact_name': 'Mei', 'telegram_chat_id': '123', 'email': 'm@x.com'});
    expect(c.channels, ['Telegram', 'Email']);
  });

  group('validators', () {
    test('phone numbers use international format', () {
      expect(validatePhone('+60123456789'), isNull);
      expect(validatePhone('0123456789'), isNotNull);
      expect(validatePhone('', required: false), isNull);
      expect(validatePhone(''), isNotNull);
    });
    test('email and password', () {
      expect(validateEmail('a@student.usm.my'), isNull);
      expect(validateEmail('not-an-email'), isNotNull);
      expect(validatePassword('short'), isNotNull);
      expect(validatePassword('longenough'), isNull);
    });
  });

  test('formatting', () {
    expect(formatDuration(const Duration(seconds: 45)), '45 s');
    expect(formatDuration(const Duration(minutes: 8)), '8 min');
    expect(formatDuration(const Duration(minutes: 65)), '1 h 05 min');
    expect(formatCountdown(const Duration(seconds: 179)), '02:59');
    expect(formatCountdown(const Duration(seconds: -5)), '00:00');
    expect(formatDistance(640), '640 m');
    expect(formatDistance(1500), '1.5 km');
  });
}
