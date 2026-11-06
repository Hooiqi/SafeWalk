import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart';

import '../core/config.dart';
import '../data/repositories.dart';

/// Firebase Cloud Messaging (proposal: grace-period check-in notifications).
/// Disabled unless the Firebase dart-defines are provided; the grace prompt
/// still reaches the open app over Socket.io without it.
class PushService {
  static bool _initialised = false;

  static Future<void> initialise() async {
    if (!AppConfig.firebaseConfigured || _initialised) return;
    try {
      await Firebase.initializeApp(
        options: const FirebaseOptions(
          apiKey: AppConfig.firebaseApiKey,
          appId: AppConfig.firebaseAppId,
          messagingSenderId: AppConfig.firebaseSenderId,
          projectId: AppConfig.firebaseProjectId,
        ),
      );
      _initialised = true;
    } catch (e) {
      debugPrint('Firebase not initialised: $e');
    }
  }

  /// Asks for notification permission and registers this device with the server.
  static Future<void> registerDevice(ProfileRepository profiles) async {
    if (!_initialised) return;
    try {
      final messaging = FirebaseMessaging.instance;
      await messaging.requestPermission();
      // getToken() returns an FCM registration token, which is what the
      // server's firebase-admin send(token: ...) expects. The newer
      // register()/onRegistered API returns an installation id instead;
      // migrate both sides together when the server supports it.
      // ignore: deprecated_member_use
      final token = await messaging.getToken();
      if (token != null) await profiles.registerPushToken(token);
      // ignore: deprecated_member_use
      messaging.onTokenRefresh.listen(profiles.registerPushToken);
    } catch (e) {
      debugPrint('Push registration failed: $e');
    }
  }
}
