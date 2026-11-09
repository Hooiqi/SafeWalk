import 'package:go_router/go_router.dart';

import 'data/models.dart';
import 'features/auth/login_screen.dart';
import 'features/auth/register_screen.dart';
import 'features/auth/welcome_screen.dart';
import 'features/contacts/contact_form_screen.dart';
import 'features/contacts/contacts_screen.dart';
import 'features/history/history_screen.dart';
import 'features/announcements/announcements_screen.dart';
import 'features/incidents/my_reports_screen.dart';
import 'features/incidents/report_incident_screen.dart';
import 'features/incidents/safety_map_screen.dart';
import 'features/home/home_screen.dart';
import 'features/journey/active_journey_screen.dart';
import 'features/journey/start_journey_screen.dart';
import 'features/profile/profile_screen.dart';
import 'features/safe_points/safe_points_screen.dart';
import 'features/sos/sos_screen.dart';
import 'features/shell/app_shell.dart';
import 'services/auth_service.dart';

const _publicRoutes = {'/welcome', '/login', '/register'};

GoRouter buildRouter(AuthService auth) => GoRouter(
      initialLocation: '/',
      refreshListenable: auth,
      redirect: (context, state) {
        final public = _publicRoutes.contains(state.matchedLocation);
        if (!auth.isSignedIn && !public) return '/welcome';
        if (auth.isSignedIn && public) return '/';
        return null;
      },
      routes: [
        GoRoute(path: '/welcome', builder: (_, _) => const WelcomeScreen()),
        GoRoute(path: '/login', builder: (_, _) => const LoginScreen()),
        GoRoute(path: '/register', builder: (_, _) => const RegisterScreen()),
        GoRoute(path: '/journey', builder: (_, _) => const ActiveJourneyScreen()),
        GoRoute(path: '/journey/start', builder: (_, _) => const StartJourneyScreen()),
        GoRoute(path: '/contacts/new', builder: (_, _) => const ContactFormScreen()),
        GoRoute(path: '/contacts/edit', builder: (_, state) => ContactFormScreen(contact: state.extra as TrustedContact?)),
        GoRoute(path: '/history', builder: (_, _) => const HistoryScreen()),
        GoRoute(path: '/incidents', builder: (_, _) => const SafetyMapScreen()),
        GoRoute(path: '/incidents/report', builder: (_, _) => const ReportIncidentScreen()),
        GoRoute(path: '/incidents/mine', builder: (_, _) => const MyReportsScreen()),
        GoRoute(path: '/announcements', builder: (_, _) => const AnnouncementsScreen()),
        StatefulShellRoute.indexedStack(
          builder: (_, _, shell) => AppShell(shell: shell),
          branches: [
            StatefulShellBranch(routes: [GoRoute(path: '/', builder: (_, _) => const HomeScreen())]),
            StatefulShellBranch(routes: [GoRoute(path: '/safe-points', builder: (_, _) => const SafePointsScreen())]),
            StatefulShellBranch(routes: [GoRoute(path: '/sos', builder: (_, _) => const SosScreen())]),
            StatefulShellBranch(routes: [GoRoute(path: '/contacts', builder: (_, _) => const ContactsScreen())]),
            StatefulShellBranch(routes: [GoRoute(path: '/profile', builder: (_, _) => const ProfileScreen())]),
          ],
        ),
      ],
    );
