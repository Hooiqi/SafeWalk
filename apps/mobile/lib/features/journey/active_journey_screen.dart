import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';
import 'package:share_plus/share_plus.dart';

import '../../core/api_client.dart';
import '../../core/constants.dart';
import '../../core/formatting.dart';
import '../../core/theme.dart';
import '../../data/models.dart';
import '../../services/trip_tracker.dart';
import '../../widgets/campus_map.dart';
import '../../widgets/common.dart';

/// Module 1, Features 2-5: live journey with the server's ETA state,
/// grace-period check-in, escalation state and safe arrival.
class ActiveJourneyScreen extends StatefulWidget {
  const ActiveJourneyScreen({super.key});
  @override
  State<ActiveJourneyScreen> createState() => _ActiveJourneyScreenState();
}

class _ActiveJourneyScreenState extends State<ActiveJourneyScreen> {
  final _map = MapController();
  late final Timer _ticker;
  bool _busy = false;
  bool _followMe = true;

  @override
  void initState() {
    super.initState();
    // Re-render countdowns every second. The countdown is display only: the
    // server decides when the ETA and grace period have expired.
    _ticker = Timer.periodic(const Duration(seconds: 1), (_) => mounted ? setState(() {}) : null);
  }

  @override
  void dispose() {
    _ticker.cancel();
    super.dispose();
  }

  Future<void> _run(Future<void> Function() action, {String? success}) async {
    setState(() => _busy = true);
    try {
      await action();
      if (mounted && success != null) showMessage(context, success);
    } on ApiException catch (e) {
      if (mounted) showMessage(context, e.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _extend(TripTracker tracker) async {
    final minutes = await showModalBottomSheet<int>(
      context: context,
      backgroundColor: SwColors.surface,
      builder: (ctx) => SafeArea(
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          const ListTile(title: Text('Add walking time', style: TextStyle(fontWeight: FontWeight.w600))),
          for (final m in [5, 10, 15]) ListTile(title: Text('+$m minutes'), onTap: () => Navigator.pop(ctx, m)),
          const SizedBox(height: 8),
        ]),
      ),
    );
    if (minutes != null) await _run(() => tracker.extend(minutes), success: 'Arrival time extended by $minutes minutes');
  }

  Future<void> _cancel(TripTracker tracker) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Cancel this journey?'),
        content: const Text('Your trusted contacts will see that you stopped sharing. SafeWalk will no longer watch your arrival time.'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Keep sharing')),
          TextButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Cancel journey')),
        ],
      ),
    );
    if (ok == true) await _run(tracker.cancel);
  }

  void _share(Trip trip) {
    final url = trip.trackingUrl;
    if (url == null) return;
    SharePlus.instance.share(ShareParams(
      text: 'Follow my walk on SafeWalk until I arrive: $url',
      subject: 'My SafeWalk journey',
    ));
  }

  @override
  Widget build(BuildContext context) {
    final tracker = context.watch<TripTracker>();
    final trip = tracker.trip;
    if (trip == null && !tracker.restored) {
      return Scaffold(appBar: AppBar(), body: const Center(child: CircularProgressIndicator()));
    }
    if (trip == null) {
      return Scaffold(
        appBar: AppBar(),
        body: EmptyView(
          icon: Icons.directions_walk_rounded,
          title: 'No journey in progress',
          message: 'Start a journey to share your walk with your trusted contacts.',
          action: FilledButton(onPressed: () => context.go('/journey/start'), child: const Text('Start a journey')),
        ),
      );
    }

    final me = tracker.myPosition ?? trip.lastLocation?.position;
    if (_followMe && me != null && trip.isOpen) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        try {
          _map.move(me, _map.camera.zoom);
        } catch (_) {/* map not laid out yet */}
      });
    }

    return Scaffold(
      appBar: AppBar(
        title: const Text('Journey'),
        leading: IconButton(icon: const Icon(Icons.arrow_back), tooltip: 'Home', onPressed: () => context.go('/')),
        actions: [
          if (trip.isOpen)
            TextButton.icon(
              onPressed: () => context.push('/sos'),
              icon: const Icon(Icons.sos_rounded, color: SwColors.alert),
              label: const Text('SOS', style: TextStyle(color: SwColors.alert, fontWeight: FontWeight.w800)),
            ),
          if (trip.isOpen && trip.trackingUrl != null)
            IconButton(tooltip: 'Share tracking link', icon: const Icon(Icons.ios_share_rounded), onPressed: () => _share(trip)),
        ],
      ),
      body: Column(children: [
        Expanded(
          child: Stack(children: [
            Listener(
              onPointerDown: (_) => _followMe = false,
              child: CampusMap(
                controller: _map,
                myPosition: me,
                destination: trip.destination,
                route: trip.route,
                initialCenter: me ?? trip.origin,
                initialZoom: 17,
              ),
            ),
            if (!_followMe && me != null)
              Positioned(
                right: 12,
                bottom: 28,
                child: FloatingActionButton.small(
                  tooltip: 'Centre on me',
                  backgroundColor: SwColors.surface,
                  foregroundColor: SwColors.text,
                  onPressed: () => setState(() {
                    _followMe = true;
                    _map.move(me, 17);
                  }),
                  child: const Icon(Icons.my_location_rounded),
                ),
              ),
            Positioned(left: 12, right: 12, top: 12, child: _ConnectionStrip(tracker: tracker)),
          ]),
        ),
        _StatusSheet(
          trip: trip,
          busy: _busy,
          onArrive: () => _run(tracker.arrive, success: 'Arrived safely. Your contacts have been updated.'),
          onConfirmSafe: () => _run(tracker.confirmSafe, success: 'Thanks. Your contacts can see you are safe.'),
          onExtend: () => _extend(tracker),
          onCancel: () => _cancel(tracker),
          onShare: () => _share(trip),
          onDone: () {
            tracker.dismiss();
            context.go('/');
          },
        ),
      ]),
    );
  }
}

/// Shows when updates are not reaching the server or GPS has a problem.
class _ConnectionStrip extends StatelessWidget {
  const _ConnectionStrip({required this.tracker});
  final TripTracker tracker;

  @override
  Widget build(BuildContext context) {
    final trip = tracker.trip!;
    String? message;
    if (!trip.isOpen) {
      message = null;
    } else if (tracker.trackingError != null) {
      message = tracker.trackingError;
    } else if (!tracker.isConnected) {
      message = tracker.bufferedSamples > 0
          ? 'Offline: ${tracker.bufferedSamples} location updates waiting to send'
          : 'Connecting to SafeWalk…';
    }
    if (message == null) return const SizedBox.shrink();
    return Material(
      color: SwColors.surface.withValues(alpha: 0.95),
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(SwRadius.inner),
        side: const BorderSide(color: SwColors.secondary),
      ),
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Row(children: [
          Icon(
            tracker.trackingError != null ? Icons.location_off_outlined : Icons.cloud_off_rounded,
            color: SwColors.secondary,
            size: 18,
          ),
          const SizedBox(width: 10),
          Expanded(child: Text(message)),
        ]),
      ),
    );
  }
}

class _StatusSheet extends StatelessWidget {
  const _StatusSheet({
    required this.trip,
    required this.busy,
    required this.onArrive,
    required this.onConfirmSafe,
    required this.onExtend,
    required this.onCancel,
    required this.onShare,
    required this.onDone,
  });

  final Trip trip;
  final bool busy;
  final VoidCallback onArrive, onConfirmSafe, onExtend, onCancel, onShare, onDone;

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    final now = DateTime.now();
    final (badge, tone) = tripStatusBadge(trip.status, endReason: trip.endReason);
    final borderColor = switch (trip.status) {
      TripStatus.gracePrompt => SwColors.secondary,
      TripStatus.escalated => SwColors.alert,
      _ => SwColors.border,
    };

    final List<Widget> body = switch (trip.status) {
      TripStatus.active => [
          Text('Expected by ${formatTime(trip.etaDeadline)}', style: text.headlineSmall),
          const SizedBox(height: 4),
          Text(
            trip.etaDeadline.isAfter(now)
                ? '${formatDuration(trip.etaDeadline.difference(now))} left · shared with ${_names(trip)}'
                : 'Arrival time reached · checking in…',
            style: text.bodyMedium?.copyWith(color: SwColors.textMuted),
          ),
          const SizedBox(height: 16),
          FilledButton.icon(
            onPressed: busy ? null : onArrive,
            icon: const Icon(Icons.check_circle_outline_rounded),
            label: const Text("I've arrived safely"),
          ),
          const SizedBox(height: 10),
          Row(children: [
            Expanded(child: OutlinedButton(onPressed: busy ? null : onExtend, child: const Text('Extend time'))),
            const SizedBox(width: 10),
            Expanded(child: OutlinedButton(onPressed: busy ? null : onCancel, child: const Text('Cancel'))),
          ]),
        ],
      TripStatus.gracePrompt => [
          Text('Are you safe?', style: text.headlineSmall),
          const SizedBox(height: 4),
          Text(
            'Your expected arrival time has passed. Respond within '
            '${formatCountdown((trip.graceExpiresAt ?? now).difference(now))} or USM Security and your trusted contacts will be alerted.',
            style: text.bodyMedium,
          ),
          const SizedBox(height: 16),
          FilledButton(onPressed: busy ? null : onConfirmSafe, child: const Text("I'm safe")),
          const SizedBox(height: 10),
          Row(children: [
            Expanded(child: OutlinedButton(onPressed: busy ? null : onExtend, child: const Text('I need more time'))),
            const SizedBox(width: 10),
            Expanded(child: OutlinedButton(onPressed: busy ? null : onArrive, child: const Text("I've arrived"))),
          ]),
        ],
      TripStatus.escalated => [
          Text('Alert sent to USM Security', style: text.headlineSmall),
          const SizedBox(height: 4),
          Text(
            'You did not respond to the check-in, so SafeWalk sent your last known location and route to USM Security '
            'and your trusted contacts at ${formatTime(trip.escalatedAt)}. Keep this screen open so they can follow your position. '
            'If you are in immediate danger, call $nationalEmergencyNumber.',
            style: text.bodyMedium,
          ),
          const SizedBox(height: 16),
          FilledButton(onPressed: busy ? null : onConfirmSafe, child: const Text("I'm safe now")),
        ],
      _ => [
          Text(
            trip.status == TripStatus.cancelled
                ? 'Journey cancelled'
                : trip.endReason == 'ARRIVED'
                    ? 'You arrived safely'
                    : 'You confirmed you are safe',
            style: text.headlineSmall,
          ),
          const SizedBox(height: 4),
          Text('Ended at ${formatTime(trip.endedAt)}. Live sharing has stopped and the link will expire shortly.',
              style: text.bodyMedium?.copyWith(color: SwColors.textMuted)),
          const SizedBox(height: 16),
          FilledButton(onPressed: onDone, child: const Text('Done')),
        ],
    };

    return Container(
      width: double.infinity,
      decoration: BoxDecoration(
        color: SwColors.surface,
        border: Border(top: BorderSide(color: borderColor, width: borderColor == SwColors.border ? 1 : 3)),
      ),
      child: SafeArea(
        top: false,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(16, 16, 16, 16),
          child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, mainAxisSize: MainAxisSize.min, children: [
            Row(children: [
              StatusBadge(badge, tone: tone),
              const Spacer(),
              if (trip.destinationLabel != null)
                Flexible(
                  child: Text('To ${trip.destinationLabel}', overflow: TextOverflow.ellipsis, style: text.bodySmall),
                ),
            ]),
            const SizedBox(height: 12),
            ...body,
            if (trip.isOpen && trip.routeIsEstimate)
              Padding(
                padding: const EdgeInsets.only(top: 10),
                child: Text('Arrival time is an estimate: the routing service was unavailable.', style: text.bodySmall),
              ),
            if (trip.isOpen && trip.linkDelivery.any((d) => d.status != 'sent'))
              Padding(
                padding: const EdgeInsets.only(top: 10),
                child: Row(children: [
                  Expanded(
                    child: Text('Some contacts could not be messaged automatically. Share the link yourself.', style: text.bodySmall),
                  ),
                  TextButton(onPressed: onShare, child: const Text('Share link')),
                ]),
              ),
          ]),
        ),
      ),
    );
  }

  String _names(Trip trip) {
    if (trip.contactNames.isEmpty) return 'your contacts';
    if (trip.contactNames.length == 1) return trip.contactNames.first;
    return '${trip.contactNames.first} +${trip.contactNames.length - 1}';
  }
}
