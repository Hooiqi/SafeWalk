import 'package:flutter/foundation.dart';

import '../../core/api_client.dart';
import '../../data/models.dart';
import '../../data/repositories.dart';

/// Loads and caches the user's trusted contacts (shared by the contacts
/// screen and the start-journey picker).
class ContactsController extends ChangeNotifier {
  ContactsController(this._repo);
  final ContactsRepository _repo;

  List<TrustedContact> contacts = const [];
  bool loading = false;
  String? error;
  bool loaded = false;

  Future<void> load() async {
    loading = true;
    error = null;
    notifyListeners();
    try {
      contacts = await _repo.list();
      loaded = true;
    } on ApiException catch (e) {
      error = e.message;
    } finally {
      loading = false;
      notifyListeners();
    }
  }

  Future<void> save({String? id, required Map<String, String?> fields}) async {
    if (id == null) {
      await _repo.create(fields);
    } else {
      await _repo.update(id, fields);
    }
    await load();
  }

  Future<void> delete(String id) async {
    await _repo.delete(id);
    await load();
  }
}
