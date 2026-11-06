import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

/// Supabase Auth for students and staff (proposal: Supabase Auth).
class AuthService extends ChangeNotifier {
  AuthService(this._auth) {
    _sub = _auth.onAuthStateChange.listen((_) => notifyListeners());
  }

  final GoTrueClient _auth;
  late final StreamSubscription<AuthState> _sub;

  bool get isSignedIn => _auth.currentSession != null;
  String? get accessToken => _auth.currentSession?.accessToken;
  String? get email => _auth.currentUser?.email;

  Future<void> signIn(String email, String password) async {
    try {
      await _auth.signInWithPassword(email: email.trim(), password: password);
    } on AuthException catch (e) {
      throw AuthFailure(e.message == 'Invalid login credentials' ? 'Email or password is incorrect.' : e.message);
    }
  }

  /// Returns true when the account still needs email confirmation.
  Future<bool> register({
    required String email,
    required String password,
    required String fullName,
    required String matricOrStaffId,
    required String phoneNumber,
  }) async {
    try {
      final res = await _auth.signUp(
        email: email.trim(),
        password: password,
        // Copied into public.app_user by the on_auth_user_created trigger.
        data: {'full_name': fullName.trim(), 'matric_or_staff_id': matricOrStaffId.trim(), 'phone_number': phoneNumber.trim()},
      );
      return res.session == null;
    } on AuthException catch (e) {
      throw AuthFailure(e.message);
    }
  }

  Future<void> signOut() => _auth.signOut();

  @override
  void dispose() {
    _sub.cancel();
    super.dispose();
  }
}

class AuthFailure implements Exception {
  const AuthFailure(this.message);
  final String message;
  @override
  String toString() => message;
}
