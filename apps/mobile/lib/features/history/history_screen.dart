import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../core/api_client.dart';
import '../../core/formatting.dart';
import '../../data/models.dart';
import '../../data/repositories.dart';
import '../../widgets/common.dart';

class HistoryScreen extends StatefulWidget {
  const HistoryScreen({super.key});
  @override
  State<HistoryScreen> createState() => _HistoryScreenState();
}

class _HistoryScreenState extends State<HistoryScreen> {
  final List<Trip> _trips = [];
  bool _loading = true;
  bool _hasMore = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load(reset: true);
  }

  Future<void> _load({bool reset = false}) async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final page = await context.read<TripsRepository>().history(before: reset || _trips.isEmpty ? null : _trips.last.startedAt);
      if (!mounted) return;
      setState(() {
        if (reset) _trips.clear();
        _trips.addAll(page);
        _hasMore = page.length == 20;
      });
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    Widget body;
    if (_trips.isEmpty && _loading) {
      body = const Center(child: CircularProgressIndicator());
    } else if (_trips.isEmpty && _error != null) {
      body = ErrorView(message: _error!, onRetry: () => _load(reset: true));
    } else if (_trips.isEmpty) {
      body = const EmptyView(
        icon: Icons.history_rounded,
        title: 'No journeys yet',
        message: 'Journeys you share will appear here.',
      );
    } else {
      body = RefreshIndicator(
        onRefresh: () => _load(reset: true),
        child: ListView.separated(
          padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
          itemCount: _trips.length + (_hasMore ? 1 : 0),
          separatorBuilder: (_, _) => const SizedBox(height: 8),
          itemBuilder: (context, i) {
            if (i == _trips.length) {
              return Center(
                child: TextButton(onPressed: _loading ? null : _load, child: Text(_loading ? 'Loading…' : 'Load older journeys')),
              );
            }
            final t = _trips[i];
            final (label, tone) = tripStatusBadge(t.status, endReason: t.endReason);
            return Card(
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Row(children: [
                  Expanded(
                    child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      Text(t.destinationLabel ?? 'Pinned destination', style: text.titleMedium),
                      const SizedBox(height: 4),
                      Text(
                        '${formatDateTime(t.startedAt)} · ${formatDistance(t.distanceM)}'
                        '${t.endedAt != null ? ' · ${formatDuration(t.endedAt!.difference(t.startedAt))}' : ''}',
                        style: text.bodySmall,
                      ),
                    ]),
                  ),
                  const SizedBox(width: 12),
                  StatusBadge(label, tone: tone),
                ]),
              ),
            );
          },
        ),
      );
    }
    return Scaffold(appBar: AppBar(title: const Text('Journey history')), body: body);
  }
}
