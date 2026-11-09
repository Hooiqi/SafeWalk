import 'package:url_launcher/url_launcher.dart';

/// Opens the phone's dialer with the number filled in (proposal: one-tap
/// emergency calling). Android and iOS require the user to confirm a call that
/// an app starts, so this is one tap in SafeWalk plus the dialer's call button.
class PhoneDialer {
  const PhoneDialer();

  Future<bool> call(String number) async {
    final uri = Uri(scheme: 'tel', path: number.replaceAll(RegExp(r'[^+0-9]'), ''));
    try {
      return await launchUrl(uri);
    } catch (_) {
      return false;
    }
  }
}

/// "+6046534999" -> "+604-653 4999" (Malaysian landline display format).
String formatPhone(String e164) {
  final m = RegExp(r'^\+60(\d)(\d{3})(\d{4})$').firstMatch(e164);
  if (m != null) return '+60${m[1]}-${m[2]} ${m[3]}';
  return e164;
}
