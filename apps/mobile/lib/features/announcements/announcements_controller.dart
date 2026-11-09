import 'dart:async';

import 'package:flutter/foundation.dart';

import '../../core/api_client.dart';
import '../../core/constants.dart';
import '../../data/models.dart';
import '../../data/repositories.dart';
import '../../services/realtime_service.dart';

/// Live announcements for the home screen and the announcements list.
/// Loaded over REST; Socket.io adds new ones, applies edits and removes
/// withdrawn ones while the app is open. Expired ones drop out on their own.
class AnnouncementsController extends ChangeNotifier {
  AnnouncementsController(this._repo, RealtimeChannel realtime, {DateTime Function()? clock})
      : _clock = clock ?? DateTime.now {
    _sub = realtime.events.listen(_onEvent);
  }

  final AnnouncementsRepository _repo;
  final DateTime Function() _clock;
  late final StreamSubscription<RealtimeEvent> _sub;
  List<Announcement> _items = [];
  bool loaded = false;
  String? error;

  /// Live now, urgent first, then newest first.
  List<Announcement> get items {
    final now = _clock();
    final live = _items.where((a) => a.isLiveAt(now)).toList()
      ..sort((a, b) {
        if (a.isUrgent != b.isUrgent) return a.isUrgent ? -1 : 1;
        return b.publishedAt.compareTo(a.publishedAt);
      });
    return live;
  }

  Future<void> load() async {
    try {
      _items = await _repo.live();
      error = null;
    } on ApiException catch (e) {
      error = e.message;
    }
    loaded = true;
    notifyListeners();
  }

  void _onEvent(RealtimeEvent e) {
    if (e.name != SocketEvents.announcementLive && e.name != SocketEvents.announcementUpdated) return;
    final raw = e.data['announcement'];
    if (raw is! Map) return;
    final a = Announcement.fromJson(Map<String, dynamic>.from(raw));
    _items = [..._items.where((x) => x.id != a.id)];
    final state = e.data['state'] as String?;
    if (e.name == SocketEvents.announcementLive || state == null || state == 'LIVE') _items.add(a);
    notifyListeners();
  }

  @override
  void dispose() {
    _sub.cancel();
    super.dispose();
  }
}
