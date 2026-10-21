import 'dart:async';
import 'dart:convert';

import 'package:http/http.dart' as http;

import 'api.dart';

/// Событие CRM: новое сообщение (chat), уведомление (notify), звонок (call).
class LiveEvent {
  LiveEvent(this.type, this.conversationId);
  final String type;
  final String? conversationId;
}

/// Живые обновления: SSE-поток сервера (/api/admin/live/stream) с переподключением. Пока поток жив, экраны обновляются
/// сразу; на случай обрыва есть периодическое обновление (tick).
class LiveService {
  LiveService(this.api);
  final ApiClient api;

  final _events = StreamController<LiveEvent>.broadcast();
  Stream<LiveEvent> get events => _events.stream;

  http.Client? _client;
  bool _running = false;
  bool connected = false;
  Timer? _tick;

  void start() {
    if (_running) return;
    _running = true;
    _loop();
    // Страховка: даже без потока раз в полминуты просим экраны обновиться.
    _tick = Timer.periodic(const Duration(seconds: 30), (_) => _events.add(LiveEvent('tick', null)));
  }

  void stop() {
    _running = false;
    connected = false;
    _tick?.cancel();
    _client?.close();
    _client = null;
  }

  Future<void> _loop() async {
    var delay = 2;
    while (_running) {
      try {
        _client = http.Client();
        final req = http.Request('GET', api.uri('/api/admin/live/stream'))
          ..headers.addAll(api.headers)
          ..headers['Accept'] = 'text/event-stream';
        final res = await _client!.send(req);
        if (res.statusCode != 200) throw ApiException(res.statusCode, 'stream');
        connected = true;
        delay = 2;
        await for (final line in res.stream.transform(utf8.decoder).transform(const LineSplitter())) {
          if (!line.startsWith('data:')) continue;
          try {
            final d = jsonDecode(line.substring(5).trim()) as Map<String, dynamic>;
            _events.add(LiveEvent((d['type'] as String?) ?? 'chat', d['conversationId'] as String?));
          } catch (_) {
            _events.add(LiveEvent('chat', null));
          }
        }
      } catch (_) {
        // Обрыв или нет сети — переподключимся.
      } finally {
        connected = false;
        _client?.close();
        _client = null;
      }
      if (!_running) break;
      await Future<void>.delayed(Duration(seconds: delay));
      delay = delay < 30 ? delay * 2 : 30;
    }
  }
}
