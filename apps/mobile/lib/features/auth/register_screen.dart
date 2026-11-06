import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';

import '../../services/auth_service.dart';
import '../../widgets/common.dart';
import 'validators.dart';

class RegisterScreen extends StatefulWidget {
  const RegisterScreen({super.key});
  @override
  State<RegisterScreen> createState() => _RegisterScreenState();
}

class _RegisterScreenState extends State<RegisterScreen> {
  final _form = GlobalKey<FormState>();
  final _name = TextEditingController();
  final _matric = TextEditingController();
  final _phone = TextEditingController(text: '+60');
  final _email = TextEditingController();
  final _password = TextEditingController();
  final _confirm = TextEditingController();
  bool _busy = false;
  String? _error;
  bool _awaitingConfirmation = false;

  @override
  void dispose() {
    for (final c in [_name, _matric, _phone, _email, _password, _confirm]) {
      c.dispose();
    }
    super.dispose();
  }

  Future<void> _submit() async {
    if (!_form.currentState!.validate()) return;
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final needsConfirmation = await context.read<AuthService>().register(
            email: _email.text,
            password: _password.text,
            fullName: _name.text,
            matricOrStaffId: _matric.text,
            phoneNumber: _phone.text,
          );
      if (needsConfirmation) setState(() => _awaitingConfirmation = true);
    } on AuthFailure catch (e) {
      setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_awaitingConfirmation) {
      return Scaffold(
        appBar: AppBar(),
        body: EmptyView(
          icon: Icons.mark_email_unread_outlined,
          title: 'Confirm your email',
          message: 'We sent a confirmation link to ${_email.text.trim()}. Open it, then sign in.',
          action: FilledButton(onPressed: () => context.go('/login'), child: const Text('Go to sign in')),
        ),
      );
    }

    return Scaffold(
      appBar: AppBar(leading: BackButton(onPressed: () => context.go('/welcome')), title: const Text('Create account')),
      body: SafeArea(
        child: Form(
          key: _form,
          child: ListView(padding: const EdgeInsets.fromLTRB(24, 8, 24, 24), children: [
            Text('For USM students and staff. Fields marked * are required.', style: Theme.of(context).textTheme.bodySmall),
            const SizedBox(height: 20),
            TextFormField(
              controller: _name,
              decoration: const InputDecoration(labelText: 'Full name *'),
              textCapitalization: TextCapitalization.words,
              autofillHints: const [AutofillHints.name],
              validator: (v) => requiredText(v, 'full name'),
            ),
            const SizedBox(height: 16),
            TextFormField(
              controller: _matric,
              decoration: const InputDecoration(labelText: 'Matric or staff number *'),
              validator: (v) => requiredText(v, 'matric or staff number'),
            ),
            const SizedBox(height: 16),
            TextFormField(
              controller: _phone,
              decoration: const InputDecoration(
                labelText: 'Phone number *',
                helperText: 'Shared with USM Security only if you raise an alert',
              ),
              keyboardType: TextInputType.phone,
              autofillHints: const [AutofillHints.telephoneNumber],
              validator: validatePhone,
            ),
            const SizedBox(height: 16),
            TextFormField(
              controller: _email,
              decoration: const InputDecoration(labelText: 'University email *', hintText: 'name@student.usm.my'),
              keyboardType: TextInputType.emailAddress,
              autofillHints: const [AutofillHints.email],
              validator: validateEmail,
            ),
            const SizedBox(height: 16),
            TextFormField(
              controller: _password,
              decoration: const InputDecoration(labelText: 'Password *', helperText: 'At least 8 characters'),
              obscureText: true,
              autofillHints: const [AutofillHints.newPassword],
              validator: validatePassword,
            ),
            const SizedBox(height: 16),
            TextFormField(
              controller: _confirm,
              decoration: const InputDecoration(labelText: 'Confirm password *'),
              obscureText: true,
              validator: (v) => v != _password.text ? 'Passwords do not match' : null,
            ),
            if (_error != null) ...[
              const SizedBox(height: 16),
              Text(_error!, style: TextStyle(color: Theme.of(context).colorScheme.error)),
            ],
            const SizedBox(height: 24),
            FilledButton(onPressed: _busy ? null : _submit, child: Text(_busy ? 'Creating account…' : 'Create account')),
          ]),
        ),
      ),
    );
  }
}
