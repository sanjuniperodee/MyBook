import 'dart:async';

import 'package:flutter/foundation.dart';

import '../api/mybook_api.g.dart' as v1api;
import '../models/work.dart';
import 'api.dart';
import 'live.dart';
import 'v1.dart';

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
  String? _etag;

  int get unread => items.where((n) => !n.read).length;

  Future<void> load({bool silent = false}) async {
    final hadError = error;
    var changed = !loaded;
    try {
      final r = await v1Cached(api, (c) => c.crmNotificationsList(limit: 80), etag: loaded ? _etag : null);
      _etag = r.etag;
      if (!r.notModified && r.data != null) {
        items = [
          for (final n in r.data!.notifications)
            AppNotification(
              id: n.id,
              kind: n.kind,
              title: n.title,
              body: n.body ?? '',
              link: n.link,
              read: n.read,
              at: DateTime.parse(n.at).toLocal(),
            ),
        ];
        changed = true;
      }
      error = null;
      loaded = true;
    } on ApiException catch (e) {
      if (!silent || !loaded) error = e.message;
    }
    if (changed || hadError != error) notifyListeners();
  }

  Future<void> markRead(AppNotification n) async {
    if (n.read) return;
    n.read = true;
    notifyListeners();
    try {
      await v1(api, (c) => c.crmNotificationsRead(body: v1api.CrmNotificationsRead(id: n.id)));
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
      await v1(api, (c) => c.crmNotificationsRead(body: const v1api.CrmNotificationsRead()));
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
