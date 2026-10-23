import 'dart:async';

import 'package:flutter/foundation.dart';

import '../models/work.dart';
import 'api.dart';
import 'live.dart';

/// Лента уведомлений сотрудника (то же, что колокольчик в CRM): список, число непрочитанных, «прочитать всё».
class NotificationsStore extends ChangeNotifier {
  NotificationsStore(this.api, this.live) {
    _sub = live.events.listen((e) {
      if (e.type == 'notify' || e.type == 'tick') load(silent: true);
    });
    load(silent: true);
  }

  final ApiClient api;
  final LiveService live;
  StreamSubscription<LiveEvent>? _sub;

  List<AppNotification> items = [];
  bool loaded = false;
  String? error;

  int get unread => items.where((n) => !n.read).length;

  Future<void> load({bool silent = false}) async {
    try {
      final r = await api.get('/api/mobile/notifications', query: {'limit': '80'}) as Map<String, dynamic>;
      items = [for (final n in (r['notifications'] as List)) AppNotification.fromJson(n as Map<String, dynamic>)];
      error = null;
      loaded = true;
    } on ApiException catch (e) {
      if (!silent || !loaded) error = e.message;
    }
    notifyListeners();
  }

  Future<void> markRead(AppNotification n) async {
    if (n.read) return;
    n.read = true;
    notifyListeners();
    try {
      await api.post('/api/mobile/notifications', body: {'id': n.id});
    } on ApiException {
      // Отметка подтянется при следующем обновлении.
    }
  }

  Future<void> markAllRead() async {
    for (final n in items) {
      n.read = true;
    }
    notifyListeners();
    try {
      await api.post('/api/mobile/notifications', body: <String, dynamic>{});
    } on ApiException {
      // Отметка подтянется при следующем обновлении.
    }
  }

  @override
  void dispose() {
    _sub?.cancel();
    super.dispose();
  }
}
