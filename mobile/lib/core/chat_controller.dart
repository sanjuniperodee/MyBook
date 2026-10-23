import 'dart:async';
import 'dart:io';

import 'package:flutter/foundation.dart';
import 'package:mime/mime.dart';

import '../models/chat.dart';
import 'api.dart';
import 'live.dart';

/// Результат отправки текста: ушло, либо сервер остановил (чужие реквизиты) и объяснил почему.
class SendResult {
  SendResult({this.blocked, this.error});
  final String? blocked;
  final String? error;
  bool get ok => blocked == null && error == null;
}

/// Куда можно переслать: диалог сотрудника (id, имя, канал, последнее сообщение).
class ForwardTarget {
  ForwardTarget({required this.id, required this.title, required this.channel, required this.last});
  final String id;
  final String title;
  final String channel;
  final String last;
  factory ForwardTarget.fromJson(Map<String, dynamic> j) =>
      ForwardTarget(id: j['id'] as String, title: (j['title'] as String?) ?? '', channel: (j['channel'] as String?) ?? '', last: (j['last'] as String?) ?? '');
}

/// Черновик шаблона из сообщения: текст с подстановками, название и что именно заменено.
class TemplateDraft {
  TemplateDraft({required this.title, required this.text, required this.replaced});
  final String title;
  final String text;
  final List<(String, String)> replaced;
}

/// Окно WhatsApp для «удалить у всех» — двое суток.
const _deleteWindow = Duration(hours: 48);

/// Один диалог: сообщения, права, шаблоны, счета и отправка (текст, голосовое, файлы) с мгновенным показом.
class ChatController extends ChangeNotifier {
  ChatController({required this.api, required this.live, required this.chatId, this.myId}) {
    _sub = live.events.listen((e) {
      if (e.type == 'tick' || (e.type == 'chat' && (e.conversationId == null || e.conversationId == chatId))) _soon();
    });
  }

  final ApiClient api;
  final LiveService live;
  final String chatId;

  /// Текущий сотрудник: своё сообщение можно удалить.
  final String? myId;

  ChatDetail? detail;
  String? error;
  bool loading = true;
  Message? replyTo;
  final List<Message> _local = [];
  StreamSubscription<LiveEvent>? _sub;
  Timer? _debounce;
  int _seq = 0;

  /// Сообщения сервера и ещё не подтверждённые локальные — по времени.
  List<Message> get messages {
    final all = [...?detail?.messages, ..._local];
    all.sort((a, b) => a.at.compareTo(b.at));
    return all;
  }

  // ─── выбор сообщений (как в WhatsApp): отмеченные — для пересылки, удаления и шаблона ──────────────────────────

  /// Отмеченные сообщения; null — обычная лента.
  Set<String>? selected;

  bool get selecting => selected != null;

  bool isSelectable(Message m) => !m.deleted && !m.id.startsWith('local-');

  void startSelect(Message m) {
    if (!isSelectable(m)) return;
    selected = {m.id};
    notifyListeners();
  }

  void toggleSelect(Message m) {
    if (selected == null || !isSelectable(m)) return;
    selected!.contains(m.id) ? selected!.remove(m.id) : selected!.add(m.id);
    notifyListeners();
  }

  void clearSelect() {
    selected = null;
    notifyListeners();
  }

  /// Отмеченные в порядке ленты.
  List<Message> get picked => selected == null ? const [] : messages.where((m) => selected!.contains(m.id) && isSelectable(m)).toList();

  bool canForward(Message m) => (detail?.perms.canReply ?? false) && isSelectable(m) && !m.internal && (m.text.isNotEmpty || m.type != 'text');

  bool canRemove(Message m) => isSelectable(m) && m.outgoing && m.authorId != null && m.authorId == myId && (m.internal || m.isFailed || DateTime.now().difference(m.at) < _deleteWindow);

  /// Текст отмеченных сообщений клиентов и менеджеров (не заметок) — для шаблона.
  String get pickedText => picked.where((m) => !m.internal && m.type == 'text' && m.text.trim().isNotEmpty).map((m) => m.text.trim()).join('\n');

  /// Диалоги, куда можно переслать (поиск по имени и номеру).
  Future<List<ForwardTarget>> forwardTargets(String q) async {
    final r = await api.get('/api/mobile/chats/targets', query: {'q': q}) as Map<String, dynamic>;
    return [for (final t in (r['targets'] as List)) ForwardTarget.fromJson(t as Map<String, dynamic>)];
  }

  /// Переслать отмеченные сообщения. Возвращает текст итога для уведомления и признак успеха.
  Future<(bool, String)> forwardPicked(List<String> targetIds) async {
    final ids = picked.map((m) => m.id).toList();
    try {
      final r = await api.post('/api/mobile/chats/$chatId/forward', body: {'messageIds': ids, 'targetIds': targetIds}) as Map<String, dynamic>;
      final failed = ((r['failed'] as List?) ?? const []).cast<String>();
      clearSelect();
      if (failed.isNotEmpty) return (true, 'Переслано: ${r['forwarded']} из ${r['total']}. Не ушло: ${failed.join('; ')}');
      return (true, ids.length == 1 ? (targetIds.length == 1 ? 'Переслано' : 'Переслано в ${targetIds.length} диалога') : 'Переслано сообщений: ${ids.length}');
    } on ApiException catch (e) {
      return (false, e.message);
    }
  }

  /// Удалить отмеченные (у всех, где это возможно). Возвращает текст ошибки.
  Future<String?> removePicked() async {
    final list = picked;
    final errors = <String>{};
    for (final m in list) {
      try {
        await api.delete('/api/mobile/chats/$chatId/messages/${m.id}');
      } on ApiException catch (e) {
        errors.add(e.message);
      }
    }
    clearSelect();
    await load(silent: true);
    return errors.isEmpty ? null : errors.join('; ');
  }

  /// Закрепить или открепить этот чат (личное закрепление).
  Future<String?> setPinned(bool pinned) async {
    try {
      await api.post('/api/mobile/chats/$chatId/pin', body: {'pinned': pinned});
      await load(silent: true);
      return null;
    } on ApiException catch (e) {
      return e.message;
    }
  }

  /// Шаблон из сообщения: код и ИИ заменяют данные клиента подстановками. Ошибка — текст.
  Future<(TemplateDraft?, String?)> draftTemplate(Message m) async {
    try {
      final r = await api.post('/api/mobile/templates/draft', body: {'chatId': chatId, 'messageId': m.id}) as Map<String, dynamic>;
      final replaced = [for (final x in ((r['replaced'] as List?) ?? const [])) ((x as Map<String, dynamic>)['was'] as String? ?? '', x['with'] as String? ?? '')];
      return (TemplateDraft(title: (r['title'] as String?) ?? '', text: (r['text'] as String?) ?? '', replaced: replaced), null);
    } on ApiException catch (e) {
      return (null, e.message);
    }
  }

  bool get canReply => (detail?.perms.canReply ?? false) && detail?.sendBlocker == null;

  void _soon() {
    _debounce?.cancel();
    _debounce = Timer(const Duration(milliseconds: 350), () => load(silent: true));
  }

  Future<void> load({bool silent = false}) async {
    if (!silent) {
      loading = true;
      notifyListeners();
    }
    try {
      final r = await api.get('/api/mobile/chats/$chatId') as Map<String, dynamic>;
      detail = ChatDetail.fromJson(r);
      // Локальное сообщение, которое сервер уже вернул (совпал текст и время), убираем — остаётся настоящее.
      _local.removeWhere((l) => !l.isFailed && detail!.messages.any((m) => m.outgoing && m.at.difference(l.at).inSeconds.abs() < 120 && _same(m, l)));
      error = null;
    } on ApiException catch (e) {
      error = e.message;
    }
    loading = false;
    notifyListeners();
  }

  bool _same(Message server, Message local) {
    if (local.type == 'text') return server.type == 'text' && server.text == local.text;
    return server.type == local.type;
  }

  Future<void> markRead() async {
    try {
      await api.post('/api/mobile/chats/$chatId/read');
    } on ApiException {
      // Счётчик погаснет при следующем обновлении.
    }
  }

  void setReply(Message? m) {
    replyTo = m;
    notifyListeners();
  }

  Message _pending({required String type, String text = '', String? localPath, int? durationMs}) {
    final m = Message(
      id: 'local-${++_seq}',
      outgoing: true,
      type: type,
      text: text,
      media: null,
      status: 'sending',
      error: null,
      author: null,
      at: DateTime.now(),
      replyTo: replyTo == null ? null : ReplyQuote(id: replyTo!.id, text: replyTo!.text, type: replyTo!.type, outgoing: replyTo!.outgoing, author: replyTo!.author),
      localPath: localPath,
      durationMs: durationMs,
    );
    _local.add(m);
    return m;
  }

  /// Текст клиенту. override — причина, чтобы отправить то, что сервер счёл чужими реквизитами.
  Future<SendResult> sendText(String text, {String? override, Message? retry}) async {
    final body = text.trim();
    if (body.isEmpty) return SendResult();
    final reply = retry?.replyTo?.id ?? replyTo?.id;
    final local = retry ?? _pending(type: 'text', text: body);
    local.status = 'sending';
    local.error = null;
    replyTo = null;
    notifyListeners();
    try {
      final r = await api.post('/api/mobile/chats/$chatId/messages', body: {'text': body, 'replyToId': reply, 'override': ?override}) as Map<String, dynamic>;
      if (r['blocked'] != null) {
        _local.remove(local);
        notifyListeners();
        return SendResult(blocked: r['blocked'] as String);
      }
      if (r['status'] == 'error') {
        local.status = 'error';
        local.error = r['error'] as String? ?? 'Не отправилось';
        notifyListeners();
        return SendResult(error: local.error);
      }
      await load(silent: true);
      return SendResult();
    } on ApiException catch (e) {
      local.status = 'error';
      local.error = e.message;
      notifyListeners();
      return SendResult(error: e.message);
    }
  }

  Future<String?> sendVoice(File file, Duration length) async {
    final local = _pending(type: 'audio', localPath: file.path, durationMs: length.inMilliseconds);
    final reply = replyTo?.id;
    replyTo = null;
    notifyListeners();
    try {
      final r = await api.upload('/api/mobile/chats/$chatId/voice', field: 'voice', file: file, filename: 'voice.m4a', contentType: 'audio/mp4', fields: {'replyToId': ?reply}) as Map<String, dynamic>;
      if (r['status'] == 'error') {
        local.status = 'error';
        local.error = r['error'] as String? ?? 'Не отправилось';
        notifyListeners();
        return local.error;
      }
      await load(silent: true);
      return null;
    } on ApiException catch (e) {
      local.status = 'error';
      local.error = e.message;
      notifyListeners();
      return e.message;
    }
  }

  /// Фото, видео и документы: файлы уходят по одному, по порядку; подпись — к первому.
  Future<String?> sendFiles(List<File> files, {String caption = ''}) async {
    String? problem;
    for (var i = 0; i < files.length; i++) {
      final f = files[i];
      final name = f.uri.pathSegments.last;
      final mimeType = lookupMimeType(f.path) ?? 'application/octet-stream';
      final type = mimeType.startsWith('image/')
          ? 'image'
          : mimeType.startsWith('video/')
          ? 'video'
          : mimeType.startsWith('audio/')
          ? 'audio'
          : 'document';
      final local = _pending(type: type, text: type == 'document' ? name : (i == 0 ? caption : ''), localPath: f.path);
      notifyListeners();
      try {
        final r =
            await api.upload('/api/admin/chats/$chatId/files', field: 'files', file: f, filename: name, contentType: mimeType, fields: {if (i == 0 && caption.isNotEmpty) 'caption': caption})
                as Map<String, dynamic>;
        final results = (r['results'] as List?) ?? const [];
        final err = results.isNotEmpty ? (results.first as Map<String, dynamic>)['error'] as String? : null;
        if (err != null) {
          local.status = 'error';
          local.error = err;
          problem = err;
        }
      } on ApiException catch (e) {
        local.status = 'error';
        local.error = e.message;
        problem = e.message;
      }
    }
    replyTo = null;
    await load(silent: true);
    return problem;
  }

  void discard(Message m) {
    _local.remove(m);
    notifyListeners();
  }

  Future<String?> edit(Message m, String text) async {
    try {
      await api.patch('/api/mobile/chats/$chatId/messages/${m.id}', body: {'text': text});
      await load(silent: true);
      return null;
    } on ApiException catch (e) {
      return e.message;
    }
  }

  Future<String?> remove(Message m) async {
    try {
      await api.delete('/api/mobile/chats/$chatId/messages/${m.id}');
      await load(silent: true);
      return null;
    } on ApiException catch (e) {
      return e.message;
    }
  }

  Future<String?> transcribe(Message m) async {
    try {
      final r = await api.post('/api/mobile/chats/$chatId/messages/${m.id}/transcribe') as Map<String, dynamic>;
      m.transcript = r['text'] as String?;
      notifyListeners();
      return null;
    } on ApiException catch (e) {
      return e.message;
    }
  }

  Future<String?> addNote(String text) async {
    try {
      await api.post('/api/mobile/chats/$chatId/note', body: {'text': text});
      await load(silent: true);
      return null;
    } on ApiException catch (e) {
      return e.message;
    }
  }

  Future<String?> setStatus(String status) async {
    try {
      await api.post('/api/mobile/chats/$chatId/status', body: {'status': status});
      await load(silent: true);
      return null;
    } on ApiException catch (e) {
      return e.message;
    }
  }

  Future<String?> createDeal() async {
    try {
      await api.post('/api/mobile/chats/$chatId/deal');
      await load(silent: true);
      return null;
    } on ApiException catch (e) {
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
