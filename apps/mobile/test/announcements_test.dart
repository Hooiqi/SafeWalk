import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:provider/provider.dart';
import 'package:safewalk/core/api_client.dart';
import 'package:safewalk/core/constants.dart';
import 'package:safewalk/data/models.dart';
import 'package:safewalk/data/repositories.dart';
import 'package:safewalk/features/announcements/announcement_ui.dart';
import 'package:safewalk/features/announcements/announcements_controller.dart';
import 'package:safewalk/features/announcements/announcements_screen.dart';

import 'fakes.dart';

final now = DateTime.parse('2026-11-11T12:00:00Z');

Map<String, dynamic> announcementJson(
  String id, {
  String priority = 'INFO',
  String title = 'Sample notice',
  String published = '2026-11-11T10:00:00.000Z',
  String? expires,
}) =>
    {
      'announce_id': id,
      'title': title,
      'message_body': 'Sample message for $id',
      'priority': priority,
      'published_at': published,
      'expires_at': expires,
      'updated_at': published,
    };

AnnouncementsRepository repoReturning(List<Map<String, dynamic>> list, {int status = 200}) => AnnouncementsRepository(
      ApiClient(
        httpClient: MockClient((req) async => req.url.path == '/api/announcements'
            ? http.Response(jsonEncode(status == 200 ? {'announcements': list} : {'error': {'code': 'X', 'message': 'Server unavailable'}}), status)
            : http.Response('{}', 404)),
        tokenProvider: () => 't',
        baseUrl: 'http://api.test',
      ),
    );

void main() {
  test('parses an announcement and knows when it is live', () {
    final a = Announcement.fromJson(announcementJson('a1', priority: 'URGENT', expires: '2026-11-11T13:00:00.000Z'));
    expect(a.isUrgent, isTrue);
    expect(a.isLiveAt(now), isTrue);
    expect(a.isLiveAt(DateTime.parse('2026-11-11T13:00:01Z')), isFalse);
    expect(a.isLiveAt(DateTime.parse('2026-11-11T09:00:00Z')), isFalse);
  });

  group('announcements controller', () {
    test('lists urgent ones first, then newest first, and hides expired ones', () async {
      final realtime = FakeRealtime();
      final c = AnnouncementsController(
        repoReturning([
          announcementJson('old', published: '2026-11-11T08:00:00.000Z'),
          announcementJson('new', published: '2026-11-11T11:00:00.000Z'),
          announcementJson('urgent', priority: 'URGENT', published: '2026-11-11T07:00:00.000Z'),
          announcementJson('ended', published: '2026-11-11T09:00:00.000Z', expires: '2026-11-11T11:30:00.000Z'),
        ]),
        realtime,
        clock: () => now,
      );
      await c.load();
      expect(c.items.map((a) => a.id), ['urgent', 'new', 'old']);
      c.dispose();
    });

    test('adds announcements that go live, applies edits and removes withdrawn ones', () async {
      final realtime = FakeRealtime();
      final c = AnnouncementsController(repoReturning([announcementJson('a1')]), realtime, clock: () => now);
      await c.load();

      realtime.push(SocketEvents.announcementLive, {'announcement': announcementJson('a2', priority: 'URGENT', title: 'Avoid the sample car park')});
      await Future<void>.delayed(Duration.zero);
      expect(c.items.map((a) => a.title), ['Avoid the sample car park', 'Sample notice']);

      realtime.push(SocketEvents.announcementUpdated, {'announcement': announcementJson('a1', title: 'Edited notice'), 'state': 'LIVE'});
      await Future<void>.delayed(Duration.zero);
      expect(c.items.last.title, 'Edited notice');

      realtime.push(SocketEvents.announcementUpdated, {'announcement': announcementJson('a2', priority: 'URGENT'), 'state': 'WITHDRAWN'});
      await Future<void>.delayed(Duration.zero);
      expect(c.items.map((a) => a.id), ['a1']);
      c.dispose();
    });

    test('keeps the last list and reports the error when loading fails', () async {
      final c = AnnouncementsController(repoReturning(const [], status: 503), FakeRealtime(), clock: () => now);
      await c.load();
      expect(c.loaded, isTrue);
      expect(c.error, 'Server unavailable');
      expect(c.items, isEmpty);
      c.dispose();
    });
  });

  testWidgets('a card shows the priority as a word, the title and the message', (tester) async {
    await tester.pumpWidget(MaterialApp(
      home: Scaffold(body: AnnouncementCard(announcement: Announcement.fromJson(announcementJson('a1', priority: 'ADVISORY', title: 'Path lights out')))),
    ));
    expect(find.text('Advisory · USM Security'), findsOneWidget);
    expect(find.text('Path lights out'), findsOneWidget);
    expect(find.text('Sample message for a1'), findsOneWidget);
    expect(find.byIcon(Icons.warning_amber_rounded), findsOneWidget);
  });

  testWidgets('the announcements screen lists live notices, or says there are none', (tester) async {
    final full = AnnouncementsController(
      repoReturning([announcementJson('a1', title: 'Exam week patrols'), announcementJson('a2', priority: 'URGENT', title: 'Avoid the sample car park')]),
      FakeRealtime(),
      clock: () => now,
    );
    await tester.pumpWidget(ChangeNotifierProvider.value(value: full, child: const MaterialApp(home: AnnouncementsScreen())));
    await tester.pumpAndSettle();
    expect(find.text('Avoid the sample car park'), findsOneWidget);
    expect(find.text('Exam week patrols'), findsOneWidget);
    expect(
      tester.getTopLeft(find.text('Avoid the sample car park')).dy < tester.getTopLeft(find.text('Exam week patrols')).dy,
      isTrue,
      reason: 'urgent first',
    );

    final empty = AnnouncementsController(repoReturning(const []), FakeRealtime(), clock: () => now);
    // A new screen (as when the route is opened again) loads the new list.
    await tester.pumpWidget(ChangeNotifierProvider.value(value: empty, child: MaterialApp(key: UniqueKey(), home: const AnnouncementsScreen())));
    await tester.pumpAndSettle();
    expect(find.text('No announcements right now'), findsOneWidget);
  });
}
