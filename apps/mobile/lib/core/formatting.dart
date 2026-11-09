import 'package:intl/intl.dart';

final _time = DateFormat('h:mm a');
final _dateTime = DateFormat('d MMM, h:mm a');

String formatTime(DateTime? t) => t == null ? 'Not recorded' : _time.format(t.toLocal());
String formatDateTime(DateTime? t) => t == null ? 'Not recorded' : _dateTime.format(t.toLocal());

/// "45 s", "8 min", "1 h 05 min"
String formatDuration(Duration d) {
  final s = d.inSeconds < 0 ? 0 : d.inSeconds;
  if (s < 60) return '$s s';
  final m = s ~/ 60;
  if (m < 60) return '$m min';
  return '${m ~/ 60} h ${(m % 60).toString().padLeft(2, '0')} min';
}

/// "mm:ss" countdown for the grace period.
String formatCountdown(Duration d) {
  final s = d.inSeconds < 0 ? 0 : d.inSeconds;
  return '${(s ~/ 60).toString().padLeft(2, '0')}:${(s % 60).toString().padLeft(2, '0')}';
}

String formatDistance(num? metres) {
  if (metres == null) return 'Unknown';
  return metres < 1000 ? '${metres.round()} m' : '${(metres / 1000).toStringAsFixed(1)} km';
}
