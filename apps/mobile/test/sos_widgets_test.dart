import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:safewalk/data/models.dart';
import 'package:safewalk/features/safe_points/safe_points_screen.dart';
import 'package:safewalk/services/phone_dialer.dart';
import 'package:safewalk/widgets/hold_to_confirm_button.dart';

import 'fakes.dart';

void main() {
  group('hold-to-confirm SOS button', () {
    Future<int Function()> pump(WidgetTester tester, {bool enabled = true}) async {
      var confirmed = 0;
      await tester.pumpWidget(MaterialApp(
        home: Scaffold(
          body: Center(
            child: HoldToConfirmButton(
              holdDuration: const Duration(seconds: 3),
              haptics: false,
              enabled: enabled,
              onConfirmed: () => confirmed++,
            ),
          ),
        ),
      ));
      return () => confirmed;
    }

    testWidgets('fires only after being held for 3 seconds', (tester) async {
      final confirmed = await pump(tester);
      final gesture = await tester.startGesture(tester.getCenter(find.byType(HoldToConfirmButton)));
      // Frames every 100 ms, like a real device.
      for (var i = 0; i < 29; i++) {
        await tester.pump(const Duration(milliseconds: 100));
      }
      expect(confirmed(), 0);
      expect(find.textContaining('Keep holding'), findsOneWidget);
      for (var i = 0; i < 3; i++) {
        await tester.pump(const Duration(milliseconds: 100));
      }
      expect(confirmed(), 1);
      await gesture.up();
      await tester.pumpAndSettle();
      expect(confirmed(), 1);
    });

    testWidgets('releasing early cancels (prevents accidental SOS)', (tester) async {
      final confirmed = await pump(tester);
      final gesture = await tester.startGesture(tester.getCenter(find.byType(HoldToConfirmButton)));
      for (var i = 0; i < 20; i++) {
        await tester.pump(const Duration(milliseconds: 100));
      }
      await gesture.up();
      for (var i = 0; i < 30; i++) {
        await tester.pump(const Duration(milliseconds: 100));
      }
      expect(confirmed(), 0);
      // A quick tap does nothing either.
      await tester.tap(find.byType(HoldToConfirmButton));
      await tester.pump(const Duration(seconds: 4));
      expect(confirmed(), 0);
    });

    testWidgets('does nothing while disabled', (tester) async {
      final confirmed = await pump(tester, enabled: false);
      final gesture = await tester.startGesture(tester.getCenter(find.byType(HoldToConfirmButton)));
      await tester.pump(const Duration(seconds: 4));
      await gesture.up();
      expect(confirmed(), 0);
    });

    testWidgets('has a screen-reader label explaining the hold', (tester) async {
      await pump(tester);
      expect(find.bySemanticsLabel(RegExp('Hold for 3 seconds')), findsOneWidget);
    });
  });

  group('safe point display', () {
    test('parses a nearest-safe-point result', () {
      final p = SafePoint.fromJson({
        'safe_point_id': 'sp1',
        'name': 'Jabatan Keselamatan HQ',
        'category': 'SECURITY_POST',
        'location': {'lat': 5.35, 'lng': 100.30},
        'operating_hours': '24 hours, daily',
        'opening': {'is_open': true, 'always': true, 'closes_at': null, 'opens_at': null},
        'contact_phone': '+6046534999',
        'walking': {'distance_m': 320, 'duration_s': 260, 'source': 'OSRM'},
      });
      expect(p.walking!.duration, const Duration(seconds: 260));
      expect(SafePointCategory.label(p.category), 'Security post');
      expect(openingLabel(p.opening), 'Open 24 hours');
    });

    test('labels opening hours', () {
      final now = DateTime(2026, 11, 9, 10);
      expect(openingLabel(OpeningStatus(isOpen: true, always: false, closesAt: DateTime(2026, 11, 9, 17, 10)), now: now), 'Open · closes 5:10 PM');
      expect(openingLabel(OpeningStatus(isOpen: false, always: false, opensAt: DateTime(2026, 11, 10, 8, 10)), now: now), 'Closed · opens Tue 8:10 AM');
      expect(openingLabel(const OpeningStatus(isOpen: false, always: false), now: now), 'Closed');
    });

    test('formats campus phone numbers', () {
      expect(formatPhone('+6046534999'), '+604-653 4999');
      expect(formatPhone('999'), '999');
    });

    test('status events update an SOS without duplicating history entries', () {
      final alert = SosAlert.fromJson(sosJson());
      final event = {
        'alert_id': 'alert-1',
        'status': 'RECEIVED',
        'latest': {'new_status': 'RECEIVED', 'updated_at': '2026-11-07T14:31:00.000Z', 'staff_name': 'Officer'},
      };
      final once = alert.withStatusEvent(event);
      final twice = once.withStatusEvent(event);
      expect(twice.history, hasLength(2));
      expect(twice.status, 'RECEIVED');
      expect(twice.isOpen, isTrue);
    });
  });
}
