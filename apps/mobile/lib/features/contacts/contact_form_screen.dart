import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';

import '../../core/api_client.dart';
import '../../data/models.dart';
import '../../widgets/common.dart';
import '../auth/validators.dart';
import 'contacts_controller.dart';

class ContactFormScreen extends StatefulWidget {
  const ContactFormScreen({super.key, this.contact});
  final TrustedContact? contact;
  @override
  State<ContactFormScreen> createState() => _ContactFormScreenState();
}

class _ContactFormScreenState extends State<ContactFormScreen> {
  final _form = GlobalKey<FormState>();
  late final _name = TextEditingController(text: widget.contact?.name);
  late final _phone = TextEditingController(text: widget.contact?.phoneNumber ?? '+60');
  late final _email = TextEditingController(text: widget.contact?.email);
  late final _telegram = TextEditingController(text: widget.contact?.telegramChatId);
  bool _busy = false;
  String? _error;

  @override
  void dispose() {
    for (final c in [_name, _phone, _email, _telegram]) {
      c.dispose();
    }
    super.dispose();
  }

  String? _clean(TextEditingController c) {
    final v = c.text.trim();
    return v.isEmpty || v == '+60' ? null : v;
  }

  Future<void> _save() async {
    setState(() => _error = null);
    if (!_form.currentState!.validate()) return;
    final fields = {
      'contact_name': _name.text.trim(),
      'phone_number': _clean(_phone),
      'email': _clean(_email),
      'telegram_chat_id': _clean(_telegram),
    };
    if (fields['phone_number'] == null && fields['email'] == null && fields['telegram_chat_id'] == null) {
      setState(() => _error = 'Add at least a phone number, email or Telegram chat id so SafeWalk can reach them.');
      return;
    }
    setState(() => _busy = true);
    try {
      await context.read<ContactsController>().save(id: widget.contact?.id, fields: fields);
      if (!mounted) return;
      showMessage(context, widget.contact == null ? 'Contact added' : 'Contact updated');
      context.pop();
    } on ApiException catch (e) {
      setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text(widget.contact == null ? 'Add trusted contact' : 'Edit contact')),
      body: SafeArea(
        child: Form(
          key: _form,
          child: ListView(padding: const EdgeInsets.fromLTRB(24, 8, 24, 24), children: [
            TextFormField(
              controller: _name,
              decoration: const InputDecoration(labelText: 'Name *'),
              textCapitalization: TextCapitalization.words,
              validator: (v) => (v == null || v.trim().isEmpty) ? 'Enter their name' : null,
            ),
            const SizedBox(height: 20),
            Text('How should SafeWalk reach them? At least one is required.', style: Theme.of(context).textTheme.bodySmall),
            const SizedBox(height: 12),
            TextFormField(
              controller: _phone,
              decoration: const InputDecoration(labelText: 'Mobile number (SMS)', hintText: '+60123456789'),
              keyboardType: TextInputType.phone,
              validator: (v) => (v == null || v.trim() == '+60') ? null : validatePhone(v, required: false),
            ),
            const SizedBox(height: 16),
            TextFormField(
              controller: _email,
              decoration: const InputDecoration(labelText: 'Email'),
              keyboardType: TextInputType.emailAddress,
              validator: (v) => (v == null || v.trim().isEmpty) ? null : validateEmail(v),
            ),
            const SizedBox(height: 16),
            TextFormField(
              controller: _telegram,
              decoration: const InputDecoration(
                labelText: 'Telegram chat id',
                helperText: 'They must message the SafeWalk bot first to get this number',
              ),
              keyboardType: TextInputType.number,
              validator: (v) => (v == null || v.trim().isEmpty || RegExp(r'^-?[0-9]{3,32}$').hasMatch(v.trim()))
                  ? null
                  : 'A Telegram chat id is a number',
            ),
            if (_error != null) ...[
              const SizedBox(height: 16),
              Text(_error!, style: TextStyle(color: Theme.of(context).colorScheme.error)),
            ],
            const SizedBox(height: 24),
            FilledButton(onPressed: _busy ? null : _save, child: Text(_busy ? 'Saving…' : 'Save contact')),
          ]),
        ),
      ),
    );
  }
}
