import 'package:flutter/material.dart';

import '../core/constants.dart';
import '../core/theme.dart';

enum BadgeTone { neutral, warning, danger, done }

/// A status word with its icon (Dusk): sentence case, never colour alone.
/// Periwinkle for done or safe, apricot for open or needing attention.
class StatusBadge extends StatelessWidget {
  const StatusBadge(this.label, {super.key, this.tone = BadgeTone.neutral});

  final String label;
  final BadgeTone tone;

  @override
  Widget build(BuildContext context) {
    final (Color color, IconData? icon) = switch (tone) {
      BadgeTone.warning => (SwColors.alert, Icons.hourglass_bottom_rounded),
      BadgeTone.danger => (SwColors.alert, Icons.sos_rounded),
      BadgeTone.done => (SwColors.primary, Icons.check_circle_outline_rounded),
      BadgeTone.neutral => (SwColors.text2, null),
    };
    return Row(mainAxisSize: MainAxisSize.min, children: [
      if (icon != null) ...[Icon(icon, size: 16, color: color), const SizedBox(width: 6)],
      Text(label, style: TextStyle(color: color, fontSize: 14, fontWeight: FontWeight.w500)),
    ]);
  }
}

/// Label and tone for a trip status.
(String, BadgeTone) tripStatusBadge(String status, {String? endReason}) => switch (status) {
      TripStatus.active => ('On the way', BadgeTone.neutral),
      TripStatus.gracePrompt => ('Check-in needed', BadgeTone.warning),
      TripStatus.escalated => ('Alert raised', BadgeTone.danger),
      TripStatus.completed => (endReason == 'ARRIVED' ? 'Arrived' : 'Confirmed safe', BadgeTone.done),
      TripStatus.cancelled => ('Cancelled', BadgeTone.neutral),
      _ => (status, BadgeTone.neutral),
    };

class ErrorView extends StatelessWidget {
  const ErrorView({super.key, required this.message, this.onRetry});
  final String message;
  final VoidCallback? onRetry;

  @override
  Widget build(BuildContext context) => Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(mainAxisSize: MainAxisSize.min, children: [
            const Icon(Icons.cloud_off_rounded, color: SwColors.textMuted, size: 32),
            const SizedBox(height: 12),
            Text(message, textAlign: TextAlign.center),
            if (onRetry != null) ...[
              const SizedBox(height: 16),
              OutlinedButton(onPressed: onRetry, style: OutlinedButton.styleFrom(minimumSize: const Size(140, 44)), child: const Text('Try again')),
            ],
          ]),
        ),
      );
}

class EmptyView extends StatelessWidget {
  const EmptyView({super.key, required this.icon, required this.title, required this.message, this.action});
  final IconData icon;
  final String title;
  final String message;
  final Widget? action;

  @override
  Widget build(BuildContext context) => Center(
        child: Padding(
          padding: const EdgeInsets.all(32),
          child: Column(mainAxisSize: MainAxisSize.min, children: [
            Icon(icon, color: SwColors.textMuted, size: 36),
            const SizedBox(height: 12),
            Text(title, style: Theme.of(context).textTheme.titleMedium, textAlign: TextAlign.center),
            const SizedBox(height: 6),
            Text(message, style: Theme.of(context).textTheme.bodySmall, textAlign: TextAlign.center),
            if (action != null) ...[const SizedBox(height: 20), action!],
          ]),
        ),
      );
}

void showMessage(BuildContext context, String message) =>
    ScaffoldMessenger.of(context)..hideCurrentSnackBar()..showSnackBar(SnackBar(content: Text(message)));

/// The SafeWalk wordmark: the product name in the display face, sentence case.
class Wordmark extends StatelessWidget {
  const Wordmark({super.key, this.size = 18});
  final double size;

  @override
  Widget build(BuildContext context) => Text(
        'SafeWalk',
        style: TextStyle(fontFamily: 'WixMadeforDisplay', fontSize: size, fontWeight: FontWeight.w600, letterSpacing: -0.3, color: SwColors.text),
      );
}
