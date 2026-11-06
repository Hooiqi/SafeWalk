import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../core/api_client.dart';
import '../../core/theme.dart';
import '../../data/models.dart';
import '../../data/repositories.dart';
import '../../services/auth_service.dart';
import '../../services/trip_tracker.dart';
import '../../widgets/common.dart';
import '../auth/validators.dart';

class ProfileScreen extends StatefulWidget {
  const ProfileScreen({super.key});
  @override
  State<ProfileScreen> createState() => _ProfileScreenState();
}

class _ProfileScreenState extends State<ProfileScreen> {
  final _form = GlobalKey<FormState>();
  final _name = TextEditingController();
  final _matric = TextEditingController();
  final _phone = TextEditingController();
  UserProfile? _profile;
  String? _error;
  bool _saving = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _name.dispose();
    _matric.dispose();
    _phone.dispose();
    super.dispose();
  }

  void _fill(UserProfile p) {
    _profile = p;
    _name.text = p.fullName;
    _matric.text = p.matricOrStaffId ?? '';
    _phone.text = p.phoneNumber ?? '';
  }

  Future<void> _load() async {
    setState(() => _error = null);
    try {
      final p = await context.read<ProfileRepository>().me();
      if (mounted) setState(() => _fill(p));
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    }
  }

  Future<void> _save() async {
    if (!_form.currentState!.validate()) return;
    setState(() => _saving = true);
    try {
      final p = await context.read<ProfileRepository>().update({
        'full_name': _name.text.trim(),
        'matric_or_staff_id': _matric.text.trim().isEmpty ? null : _matric.text.trim(),
        'phone_number': _phone.text.trim().isEmpty ? null : _phone.text.trim(),
      });
      if (!mounted) return;
      setState(() => _fill(p));
      showMessage(context, 'Profile saved');
    } on ApiException catch (e) {
      if (mounted) showMessage(context, e.message);
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  Future<void> _signOut() async {
    if (context.read<TripTracker>().trip?.isOpen ?? false) {
      showMessage(context, 'Finish or cancel your journey before signing out.');
      return;
    }
    await context.read<AuthService>().signOut();
  }

  @override
  Widget build(BuildContext context) {
    final body = _profile == null
        ? (_error != null ? ErrorView(message: _error!, onRetry: _load) : const Center(child: CircularProgressIndicator()))
        : Form(
            key: _form,
            child: ListView(padding: const EdgeInsets.fromLTRB(24, 8, 24, 24), children: [
              Text(_profile!.email, style: Theme.of(context).textTheme.bodySmall),
              const SizedBox(height: 20),
              TextFormField(
                controller: _name,
                decoration: const InputDecoration(labelText: 'Full name *'),
                validator: (v) => requiredText(v, 'full name'),
              ),
              const SizedBox(height: 16),
              TextFormField(controller: _matric, decoration: const InputDecoration(labelText: 'Matric or staff number')),
              const SizedBox(height: 16),
              TextFormField(
                controller: _phone,
                decoration: const InputDecoration(
                  labelText: 'Phone number',
                  helperText: 'Given to USM Security only when an alert is raised',
                ),
                keyboardType: TextInputType.phone,
                validator: (v) => validatePhone(v, required: false),
              ),
              const SizedBox(height: 24),
              FilledButton(onPressed: _saving ? null : _save, child: Text(_saving ? 'Saving…' : 'Save changes')),
              const SizedBox(height: 32),
              const Divider(),
              const SizedBox(height: 16),
              Text(
                'Your location is shared only during a journey you start, with the contacts you choose, '
                'and with USM Security if you do not check in.',
                style: Theme.of(context).textTheme.bodySmall,
              ),
              const SizedBox(height: 16),
              OutlinedButton.icon(
                onPressed: _signOut,
                icon: const Icon(Icons.logout_rounded, color: SwColors.textMuted),
                label: const Text('Sign out'),
              ),
            ]),
          );
    return Scaffold(appBar: AppBar(title: const Text('Profile')), body: body);
  }
}
