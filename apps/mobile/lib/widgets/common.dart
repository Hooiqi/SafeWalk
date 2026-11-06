import 'package:flutter/material.dart';

import '../core/constants.dart';
import '../core/theme.dart';

enum BadgeTone { neutral, warning, danger, done }

/// Status label that always pairs colour with text (never colour alone).
class StatusBadge extends StatelessWidget {
  const StatusBadge(this.label, {super.key, this.tone = BadgeTone.neutral});

  final String label;
  final BadgeTone tone;

  @override
  Widget build(BuildContext context) {
    final color = switch (tone) {
      BadgeTone.warning => SwColors.secondary,
      BadgeTone.danger => SwColors.primary,
      BadgeTone.done => SwColors.textMuted,
      BadgeTone.neutral => SwColors.text,
    };
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(
        color: tone == BadgeTone.neutral || tone == BadgeTone.done ? null : color.withValues(alpha: 0.12),
        border: Border.all(color: tone == BadgeTone.neutral || tone == BadgeTone.done ? SwColors.border : color.withValues(alpha: 0.45)),
        borderRadius: BorderRadius.circular(6),
      ),
      child: Row(mainAxisSize: MainAxisSize.min, children: [
        Container(width: 7, height: 7, decoration: BoxDecoration(color: color, shape: BoxShape.circle)),
        const SizedBox(width: 6),
        Text(label.toUpperCase(),
            style: TextStyle(color: color, fontSize: 11.5, fontWeight: FontWeight.w700, letterSpacing: 0.5)),
      ]),
    );
  }
}

/// Label and tone for a trip status.
(String, BadgeTone) tripStatusBadge(String status, {String? endReason}) => switch (status) {
      TripStatus.active => ('On the way', BadgeTone.neutral),
      TripStatus.gracePrompt => ('Check-in needed', BadgeTone.warning),
      TripStatus.escalated => ('Alert raised', BadgeTone.danger),
      TripStatus.completed => (endReason == 'ARRIVED' ? 'Arrived' : 'Confirmed safe', BadgeTone.done),
      TripStatus.cancelled => ('Cancelled', BadgeTone.done),
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

/// The "SAFEWALK" wordmark with the palette gradient.
class Wordmark extends StatelessWidget {
  const Wordmark({super.key, this.size = 14});
  final double size;

  @override
  Widget build(BuildContext context) => ShaderMask(
        shaderCallback: (rect) => SwColors.gradient.createShader(rect),
        child: Text('SAFEWALK',
            style: TextStyle(fontSize: size, fontWeight: FontWeight.w800, letterSpacing: size * 0.12, color: Colors.white)),
      );
}
