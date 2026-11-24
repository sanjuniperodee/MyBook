import 'dart:async';

import 'package:flutter/foundation.dart';

import '../models/chat.dart';
import 'api.dart';
import 'cache.dart';
import 'live.dart';

const chatFilters = {'open': 'Все', 'mine': 'Мои', 'unread': 'Непрочитанные', 'waiting': 'Ждут ответа', 'closed': 'Закрытые'};

/// Список диалогов: фильтр, поиск и обновление по событиям CRM.
class ChatsStore extends ChangeNotifier {
  ChatsStore(this.api, this.live) {
    _sub = live.events.listen((e) {
      if (e.type == 'chat' || e.type == 'tick' || e.type == 'resume') _soon();
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
  String? _etag;
  String? _etagKey;

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
    await _fromCache();
    await load();
  }

  Timer? _typing;

  /// Поиск по мере набора: запрос уходит, когда пальцы остановились (не на каждую букву).
  Future<void> setQuery(String q) async {
    query = q;
    _typing?.cancel();
    _typing = Timer(const Duration(milliseconds: 300), load);
  }

  final _prefetched = <String, DateTime>{};

  /// Непрочитанные диалоги заранее кладём в кэш телефона: по нажатию переписка уже на экране, без ожидания сервера.
  Future<void> _prefetch() async {
    final now = DateTime.now();
    final todo = items.where((c) => c.unread > 0 && (_prefetched[c.id] == null || now.difference(_prefetched[c.id]!) > const Duration(minutes: 2))).take(5).toList();
    for (final c in todo) {
      _prefetched[c.id] = now;
      try {
        final r = await api.get('/api/mobile/chats/${c.id}', query: {'limit': '40'}) as Map<String, dynamic>;
        await LocalCache.write('chat_${c.id}', r);
      } on ApiException {
        return;
      }
    }
  }

  /// Список из кэша телефона — до ответа сервера (вкладка «Чаты» открывается сразу со строками).
  Future<void> _fromCache() async {
    if (query.isNotEmpty) return;
    final cached = await LocalCache.read('chats_$filter');
    if (cached == null || loaded) return;
    try {
      items = [for (final c in (cached['chats'] as List)) ChatSummary.fromJson(c as Map<String, dynamic>)];
      loaded = true;
      notifyListeners();
    } catch (_) {}
  }

  bool _first = true;

  Future<void> load() async {
    if (_first) {
      _first = false;
      await _fromCache();
    }
    loading = true;
    final key = '$filter|$query';
    final hadError = error;
    var changed = !loaded;
    try {
      // ETag — только для того же фильтра и поиска: иначе 304 оставил бы на экране строки другого списка.
      final r = await api.getCached('/api/mobile/chats', query: {'f': filter, 'q': query}, etag: key == _etagKey && loaded ? _etag : null);
      if ('$filter|$query' != key) return; // пока ждали, сменили фильтр или поиск
      _etag = r.etag;
      _etagKey = key;
      final data = r.data as Map<String, dynamic>?;
      if (data != null) {
        items = [for (final c in (data['chats'] as List)) ChatSummary.fromJson(c as Map<String, dynamic>)];
        if (query.isEmpty) LocalCache.write('chats_$filter', data);
        changed = true;
        unawaited(_prefetch());
      }
      error = null;
      loaded = true;
    } on ApiException catch (e) {
      error = e.message;
    }
    loading = false;
    // 304 — строки те же: список не перерисовываем.
    if (changed || hadError != error) notifyListeners();
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
    _typing?.cancel();
    super.dispose();
  }
}
