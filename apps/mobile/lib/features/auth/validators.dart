// Form validation shared by registration, profile and contact forms.

final _email = RegExp(r'^[^@\s]+@[^@\s]+\.[^@\s]+$');
final _phone = RegExp(r'^\+[1-9][0-9]{6,14}$');

String? requiredText(String? v, String field) => (v == null || v.trim().isEmpty) ? 'Enter your $field' : null;

String? validateEmail(String? v) {
  if (v == null || v.trim().isEmpty) return 'Enter your email';
  return _email.hasMatch(v.trim()) ? null : 'Enter a valid email address';
}

/// International format, as stored by the server (e.g. +60123456789).
String? validatePhone(String? v, {bool required = true}) {
  if (v == null || v.trim().isEmpty) return required ? 'Enter a phone number' : null;
  return _phone.hasMatch(v.trim()) ? null : 'Use international format, e.g. +60123456789';
}

String? validatePassword(String? v) {
  if (v == null || v.isEmpty) return 'Enter a password';
  return v.length < 8 ? 'Use at least 8 characters' : null;
}
