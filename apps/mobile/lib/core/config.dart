import 'package:latlong2/latlong.dart';

/// Build-time configuration passed with `--dart-define` (see README).
/// Only public values belong here: the Supabase anon key is designed to be
/// shipped in apps; the service-role key and database URL never are.
class AppConfig {
  const AppConfig._();

  static const apiUrl = String.fromEnvironment('API_URL', defaultValue: 'http://10.0.2.2:4000');
  static const supabaseUrl = String.fromEnvironment('SUPABASE_URL', defaultValue: 'http://10.0.2.2:54321');
  static const supabaseAnonKey = String.fromEnvironment('SUPABASE_ANON_KEY');
  static const tileUrl = String.fromEnvironment(
    'TILE_URL',
    defaultValue: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
  );

  /// Firebase (optional). Without these, push notifications are disabled and
  /// grace-period prompts reach the app over Socket.io only.
  static const firebaseApiKey = String.fromEnvironment('FIREBASE_API_KEY');
  static const firebaseAppId = String.fromEnvironment('FIREBASE_APP_ID');
  static const firebaseSenderId = String.fromEnvironment('FIREBASE_SENDER_ID');
  static const firebaseProjectId = String.fromEnvironment('FIREBASE_PROJECT_ID');

  static bool get firebaseConfigured =>
      firebaseApiKey.isNotEmpty && firebaseAppId.isNotEmpty && firebaseSenderId.isNotEmpty && firebaseProjectId.isNotEmpty;

  /// Initial map centre: Universiti Sains Malaysia main campus, Penang
  /// (approximate; only used to position the map before GPS is available).
  static const campusCenter = LatLng(5.3559, 100.3025);
}
