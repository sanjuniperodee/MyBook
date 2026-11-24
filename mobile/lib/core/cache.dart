import 'dart:convert';
import 'dart:io';

import 'package:path_provider/path_provider.dart';

/// Кэш на телефоне: последний ответ сервера по списку чатов и по каждому диалогу. Экран открывается сразу с ним, а свежие
/// данные приходят следом — без пустого экрана и скелетов. Лежит в папке приложения (не в iCloud и не в общих файлах),
/// у каждого сотрудника своя папка; при выходе из аккаунта стирается.
class LocalCache {
  LocalCache._();

  static String? _user;
  static Directory? _dir;
  static Future<void> _ready = Future.value();

  /// Чей кэш: вызывается при входе (id сотрудника) и при выходе (null — стереть). Чтение и запись ждут, пока папка готова.
  static Future<void> setUser(String? userId) {
    if (userId == _user && _dir != null) return _ready;
    return _ready = _ready.then((_) => _switch(userId));
  }

  static Future<void> _switch(String? userId) async {
    final base = Directory('${(await getApplicationSupportDirectory()).path}/cache');
    if (userId == null) {
      _user = null;
      _dir = null;
      if (await base.exists()) await base.delete(recursive: true).catchError((_) => base);
      return;
    }
    _user = userId;
    _dir = Directory('${base.path}/$userId');
    await _dir!.create(recursive: true);
  }

  static File? _file(String key) => _dir == null ? null : File('${_dir!.path}/${key.replaceAll(RegExp(r'[^\w.-]'), '_')}.json');

  static Future<Map<String, dynamic>?> read(String key) async {
    await _ready;
    final f = _file(key);
    if (f == null) return null;
    try {
      if (!await f.exists()) return null;
      final data = jsonDecode(await f.readAsString());
      return data is Map<String, dynamic> ? data : null;
    } catch (_) {
      return null;
    }
  }

  /// Запись не ждём и не падаем: кэш — ускорение, а не источник правды.
  static Future<void> write(String key, Map<String, dynamic> value) async {
    await _ready;
    final f = _file(key);
    if (f == null) return;
    try {
      final tmp = File('${f.path}.tmp');
      await tmp.writeAsString(jsonEncode(value), flush: false);
      await tmp.rename(f.path);
    } catch (_) {}
  }
}
