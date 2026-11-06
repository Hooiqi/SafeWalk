import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';

import '../../core/api_client.dart';
import '../../core/theme.dart';
import '../../data/models.dart';
import '../../widgets/common.dart';
import 'contacts_controller.dart';

class ContactsScreen extends StatefulWidget {
  const ContactsScreen({super.key});
  @override
  State<ContactsScreen> createState() => _ContactsScreenState();
}

class _ContactsScreenState extends State<ContactsScreen> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => context.read<ContactsController>().load());
  }

  Future<void> _delete(TrustedContact c) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text('Remove ${c.name}?'),
        content: const Text('They will no longer be available to choose for new journeys.'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Keep')),
          TextButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Remove')),
        ],
      ),
    );
    if (ok != true || !mounted) return;
    try {
      await context.read<ContactsController>().delete(c.id);
      if (mounted) showMessage(context, '${c.name} removed');
    } on ApiException catch (e) {
      if (mounted) showMessage(context, e.message);
    }
  }

  @override
  Widget build(BuildContext context) {
    final ctrl = context.watch<ContactsController>();
    return Scaffold(
      appBar: AppBar(title: const Text('Trusted contacts')),
      floatingActionButton: ctrl.contacts.isEmpty
          ? null
          : FloatingActionButton.extended(
              onPressed: () => context.push('/contacts/new'),
              backgroundColor: SwColors.primary,
              foregroundColor: SwColors.onAccent,
              icon: const Icon(Icons.person_add_alt_1_rounded),
              label: const Text('Add contact'),
            ),
      body: switch (ctrl) {
        ContactsController(loading: true, loaded: false) => const Center(child: CircularProgressIndicator()),
        ContactsController(error: final String msg, loaded: false) => ErrorView(message: msg, onRetry: ctrl.load),
        ContactsController(contacts: []) => EmptyView(
            icon: Icons.group_outlined,
            title: 'No trusted contacts yet',
            message: 'Add the people who should follow your journeys. They get a link in their browser; they do not need SafeWalk.',
            action: FilledButton(onPressed: () => context.push('/contacts/new'), child: const Text('Add a contact')),
          ),
        _ => RefreshIndicator(
            onRefresh: ctrl.load,
            child: ListView.separated(
              padding: const EdgeInsets.fromLTRB(16, 8, 16, 96),
              itemCount: ctrl.contacts.length + 1,
              separatorBuilder: (_, _) => const SizedBox(height: 8),
              itemBuilder: (context, i) {
                if (i == 0) {
                  return Padding(
                    padding: const EdgeInsets.fromLTRB(4, 0, 4, 8),
                    child: Text(
                      'Contacts receive your journey link, and an alert with your last location if you do not check in.',
                      style: Theme.of(context).textTheme.bodySmall,
                    ),
                  );
                }
                final c = ctrl.contacts[i - 1];
                return Card(
                  child: ListTile(
                    contentPadding: const EdgeInsets.fromLTRB(16, 6, 4, 6),
                    title: Text(c.name, style: const TextStyle(fontWeight: FontWeight.w600)),
                    subtitle: Text('Alerts via ${c.channels.join(', ')}', style: Theme.of(context).textTheme.bodySmall),
                    onTap: () => context.push('/contacts/edit', extra: c),
                    trailing: IconButton(
                      tooltip: 'Remove ${c.name}',
                      icon: const Icon(Icons.delete_outline_rounded, color: SwColors.textMuted),
                      onPressed: () => _delete(c),
                    ),
                  ),
                );
              },
            ),
          ),
      },
    );
  }
}
