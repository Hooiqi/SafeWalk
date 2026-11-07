import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';
import 'package:share_plus/share_plus.dart';

import '../../core/api_client.dart';
import '../../core/config.dart';
import '../../core/constants.dart';
import '../../core/formatting.dart';
import '../../core/theme.dart';
import '../../data/models.dart';
import '../../services/phone_dialer.dart';
import '../../services/sos_controller.dart';
import '../../widgets/common.dart';
import '../../widgets/hold_to_confirm_button.dart';

/// Module 2: hold-to-confirm SOS, silent SOS and one-tap emergency calling.
class SosScreen extends StatefulWidget {
  const SosScreen({super.key});
  @override
  State<SosScreen> createState() => _SosScreenState();
}

class _SosScreenState extends State<SosScreen> {
  bool _silent = false;

  Future<void> _call(String number) async {
    final ok = await context.read<PhoneDialer>().call(number);
    if (!ok && mounted) showMessage(context, 'Could not open the phone app. Dial ${formatPhone(number)} yourself.');
  }

  @override
  Widget build(BuildContext context) {
    final sos = context.watch<SosController>();
    return Scaffold(
      appBar: AppBar(title: const Text('Emergency')),
      body: SafeArea(
        child: switch (sos.phase) {
          SosPhase.idle => _ReadyView(
              silent: _silent,
              onSilentChanged: (v) => setState(() => _silent = v),
              onConfirmed: () => sos.trigger(silent: _silent),
              error: sos.error,
              onCall: _call,
            ),
          SosPhase.sending => _SendingView(controller: sos, onCall: _call),
          SosPhase.active => _ActiveView(controller: sos, onCall: _call),
          SosPhase.ended => _EndedView(controller: sos),
        },
      ),
    );
  }
}

class _CallButtons extends StatelessWidget {
  const _CallButtons({required this.onCall});
  final Future<void> Function(String number) onCall;

  @override
  Widget build(BuildContext context) {
    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      OutlinedButton.icon(
        onPressed: () => onCall(AppConfig.usmSecurityEmergency),
        icon: const Icon(Icons.call_rounded, color: SwColors.primary),
        label: Text('Call USM Security  ${formatPhone(AppConfig.usmSecurityEmergency)}'),
      ),
      const SizedBox(height: 10),
      OutlinedButton.icon(
        onPressed: () => onCall(nationalEmergencyNumber),
        icon: const Icon(Icons.local_police_outlined, color: SwColors.secondary),
        label: const Text('Call $nationalEmergencyNumber (national emergency)'),
      ),
    ]);
  }
}

class _ReadyView extends StatelessWidget {
  const _ReadyView({required this.silent, required this.onSilentChanged, required this.onConfirmed, required this.onCall, this.error});
  final bool silent;
  final ValueChanged<bool> onSilentChanged;
  final VoidCallback onConfirmed;
  final Future<void> Function(String) onCall;
  final String? error;

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    return ListView(padding: const EdgeInsets.fromLTRB(20, 8, 20, 24), children: [
      Text(
        'Hold the button to alert USM Security with your live location. Your trusted contacts are alerted too.',
        style: text.bodyMedium?.copyWith(color: SwColors.textMuted),
        textAlign: TextAlign.center,
      ),
      const SizedBox(height: 24),
      Center(
        child: HoldToConfirmButton(
          label: silent ? 'SILENT' : 'SOS',
          holdDuration: sosHoldDuration,
          haptics: !silent,
          onConfirmed: onConfirmed,
        ),
      ),
      const SizedBox(height: 20),
      Card(
        child: SwitchListTile(
          value: silent,
          onChanged: onSilentChanged,
          activeThumbColor: SwColors.primary,
          title: const Text('Silent SOS', style: TextStyle(fontWeight: FontWeight.w600)),
          subtitle: Text(
            'No vibration and no call. Use it when you cannot speak or need to stay hidden.',
            style: text.bodySmall,
          ),
        ),
      ),
      if (error != null) ...[
        const SizedBox(height: 12),
        Text(error!, style: const TextStyle(color: SwColors.primary)),
      ],
      const SizedBox(height: 24),
      Text('Call for help', style: text.titleSmall),
      const SizedBox(height: 10),
      _CallButtons(onCall: onCall),
      const SizedBox(height: 16),
      TextButton.icon(
        onPressed: () => context.go('/safe-points'),
        icon: const Icon(Icons.shield_outlined),
        label: const Text('Find the nearest safe point'),
      ),
    ]);
  }
}

class _SendingView extends StatelessWidget {
  const _SendingView({required this.controller, required this.onCall});
  final SosController controller;
  final Future<void> Function(String) onCall;

  @override
  Widget build(BuildContext context) {
    return ListView(padding: const EdgeInsets.all(24), children: [
      const SizedBox(height: 32),
      const Center(child: SizedBox.square(dimension: 56, child: CircularProgressIndicator(strokeWidth: 5))),
      const SizedBox(height: 24),
      Text(
        controller.attempt <= 1 ? 'Sending your SOS…' : 'Still sending your SOS (attempt ${controller.attempt})',
        textAlign: TextAlign.center,
        style: Theme.of(context).textTheme.titleLarge,
      ),
      if (controller.error != null) ...[
        const SizedBox(height: 12),
        Text(controller.error!, textAlign: TextAlign.center, style: const TextStyle(color: SwColors.secondary)),
      ],
      if (!controller.silent) ...[
        const SizedBox(height: 32),
        _CallButtons(onCall: onCall),
      ],
    ]);
  }
}

class _ActiveView extends StatefulWidget {
  const _ActiveView({required this.controller, required this.onCall});
  final SosController controller;
  final Future<void> Function(String) onCall;

  @override
  State<_ActiveView> createState() => _ActiveViewState();
}

class _ActiveViewState extends State<_ActiveView> {
  bool _busy = false;

  Future<void> _markSafe() async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Are you safe now?'),
        content: const Text('SafeWalk stops sharing your location and tells USM Security and your trusted contacts that you are safe.'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Not yet')),
          TextButton(onPressed: () => Navigator.pop(ctx, true), child: const Text("I'm safe")),
        ],
      ),
    );
    if (ok != true) return;
    setState(() => _busy = true);
    try {
      await widget.controller.markSafe();
    } on ApiException catch (e) {
      if (mounted) showMessage(context, e.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final c = widget.controller;
    final alert = c.alert!;
    final text = Theme.of(context).textTheme;
    final String sharing;
    if (c.gpsProblem != null) {
      sharing = c.gpsProblem!;
    } else if (!c.isConnected) {
      sharing = c.bufferedSamples > 0
          ? 'Offline: ${c.bufferedSamples} location updates will be sent when you reconnect.'
          : 'Reconnecting to share your live location…';
    } else {
      sharing = 'Sharing your live location with USM Security and your trusted contacts.';
    }

    return ListView(padding: const EdgeInsets.fromLTRB(20, 8, 20, 24), children: [
      Card(
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14), side: const BorderSide(color: SwColors.primary, width: 2)),
        child: Padding(
          padding: const EdgeInsets.all(18),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            StatusBadge(alert.isSilent ? 'Silent SOS sent' : 'SOS sent', tone: BadgeTone.danger),
            const SizedBox(height: 12),
            Text(AlertStatus.describe(alert.status), style: text.titleLarge),
            const SizedBox(height: 4),
            Text('Sent at ${formatTime(alert.triggeredAt)}', style: text.bodySmall),
            const SizedBox(height: 14),
            Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Icon(c.gpsProblem == null && c.isConnected ? Icons.my_location_rounded : Icons.location_searching_rounded,
                  size: 18, color: SwColors.secondary),
              const SizedBox(width: 10),
              Expanded(child: Text(sharing)),
            ]),
          ]),
        ),
      ),
      if (alert.history.length > 1) ...[
        const SizedBox(height: 16),
        Text('Updates from USM Security', style: text.titleSmall),
        const SizedBox(height: 8),
        for (final h in alert.history.skip(1))
          Padding(
            padding: const EdgeInsets.only(bottom: 8),
            child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
              SizedBox(width: 72, child: Text(formatTime(h.at), style: text.bodySmall)),
              Expanded(
                child: Text(
                  '${AlertStatus.describe(h.newStatus)}${h.staffName != null ? ' (${h.staffName})' : ''}${h.note != null ? '\n${h.note}' : ''}',
                ),
              ),
            ]),
          ),
      ],
      const SizedBox(height: 20),
      if (alert.trackingUrl != null)
        OutlinedButton.icon(
          onPressed: () => SharePlus.instance.share(ShareParams(text: 'I need help. Follow my live location: ${alert.trackingUrl}')),
          icon: const Icon(Icons.ios_share_rounded),
          label: const Text('Share live location link'),
        ),
      const SizedBox(height: 10),
      OutlinedButton.icon(
        onPressed: () => context.go('/safe-points'),
        icon: const Icon(Icons.shield_outlined),
        label: const Text('Nearest safe point'),
      ),
      const SizedBox(height: 20),
      _CallButtons(onCall: widget.onCall),
      const SizedBox(height: 24),
      FilledButton(onPressed: _busy ? null : _markSafe, child: Text(_busy ? 'Updating…' : "I'm safe now")),
    ]);
  }
}

class _EndedView extends StatelessWidget {
  const _EndedView({required this.controller});
  final SosController controller;

  @override
  Widget build(BuildContext context) {
    final SosAlert? a = controller.alert;
    final markedSafe = a?.userSafeAt != null;
    final message = markedSafe
        ? 'You told USM Security and your contacts that you are safe at ${formatTime(a!.userSafeAt)}. Location sharing has stopped.'
        : 'USM Security has resolved your alert. Location sharing has stopped.';
    return EmptyView(
      icon: Icons.verified_user_outlined,
      title: markedSafe ? 'You are marked safe' : 'Alert resolved',
      message: message,
      action: FilledButton(onPressed: controller.dismiss, child: const Text('Done')),
    );
  }
}
