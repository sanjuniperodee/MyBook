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

/// Один диалог: сообщения, права, шаблоны, счета и отправка (текст, голосовое, файлы) с мгновенным показом.
class ChatController extends ChangeNotifier {
  ChatController({required this.api, required this.live, required this.chatId}) {
    _sub = live.events.listen((e) {
      if (e.type == 'tick' || (e.type == 'chat' && (e.conversationId == null || e.conversationId == chatId))) _soon();
    });
  }

  final ApiClient api;
  final LiveService live;
  final String chatId;

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
    final m = Message(id: 'local-${++_seq}', outgoing: true, type: type, text: text, media: null, status: 'sending', error: null, author: null, at: DateTime.now(), replyTo: replyTo == null ? null : ReplyQuote(id: replyTo!.id, text: replyTo!.text, type: replyTo!.type, outgoing: replyTo!.outgoing, author: replyTo!.author), localPath: localPath, durationMs: durationMs);
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
      final type = mimeType.startsWith('image/') ? 'image' : mimeType.startsWith('video/') ? 'video' : mimeType.startsWith('audio/') ? 'audio' : 'document';
      final local = _pending(type: type, text: type == 'document' ? name : (i == 0 ? caption : ''), localPath: f.path);
      notifyListeners();
      try {
        final r = await api.upload('/api/admin/chats/$chatId/files', field: 'files', file: f, filename: name, contentType: mimeType, fields: {if (i == 0 && caption.isNotEmpty) 'caption': caption}) as Map<String, dynamic>;
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
