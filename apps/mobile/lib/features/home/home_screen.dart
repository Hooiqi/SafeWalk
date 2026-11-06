import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';

import '../../core/api_client.dart';
import '../../core/formatting.dart';
import '../../core/theme.dart';
import '../../data/models.dart';
import '../../data/repositories.dart';
import '../../services/trip_tracker.dart';
import '../../widgets/common.dart';
import '../contacts/contacts_controller.dart';

class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key});
  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  UserProfile? _profile;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _error = null);
    try {
      final results = await Future.wait([
        context.read<ProfileRepository>().me(),
        context.read<TripTracker>().resume(),
        context.read<ContactsController>().load(),
      ]);
      if (mounted) setState(() => _profile = results.first as UserProfile);
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    }
  }

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    final trip = context.watch<TripTracker>().trip;
    final contacts = context.watch<ContactsController>();
    final firstName = _profile?.fullName.split(' ').first;

    return Scaffold(
      body: SafeArea(
        child: RefreshIndicator(
          onRefresh: _load,
          child: ListView(padding: const EdgeInsets.fromLTRB(20, 20, 20, 32), children: [
            const Wordmark(),
            const SizedBox(height: 20),
            Text(firstName == null ? 'Your safety overview' : 'Hi, $firstName', style: text.headlineSmall),
            const SizedBox(height: 4),
            Text('Walking somewhere on campus? Share the journey before you go.', style: text.bodyMedium?.copyWith(color: SwColors.textMuted)),
            const SizedBox(height: 24),
            if (_error != null) ...[
              Card(child: ErrorView(message: _error!, onRetry: _load)),
              const SizedBox(height: 16),
            ],
            if (trip != null && trip.isOpen)
              _ActiveJourneyCard(trip: trip)
            else
              _StartCard(hasContacts: contacts.contacts.isNotEmpty || !contacts.loaded),
            const SizedBox(height: 16),
            Card(
              child: ListTile(
                contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
                leading: const Icon(Icons.group_outlined, color: SwColors.secondary),
                title: const Text('Trusted contacts'),
                subtitle: Text(
                  contacts.loaded ? '${contacts.contacts.length} saved' : 'Loading…',
                  style: text.bodySmall,
                ),
                trailing: const Icon(Icons.chevron_right_rounded),
                onTap: () => context.go('/contacts'),
              ),
            ),
            const SizedBox(height: 8),
            Card(
              child: ListTile(
                contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
                leading: const Icon(Icons.history_rounded, color: SwColors.secondary),
                title: const Text('Journey history'),
                trailing: const Icon(Icons.chevron_right_rounded),
                onTap: () => context.go('/history'),
              ),
            ),
          ]),
        ),
      ),
    );
  }
}

class _StartCard extends StatelessWidget {
  const _StartCard({required this.hasContacts});
  final bool hasContacts;

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(18),
        child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          Text('Start a tracked walk', style: text.titleMedium),
          const SizedBox(height: 6),
          Text(
            'Pick your destination, choose who to share with, and SafeWalk watches your arrival time from the server.',
            style: text.bodySmall,
          ),
          const SizedBox(height: 16),
          if (hasContacts)
            FilledButton.icon(
              onPressed: () => context.push('/journey/start'),
              icon: const Icon(Icons.directions_walk_rounded),
              label: const Text('Start a journey'),
            )
          else
            FilledButton.icon(
              onPressed: () => context.push('/contacts/new'),
              icon: const Icon(Icons.person_add_alt_1_rounded),
              label: const Text('Add a trusted contact first'),
            ),
        ]),
      ),
    );
  }
}

class _ActiveJourneyCard extends StatelessWidget {
  const _ActiveJourneyCard({required this.trip});
  final Trip trip;

  @override
  Widget build(BuildContext context) {
    final (label, tone) = tripStatusBadge(trip.status);
    final urgent = trip.status != 'ACTIVE';
    return Card(
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(14),
        side: BorderSide(color: urgent ? (tone == BadgeTone.danger ? SwColors.primary : SwColors.secondary) : SwColors.border),
      ),
      child: InkWell(
        borderRadius: BorderRadius.circular(14),
        onTap: () => context.go('/journey'),
        child: Padding(
          padding: const EdgeInsets.all(18),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            StatusBadge(label, tone: tone),
            const SizedBox(height: 12),
            Text(trip.destinationLabel ?? 'Journey in progress', style: Theme.of(context).textTheme.titleMedium),
            const SizedBox(height: 4),
            Text('Expected by ${formatTime(trip.etaDeadline)}', style: Theme.of(context).textTheme.bodySmall),
            const SizedBox(height: 12),
            Text(urgent ? 'Open to respond' : 'Open journey', style: const TextStyle(color: SwColors.secondary, fontWeight: FontWeight.w600)),
          ]),
        ),
      ),
    );
  }
}
