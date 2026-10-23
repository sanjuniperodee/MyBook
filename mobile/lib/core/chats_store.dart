import 'dart:async';

import 'package:flutter/foundation.dart';

import '../models/chat.dart';
import 'api.dart';
import 'live.dart';

const chatFilters = {'open': 'Все', 'mine': 'Мои', 'unread': 'Непрочитанные', 'waiting': 'Ждут ответа', 'closed': 'Закрытые'};

/// Список диалогов: фильтр, поиск и обновление по событиям CRM.
class ChatsStore extends ChangeNotifier {
  ChatsStore(this.api, this.live) {
    _sub = live.events.listen((e) {
      if (e.type == 'chat' || e.type == 'notify' || e.type == 'tick') _soon();
    });
  }

  final ApiClient api;
  final LiveService live;
  StreamSubscription<LiveEvent>? _sub;
  Timer? _debounce;

  String filter = 'open';
  String query = '';
  List<ChatSummary> items = [];
  bool loading = false;
  bool loaded = false;
  String? error;

  int get unreadChats => items.where((c) => c.unread > 0).length;

  void _soon() {
    _debounce?.cancel();
    _debounce = Timer(const Duration(milliseconds: 400), load);
  }

  Future<void> setFilter(String f) async {
    if (f == filter) return;
    filter = f;
    items = [];
    loaded = false;
    notifyListeners();
    await load();
  }

  Future<void> setQuery(String q) async {
    query = q;
    await load();
  }

  Future<void> load() async {
    loading = true;
    try {
      final r = await api.get('/api/mobile/chats', query: {'f': filter, 'q': query}) as Map<String, dynamic>;
      items = [for (final c in (r['chats'] as List)) ChatSummary.fromJson(c as Map<String, dynamic>)];
      error = null;
      loaded = true;
    } on ApiException catch (e) {
      error = e.message;
    }
    loading = false;
    notifyListeners();
  }

  /// Диалог прочитан в приложении: счётчик в списке гаснет сразу, не дожидаясь ответа сервера.
  void markRead(String id) {
    final i = items.indexWhere((c) => c.id == id);
    if (i < 0 || items[i].unread == 0) return;
    final c = items[i];
    items[i] = ChatSummary(
      id: c.id,
      title: c.title,
      channel: c.channel,
      channelLabel: c.channelLabel,
      avatarUrl: c.avatarUrl,
      lastMessageAt: c.lastMessageAt,
      preview: c.preview,
      unread: 0,
      status: c.status,
      assignee: c.assignee,
      waitLabel: c.waitLabel,
      overdue: c.overdue,
      bot: c.bot,
      pinned: c.pinned,
    );
    notifyListeners();
  }

  /// Закрепить или открепить чат (личное закрепление): список перестраивается сразу, сервер подтверждает следом.
  Future<String?> pin(String id, bool pinned) async {
    final i = items.indexWhere((c) => c.id == id);
    if (i >= 0) {
      final c = items.removeAt(i);
      final moved = ChatSummary(
        id: c.id,
        title: c.title,
        channel: c.channel,
        channelLabel: c.channelLabel,
        avatarUrl: c.avatarUrl,
        lastMessageAt: c.lastMessageAt,
        preview: c.preview,
        unread: c.unread,
        status: c.status,
        assignee: c.assignee,
        waitLabel: c.waitLabel,
        overdue: c.overdue,
        bot: c.bot,
        pinned: pinned,
      );
      // Закреплённые — сверху, остальные — по времени, как отдаёт сервер.
      final firstFree = items.indexWhere((x) => !x.pinned);
      if (pinned) {
        items.insert(firstFree < 0 ? items.length : firstFree, moved);
      } else {
        final at = items.indexWhere((x) => !x.pinned && (x.lastMessageAt ?? DateTime(0)).isBefore(c.lastMessageAt ?? DateTime(0)));
        items.insert(at < 0 ? items.length : at, moved);
      }
      notifyListeners();
    }
    try {
      await api.post('/api/mobile/chats/$id/pin', body: {'pinned': pinned});
      return null;
    } on ApiException catch (e) {
      await load();
      return e.message;
    }
  }

  @override
  void dispose() {
    _sub?.cancel();
    _debounce?.cancel();
    super.dispose();
  }
}
