import 'dart:async';
import 'dart:convert';
import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:latlong2/latlong.dart';
import 'package:provider/provider.dart';
import 'package:safewalk/core/api_client.dart';
import 'package:safewalk/core/constants.dart';
import 'package:safewalk/data/models.dart';
import 'package:safewalk/data/repositories.dart';
import 'package:safewalk/features/incidents/my_reports_screen.dart';
import 'package:safewalk/features/incidents/report_incident_screen.dart';
import 'package:safewalk/services/location_service.dart';
import 'package:safewalk/services/realtime_service.dart';

import 'fakes.dart';

Map<String, dynamic> incidentJson({String status = 'VERIFIED', String severity = 'HIGH', int? distance}) => {
      'group_id': 'g1',
      'category': 'HARASSMENT',
      'severity_level': severity,
      'status': status,
      'auto_verified': true,
      'report_count': 3,
      'location': {'lat': 5.3561, 'lng': 100.3021},
      'first_reported_at': '2026-11-10T13:00:00.000Z',
      'last_reported_at': '2026-11-10T13:10:00.000Z',
      'reviewed_at': '2026-11-10T13:10:00.000Z',
      'resolved_at': null,
      'public_note': null,
      'distance_from_route_m': ?distance,
    };

Map<String, dynamic> myReportJson({String status = 'PENDING', String id = 'r1'}) => {
      'report_id': id,
      'group_id': 'g1',
      'category': 'BROKEN_LIGHTING',
      'severity_level': 'LOW',
      'description': 'Lights out behind the library',
      'is_anonymous': true,
      'has_photo': false,
      'location': {'lat': 5.3561, 'lng': 100.3021},
      'submitted_at': '2026-11-10T13:00:00.000Z',
      'status': status,
      'auto_verified': false,
      'report_count': 1,
      'reviewed_at': null,
      'resolved_at': null,
      'public_note': null,
    };

/// A valid 1x1 PNG, so the photo preview can decode it.
const onePixelPng = [137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82, 0, 0, 0, 1, 0, 0, 0, 1, 8, 2, 0, 0, 0, 144, 119, 83, 222, 0, 0, 0, 12, 73, 68, 65, 84, 120, 156, 99, 16, 80, 48, 0, 0, 0, 164, 0, 97, 52, 102, 125, 114, 0, 0, 0, 0, 73, 69, 78, 68, 174, 66, 96, 130];

/// HTTP fake that records requests and answers per path.
class Recorder {
  final requests = <http.Request>[];
  late final client = MockClient((req) async {
    requests.add(req);
    final path = req.url.path;
    if (path == '/api/incidents' && req.method == 'POST') return http.Response(jsonEncode(myReportJson()), 201);
    if (path.endsWith('/photo')) return http.Response(jsonEncode({'report_id': 'r1', 'has_photo': true}), 201);
    if (path == '/api/incidents/map') {
      return http.Response(jsonEncode({'incidents': [incidentJson()], 'truncated': false}), 200);
    }
    if (path == '/api/incidents/mine') return http.Response(jsonEncode({'reports': [myReportJson()]}), 200);
    return http.Response('{}', 404);
  });
  late final repo = IncidentsRepository(ApiClient(httpClient: client, tokenProvider: () => 't', baseUrl: 'http://api.test'));
}

void main() {
  group('incident models', () {
    test('parse an incident, a report and route hazards', () {
      final i = Incident.fromJson(incidentJson(distance: 18));
      expect(i.category, 'HARASSMENT');
      expect(i.location, const LatLng(5.3561, 100.3021));
      expect(i.autoVerified, isTrue);
      expect(i.distanceFromRouteM, 18);

      final r = MyReport.fromJson(myReportJson());
      expect(r.isAnonymous, isTrue);
      expect(r.status, IncidentStatus.pending);
      expect(r.copyWith(status: 'VERIFIED').status, 'VERIFIED');

      final route = RoutePreview.fromJson({
        'geometry': {
          'type': 'LineString',
          'coordinates': [
            [100.3021, 5.3561],
            [100.3049, 5.3592],
          ],
        },
        'distance_m': 600,
        'duration_s': 480,
        'source': 'OSRM',
        'hazards': [incidentJson(distance: 12)],
      });
      expect(route.hazards.single.distanceFromRouteM, 12);
      // Older servers without hazards still parse.
      expect(RoutePreview.fromJson({'geometry': null, 'distance_m': 1, 'duration_s': 1, 'source': 'OSRM'}).hazards, isEmpty);
    });
  });

  group('incidents repository', () {
    test('asks only for the visible area', () async {
      final rec = Recorder();
      final result = await rec.repo.inArea(south: 5.35, west: 100.29, north: 5.36, east: 100.31);
      expect(result.incidents.single.id, 'g1');
      final q = rec.requests.single.url.queryParameters;
      expect(q, {'south': '5.350000', 'west': '100.290000', 'north': '5.360000', 'east': '100.310000'});
    });

    test('sends a report with its idempotency key, and the photo as raw bytes', () async {
      final rec = Recorder();
      await rec.repo.submit(
        category: 'THEFT',
        severity: 'MEDIUM',
        description: '  Bike stolen  ',
        location: const LatLng(5.3561, 100.3021),
        anonymous: true,
        requestId: 'key-1',
        accuracyM: 6,
      );
      final body = jsonDecode(rec.requests.single.body) as Map<String, dynamic>;
      expect(body['client_request_id'], 'key-1');
      expect(body['is_anonymous'], isTrue);
      expect(body['description'], 'Bike stolen');
      expect(body['accuracy_m'], 6);

      await rec.repo.attachPhoto('r1', [0xff, 0xd8, 0xff]);
      final photo = rec.requests.last;
      expect(photo.url.path, '/api/incidents/reports/r1/photo');
      expect(photo.headers['Content-Type'], 'image/jpeg');
      expect(photo.bodyBytes, [0xff, 0xd8, 0xff]);
    });
  });

  group('report form', () {
    Future<Recorder> pumpForm(WidgetTester tester, {Uint8List? photo}) async {
      // A tall screen so the whole form is laid out (dragging would pan the map).
      tester.view.physicalSize = const Size(800, 3000);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.reset);
      final rec = Recorder();
      final router = GoRouter(routes: [
        GoRoute(path: '/', builder: (_, _) => ReportIncidentScreen(pickPhoto: (_) async => photo)),
        GoRoute(path: '/incidents/mine', builder: (_, _) => const Scaffold(body: Text('My reports page'))),
      ]);
      await tester.pumpWidget(MultiProvider(
        providers: [
          Provider<LocationSource>.value(value: FakeLocation()),
          Provider.value(value: rec.repo),
        ],
        child: MaterialApp.router(routerConfig: router),
      ));
      await tester.pumpAndSettle();
      return rec;
    }

    Future<void> reveal(WidgetTester tester, String label) => tester.ensureVisible(find.text(label));

    Future<void> send(WidgetTester tester) async {
      await reveal(tester, 'Send report');
      await tester.tap(find.text('Send report'));
      await tester.pumpAndSettle();
    }

    testWidgets('asks for what happened and a description before sending', (tester) async {
      final rec = await pumpForm(tester);
      await send(tester);
      expect(find.text('Choose what happened.'), findsOneWidget);
      await tester.tap(find.text('Theft'));
      await tester.pump();
      await send(tester);
      expect(find.text('Describe what happened.'), findsOneWidget);
      expect(rec.requests, isEmpty);
    });

    testWidgets('sends an anonymous report at the GPS position, with a photo', (tester) async {
      final rec = await pumpForm(tester, photo: Uint8List.fromList(onePixelPng));
      await tester.tap(find.text('Broken lighting'));
      await tester.tap(find.text('Low'));
      await tester.tap(find.byType(TextField));
      await tester.pump();
      await tester.enterText(find.byType(TextField), 'Three lights out on the path');
      await tester.pump();

      expect(find.text('Three lights out on the path'), findsOneWidget);
      await reveal(tester, 'Report anonymously');
      await tester.tap(find.text('Report anonymously'));
      await reveal(tester, 'Add a photo (optional)');
      await tester.tap(find.text('Add a photo (optional)'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Choose from gallery'));
      await tester.pumpAndSettle();
      expect(find.byTooltip('Remove photo'), findsOneWidget);

      await send(tester);
      final report = jsonDecode(rec.requests.first.body) as Map<String, dynamic>;
      expect(report['category'], 'BROKEN_LIGHTING');
      expect(report['severity_level'], 'LOW');
      expect(report['is_anonymous'], isTrue);
      expect(report['location'], {'lat': 5.3561, 'lng': 100.3021}); // FakeLocation's fix
      expect(report['accuracy_m'], 7);
      expect(report['client_request_id'], isNotEmpty);
      expect(rec.requests[1].url.path, '/api/incidents/reports/r1/photo');
      expect(find.text('My reports page'), findsOneWidget);
    });
  });

  testWidgets('my reports follow status changes live', (tester) async {
    final rec = Recorder();
    final realtime = FakeRealtime();
    await tester.pumpWidget(MultiProvider(
      providers: [
        Provider.value(value: rec.repo),
        Provider<RealtimeChannel>.value(value: realtime),
      ],
      child: const MaterialApp(home: MyReportsScreen()),
    ));
    await tester.pumpAndSettle();
    expect(find.text('Waiting for review'), findsOneWidget);
    expect(find.text('Anonymous'), findsOneWidget);

    realtime.push(SocketEvents.incidentStatus, {'report_id': 'r1', 'status': 'VERIFIED', 'auto_verified': false, 'public_note': 'Lights repaired soon'});
    await tester.pumpAndSettle();
    expect(find.text('Verified by USM Security'), findsOneWidget);
    expect(find.text('From USM Security: Lights repaired soon'), findsOneWidget);
    unawaited(realtime.events$.close());
  });
}
