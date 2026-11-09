import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../core/theme.dart';
import '../../widgets/common.dart';
import 'announcement_ui.dart';
import 'announcements_controller.dart';

/// Every live announcement from USM Security, in full.
class AnnouncementsScreen extends StatefulWidget {
  const AnnouncementsScreen({super.key});
  @override
  State<AnnouncementsScreen> createState() => _AnnouncementsScreenState();
}

class _AnnouncementsScreenState extends State<AnnouncementsScreen> {
  @override
  void initState() {
    super.initState();
    context.read<AnnouncementsController>().load();
  }

  @override
  Widget build(BuildContext context) {
    final c = context.watch<AnnouncementsController>();
    final items = c.items;
    return Scaffold(
      appBar: AppBar(title: const Text('Announcements')),
      body: RefreshIndicator(
        onRefresh: c.load,
        child: ListView(padding: const EdgeInsets.fromLTRB(20, 8, 20, 32), children: [
          Text('Safety notices from the USM Security Department.', style: Theme.of(context).textTheme.bodyMedium?.copyWith(color: SwColors.textMuted)),
          const SizedBox(height: 16),
          if (!c.loaded)
            const Padding(padding: EdgeInsets.all(32), child: Center(child: CircularProgressIndicator()))
          else if (c.error != null && items.isEmpty)
            Card(child: ErrorView(message: c.error!, onRetry: c.load))
          else if (items.isEmpty)
            const EmptyView(icon: Icons.campaign_outlined, title: 'No announcements right now', message: 'Notices from USM Security appear here.')
          else
            for (final a in items) ...[AnnouncementCard(announcement: a), const SizedBox(height: 12)],
        ]),
      ),
    );
  }
}
