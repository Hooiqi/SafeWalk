import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';
import 'package:supabase_flutter/supabase_flutter.dart' hide RealtimeChannel;

import 'core/api_client.dart';
import 'core/config.dart';
import 'core/theme.dart';
import 'data/repositories.dart';
import 'features/announcements/announcements_controller.dart';
import 'features/contacts/contacts_controller.dart';
import 'router.dart';
import 'services/auth_service.dart';
import 'services/location_service.dart';
import 'services/phone_dialer.dart';
import 'services/push_service.dart';
import 'services/sos_controller.dart';
import 'services/realtime_service.dart';
import 'services/trip_tracker.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  if (AppConfig.supabaseAnonKey.isEmpty) {
    runApp(const _MisconfiguredApp());
    return;
  }
  await Supabase.initialize(url: AppConfig.supabaseUrl, publishableKey: AppConfig.supabaseAnonKey);
  await PushService.initialise();
  runApp(SafeWalkApp(auth: AuthService(Supabase.instance.client.auth)));
}

class SafeWalkApp extends StatefulWidget {
  const SafeWalkApp({super.key, required this.auth});
  final AuthService auth;
  @override
  State<SafeWalkApp> createState() => _SafeWalkAppState();
}

class _SafeWalkAppState extends State<SafeWalkApp> {
  late final GoRouter _router = buildRouter(widget.auth);
  late final ApiClient _api = ApiClient();
  late final TripsRepository _trips = TripsRepository(_api);
  late final ProfileRepository _profiles = ProfileRepository(_api);
  late final LocationSource _location = GeolocatorLocationSource();
  late final RealtimeService _realtime = RealtimeService(tokenProvider: () => widget.auth.accessToken);
  late final TripTracker _tracker = TripTracker(trips: _trips, location: _location, realtime: _realtime);
  late final SosController _sos = SosController(sos: SosRepository(_api), location: _location, realtime: _realtime);
  bool _wasSignedIn = false;

  @override
  void initState() {
    super.initState();
    widget.auth.addListener(_onAuthChanged);
    _onAuthChanged();
  }

  // The real-time connection exists only while someone is signed in.
  void _onAuthChanged() {
    final signedIn = widget.auth.isSignedIn;
    if (signedIn && !_wasSignedIn) {
      _realtime.connect();
      PushService.registerDevice(_profiles);
      // Pick up a journey or SOS that is still open on the server (app restart).
      _tracker.resume().catchError((_) {});
      _sos.resume().catchError((_) {});
    } else if (!signedIn && _wasSignedIn) {
      _realtime.disconnect();
    }
    _wasSignedIn = signedIn;
  }

  @override
  void dispose() {
    widget.auth.removeListener(_onAuthChanged);
    _tracker.dispose();
    _sos.dispose();
    _realtime.disconnect();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return MultiProvider(
      providers: [
        ChangeNotifierProvider.value(value: widget.auth),
        Provider.value(value: _trips),
        Provider.value(value: _profiles),
        Provider.value(value: _location),
        Provider.value(value: SafePointsRepository(_api)),
        Provider.value(value: IncidentsRepository(_api)),
        Provider<RealtimeChannel>.value(value: _realtime),
        Provider.value(value: const PhoneDialer()),
        ChangeNotifierProvider(create: (_) => ContactsController(ContactsRepository(_api))),
        ChangeNotifierProvider.value(value: _tracker),
        ChangeNotifierProvider.value(value: _sos),
        ChangeNotifierProvider(create: (_) => AnnouncementsController(AnnouncementsRepository(_api), _realtime)),
      ],
      child: MaterialApp.router(
        title: 'SafeWalk',
        debugShowCheckedModeBanner: false,
        theme: buildSafeWalkTheme(),
        routerConfig: _router,
      ),
    );
  }
}

class _MisconfiguredApp extends StatelessWidget {
  const _MisconfiguredApp();
  @override
  Widget build(BuildContext context) => MaterialApp(
        theme: buildSafeWalkTheme(),
        home: const Scaffold(
          body: Center(
            child: Padding(
              padding: EdgeInsets.all(24),
              child: Text(
                'SafeWalk is not configured.\nRun with --dart-define-from-file=env/dev.json (see apps/mobile/README.md).',
                textAlign: TextAlign.center,
              ),
            ),
          ),
        ),
      );
}
