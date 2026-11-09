import 'dart:async';

import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';

import '../../core/api_client.dart';
import '../../core/constants.dart';
import '../../core/formatting.dart';
import '../../core/theme.dart';
import '../../data/models.dart';
import '../../data/repositories.dart';
import '../../services/realtime_service.dart';
import '../../widgets/common.dart';
import 'incident_ui.dart';

/// Module 3: follow the status of your reports (pending, verified, rejected,
/// resolved). Updates arrive live from the server.
class MyReportsScreen extends StatefulWidget {
  const MyReportsScreen({super.key});
  @override
  State<MyReportsScreen> createState() => _MyReportsScreenState();
}

class _MyReportsScreenState extends State<MyReportsScreen> {
  List<MyReport>? _reports;
  String? _error;
  StreamSubscription<RealtimeEvent>? _events;

  @override
  void initState() {
    super.initState();
    _load();
    _events = context.read<RealtimeChannel>().events.listen((e) {
      if (e.name != SocketEvents.incidentStatus || _reports == null) return;
      final id = e.data['report_id'] as String?;
      final i = _reports!.indexWhere((r) => r.id == id);
      if (i < 0) {
        _load();
        return;
      }
      setState(() {
        _reports![i] = _reports![i].copyWith(
          status: e.data['status'] as String?,
          autoVerified: e.data['auto_verified'] as bool?,
          publicNote: e.data['public_note'] as String?,
        );
      });
    });
  }

  @override
  void dispose() {
    _events?.cancel();
    super.dispose();
  }

  Future<void> _load() async {
    setState(() => _error = null);
    try {
      final reports = await context.read<IncidentsRepository>().mine();
      if (mounted) setState(() => _reports = reports);
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    }
  }

  @override
  Widget build(BuildContext context) {
    final reports = _reports;
    return Scaffold(
      appBar: AppBar(title: const Text('My reports')),
      body: SafeArea(
        child: _error != null && reports == null
            ? ErrorView(message: _error!, onRetry: _load)
            : reports == null
                ? const Center(child: CircularProgressIndicator())
                : reports.isEmpty
                    ? EmptyView(
                        icon: Icons.assignment_outlined,
                        title: 'No reports yet',
                        message: 'When you report an incident, you can follow what USM Security does with it here.',
                        action: FilledButton(onPressed: () => context.push('/incidents/report'), child: const Text('Report an incident')),
                      )
                    : RefreshIndicator(
                        onRefresh: _load,
                        child: ListView.separated(
                          padding: const EdgeInsets.fromLTRB(16, 8, 16, 32),
                          itemCount: reports.length,
                          separatorBuilder: (_, _) => const SizedBox(height: 10),
                          itemBuilder: (_, i) => _ReportCard(report: reports[i]),
                        ),
                      ),
      ),
    );
  }
}

class _ReportCard extends StatelessWidget {
  const _ReportCard({required this.report});
  final MyReport report;

  String _explain() => switch (report.status) {
        IncidentStatus.pending => 'USM Security has not reviewed it yet. It appears on the map once verified, '
            'or as soon as $autoVerifyReporters people report the same thing nearby within $autoVerifyWindowMinutes minutes.',
        IncidentStatus.verified => report.autoVerified
            ? 'Others reported the same thing nearby, so it is on the safety map for everyone.'
            : 'USM Security confirmed it. It is on the safety map for everyone.',
        IncidentStatus.resolved => 'USM Security has dealt with it. It is no longer on the map.',
        IncidentStatus.rejected => 'USM Security could not confirm it, so it is not on the map.',
        _ => '',
      };

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    final (label, tone) = reportStatusBadge(report.status, autoVerified: report.autoVerified);
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Row(children: [
            Icon(categoryIcon(report.category), color: SwColors.text2, size: 20),
            const SizedBox(width: 8),
            Expanded(child: Text(categoryLabel(report.category), style: text.titleMedium)),
            Text(formatDateTime(report.submittedAt), style: text.bodySmall),
          ]),
          const SizedBox(height: 10),
          StatusBadge(label, tone: tone),
          const SizedBox(height: 6),
          Text(_explain(), style: text.bodySmall),
          if (report.publicNote != null) ...[
            const SizedBox(height: 10),
            Text('From USM Security: ${report.publicNote}', style: text.bodyMedium),
          ],
          const SizedBox(height: 12),
          Text(report.description, maxLines: 3, overflow: TextOverflow.ellipsis),
          const SizedBox(height: 10),
          Wrap(spacing: 14, runSpacing: 6, crossAxisAlignment: WrapCrossAlignment.center, children: [
            SeverityLabel(report.severity),
            if (report.isAnonymous)
              Row(mainAxisSize: MainAxisSize.min, children: [
                const Icon(Icons.visibility_off_outlined, size: 16, color: SwColors.textMuted),
                const SizedBox(width: 4),
                Text('Anonymous', style: text.bodySmall),
              ]),
            if (report.hasPhoto)
              Row(mainAxisSize: MainAxisSize.min, children: [
                const Icon(Icons.photo_outlined, size: 16, color: SwColors.textMuted),
                const SizedBox(width: 4),
                Text('Photo', style: text.bodySmall),
              ]),
            if (report.reportCount > 1) Text('${report.reportCount} reports of this', style: text.bodySmall),
          ]),
        ]),
      ),
    );
  }
}
