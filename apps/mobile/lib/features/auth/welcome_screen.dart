import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../core/theme.dart';
import '../../widgets/common.dart';

class WelcomeScreen extends StatelessWidget {
  const WelcomeScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    return Scaffold(
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(24, 32, 24, 24),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            const Wordmark(size: 16),
            const Spacer(),
            Text('Campus safety,\nconnected.', style: text.headlineMedium?.copyWith(fontWeight: FontWeight.w700, height: 1.15)),
            const SizedBox(height: 12),
            Text(
              'Share your walk across USM with people you trust. If you do not arrive on time and do not respond, '
              'SafeWalk alerts them and the USM Security Department with your last known location.',
              style: text.bodyLarge?.copyWith(color: SwColors.textMuted),
            ),
            const SizedBox(height: 28),
            const _Point(icon: Icons.route_rounded, text: 'Live journey link for your trusted contacts, no app needed'),
            const _Point(icon: Icons.timer_outlined, text: 'Arrival watched by the server, even if your phone dies'),
            const _Point(icon: Icons.shield_outlined, text: 'Overdue journeys go straight to USM Security'),
            const Spacer(),
            FilledButton(onPressed: () => context.go('/register'), child: const Text('Create account')),
            const SizedBox(height: 12),
            OutlinedButton(onPressed: () => context.go('/login'), child: const Text('Sign in')),
          ]),
        ),
      ),
    );
  }
}

class _Point extends StatelessWidget {
  const _Point({required this.icon, required this.text});
  final IconData icon;
  final String text;

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.only(bottom: 14),
        child: Row(children: [
          Icon(icon, color: SwColors.secondary, size: 22),
          const SizedBox(width: 14),
          Expanded(child: Text(text)),
        ]),
      );
}
