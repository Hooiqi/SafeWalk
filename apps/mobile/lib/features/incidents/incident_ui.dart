import 'package:flutter/material.dart';

import '../../core/constants.dart';
import '../../core/formatting.dart';
import '../../core/theme.dart';
import '../../data/models.dart';
import '../../widgets/common.dart';

// Labels, icons and colours for Module 3. Mirrors the dashboard's labels.js.

String categoryLabel(String c) => switch (c) {
      'SUSPICIOUS_ACTIVITY' => 'Suspicious activity',
      'HARASSMENT' => 'Harassment',
      'THEFT' => 'Theft',
      'BROKEN_LIGHTING' => 'Broken lighting',
      'STRAY_ANIMAL' => 'Stray animal',
      'UNSAFE_PATH' => 'Unsafe path',
      'OTHER' => 'Other',
      _ => c,
    };

/// One line that helps people pick the right category.
String categoryHint(String c) => switch (c) {
      'SUSPICIOUS_ACTIVITY' => 'Someone following people, loitering or acting strangely',
      'HARASSMENT' => 'Verbal or physical harassment, catcalling, threats',
      'THEFT' => 'Stolen bag, phone, bicycle or break-in',
      'BROKEN_LIGHTING' => 'Street or path lights not working',
      'STRAY_ANIMAL' => 'Aggressive dogs, monkeys or snakes',
      'UNSAFE_PATH' => 'Construction, flooding, fallen trees, broken pavement',
      _ => 'Anything else that makes a place unsafe',
    };

IconData categoryIcon(String c) => switch (c) {
      'SUSPICIOUS_ACTIVITY' => Icons.visibility_outlined,
      'HARASSMENT' => Icons.front_hand_outlined,
      'THEFT' => Icons.account_balance_wallet_outlined,
      'BROKEN_LIGHTING' => Icons.lightbulb_outline_rounded,
      'STRAY_ANIMAL' => Icons.pets_rounded,
      'UNSAFE_PATH' => Icons.construction_rounded,
      _ => Icons.help_outline_rounded,
    };

String severityLabel(String s) => switch (s) {
      IncidentSeverity.low => 'Low',
      IncidentSeverity.medium => 'Medium',
      IncidentSeverity.high => 'High',
      _ => s,
    };

String severityHint(String s) => switch (s) {
      IncidentSeverity.low => 'A nuisance or a risk to keep in mind',
      IncidentSeverity.medium => 'Could hurt someone; avoid if you can',
      IncidentSeverity.high => 'Danger to people right now',
      _ => '',
    };

Color severityColor(String s) => switch (s) {
      IncidentSeverity.high => SwColors.severityHigh,
      IncidentSeverity.medium => SwColors.severityMedium,
      _ => SwColors.severityLow,
    };

IconData severityIcon(String s) => switch (s) {
      IncidentSeverity.high => Icons.keyboard_double_arrow_up_rounded,
      IncidentSeverity.medium => Icons.keyboard_arrow_up_rounded,
      _ => Icons.keyboard_arrow_down_rounded,
    };

/// Status of a report as its reporter sees it.
(String, BadgeTone) reportStatusBadge(String status, {bool autoVerified = false}) => switch (status) {
      IncidentStatus.pending => ('Waiting for review', BadgeTone.warning),
      IncidentStatus.verified => (autoVerified ? 'Verified by matching reports' : 'Verified by USM Security', BadgeTone.done),
      IncidentStatus.resolved => ('Resolved', BadgeTone.done),
      IncidentStatus.rejected => ('Not confirmed', BadgeTone.neutral),
      _ => (status, BadgeTone.neutral),
    };

/// Severity as icon, colour and word together (never colour alone).
class SeverityLabel extends StatelessWidget {
  const SeverityLabel(this.severity, {super.key, this.suffix = ' severity'});
  final String severity;
  final String suffix;

  @override
  Widget build(BuildContext context) {
    final color = severityColor(severity);
    return Row(mainAxisSize: MainAxisSize.min, children: [
      Icon(severityIcon(severity), size: 18, color: color),
      const SizedBox(width: 4),
      Text('${severityLabel(severity)}$suffix', style: TextStyle(color: color, fontSize: 14, fontWeight: FontWeight.w500)),
    ]);
  }
}

/// A pin on the safety map: the category icon on a disc in the severity colour.
class IncidentPin extends StatelessWidget {
  const IncidentPin({super.key, required this.incident, this.onTap});
  final Incident incident;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) => Semantics(
        button: onTap != null,
        label: '${categoryLabel(incident.category)}, ${severityLabel(incident.severity)} severity',
        child: GestureDetector(
          onTap: onTap,
          child: Container(
            decoration: BoxDecoration(
              color: severityColor(incident.severity),
              shape: BoxShape.circle,
              border: Border.all(color: SwColors.background, width: 2.5),
            ),
            child: Icon(categoryIcon(incident.category), size: 18, color: SwColors.onAccent),
          ),
        ),
      );
}

/// Details of one incident, opened from the map or a route warning.
Future<void> showIncidentDetails(BuildContext context, Incident i) => showModalBottomSheet<void>(
      context: context,
      showDragHandle: true,
      builder: (ctx) {
        final text = Theme.of(ctx).textTheme;
        final howVerified = i.status == IncidentStatus.resolved
            ? 'Resolved by USM Security ${formatDateTime(i.resolvedAt)}'
            : i.autoVerified
                ? 'Verified because ${i.reportCount} people reported it nearby within $autoVerifyWindowMinutes minutes'
                : 'Verified by USM Security';
        return SafeArea(
          child: Padding(
            padding: const EdgeInsets.fromLTRB(20, 0, 20, 24),
            child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
              Row(children: [
                Icon(categoryIcon(i.category), color: SwColors.text2),
                const SizedBox(width: 10),
                Expanded(child: Text(categoryLabel(i.category), style: text.titleLarge)),
              ]),
              const SizedBox(height: 10),
              SeverityLabel(i.severity),
              const SizedBox(height: 14),
              _Fact('Reports', '${i.reportCount}'),
              _Fact('First reported', formatDateTime(i.firstReportedAt)),
              _Fact('Last reported', formatDateTime(i.lastReportedAt)),
              if (i.distanceFromRouteM != null) _Fact('From your route', formatDistance(i.distanceFromRouteM)),
              const SizedBox(height: 10),
              Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                const Icon(Icons.verified_outlined, size: 18, color: SwColors.primary),
                const SizedBox(width: 8),
                Expanded(child: Text(howVerified, style: text.bodyMedium)),
              ]),
              if (i.publicNote != null) ...[
                const SizedBox(height: 12),
                Text('From USM Security', style: text.titleSmall),
                const SizedBox(height: 4),
                Text(i.publicNote!),
              ],
            ]),
          ),
        );
      },
    );

class _Fact extends StatelessWidget {
  const _Fact(this.label, this.value);
  final String label;
  final String value;

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.symmetric(vertical: 4),
        child: Row(children: [
          SizedBox(width: 130, child: Text(label, style: Theme.of(context).textTheme.bodySmall)),
          Expanded(child: Text(value)),
        ]),
      );
}
