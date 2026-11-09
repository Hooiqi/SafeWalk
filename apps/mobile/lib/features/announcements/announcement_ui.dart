import 'package:flutter/material.dart';

import '../../core/constants.dart';
import '../../core/formatting.dart';
import '../../core/theme.dart';
import '../../data/models.dart';

/// Priority word with its icon. Same three steps as incident severity:
/// information (bone), advisory (apricot), urgent (coral). Never colour alone.
({String label, IconData icon, Color color}) priorityStyle(String priority) => switch (priority) {
      AnnouncementPriority.urgent => (label: 'Urgent', icon: Icons.error_outline_rounded, color: SwColors.severityHigh),
      AnnouncementPriority.advisory => (label: 'Advisory', icon: Icons.warning_amber_rounded, color: SwColors.severityMedium),
      _ => (label: 'Information', icon: Icons.info_outline_rounded, color: SwColors.severityLow),
    };

class PriorityLabel extends StatelessWidget {
  const PriorityLabel(this.priority, {super.key, this.suffix});
  final String priority;
  final String? suffix;

  @override
  Widget build(BuildContext context) {
    final s = priorityStyle(priority);
    return Row(mainAxisSize: MainAxisSize.min, children: [
      Icon(s.icon, size: 16, color: s.color),
      const SizedBox(width: 6),
      Text(suffix == null ? s.label : '${s.label} · $suffix',
          style: TextStyle(color: s.color, fontWeight: FontWeight.w600, fontSize: 13)),
    ]);
  }
}

/// One announcement as a card. `compact` clamps the text for the home screen.
class AnnouncementCard extends StatelessWidget {
  const AnnouncementCard({super.key, required this.announcement, this.compact = false, this.onTap});
  final Announcement announcement;
  final bool compact;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final a = announcement;
    final text = Theme.of(context).textTheme;
    final border = switch (a.priority) {
      AnnouncementPriority.urgent => SwColors.severityHigh,
      AnnouncementPriority.advisory => SwColors.secondary.withValues(alpha: 0.55),
      _ => SwColors.border,
    };
    return Card(
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(SwRadius.card),
        side: BorderSide(color: border, width: a.isUrgent ? 2 : 1),
      ),
      child: InkWell(
        borderRadius: BorderRadius.circular(SwRadius.card),
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            PriorityLabel(a.priority, suffix: 'USM Security'),
            const SizedBox(height: 8),
            Text(a.title, style: text.titleMedium),
            const SizedBox(height: 4),
            Text(
              a.body,
              maxLines: compact ? 3 : null,
              overflow: compact ? TextOverflow.ellipsis : null,
              style: text.bodyMedium?.copyWith(color: SwColors.text2),
            ),
            const SizedBox(height: 8),
            Text(
              a.expiresAt == null ? 'Posted ${formatDateTime(a.publishedAt)}' : 'Posted ${formatDateTime(a.publishedAt)}, until ${formatDateTime(a.expiresAt)}',
              style: text.bodySmall?.copyWith(color: SwColors.textMuted),
            ),
          ]),
        ),
      ),
    );
  }
}
