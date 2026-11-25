import 'dart:async';
import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

import '../../core/api.dart';
import '../../core/auth.dart' show defaultServer;
import '../../core/cache.dart';
import '../../api/mybook_api.g.dart' as v1api;
import '../push.dart';
import 'backend.dart';
import 'stores.dart';
import 'models.dart';

enum ClientStatus { loading, loggedOut, loggedIn }

/// Вход клиента и его данные на телефоне: токен — в защищённом хранилище (свой ключ, не как у CRM), книги — в кэше
/// (LocalCache по пользователю): полка и последняя открытая книга видны сразу и без сети, сервер их обновляет.
class ClientSession extends ChangeNotifier {
  ClientSession({ClientPush? push}) : api = ApiClient(baseUrl: defaultServer) {
    backend = ApiBackend(api);
    api.onUnauthorized = _expired;
    this.push = push ?? ClientPush.forSession(this);
  }

  final ApiClient api;
  late final ClientBackend backend;
  late final ClientPush push;
  final _secure = const FlutterSecureStorage();
  ClientStatus status = ClientStatus.loading;
  ClientUser? user;
  String? notice;

  /// Книги, открытые в этом запуске: модель редактора с очередью несохранённых ответов и штаб — общие для экранов
  /// книги, редактора и фото; главную книгу полки загружаем заранее — «Продолжить писать» открывается без ожидания.
  final Map<String, BookStore> _books = {};
  final Map<String, v1api.CabinetBook> hubs = {};

  BookStore book(String id) =>
      _books.putIfAbsent(id, () => BookStore(backend, id)..load());

  /// Заранее: модель редактора и штаб книги (без ошибок — это только ускорение).
  Future<void> preload(String id) async {
    book(id);
    try {
      hubs[id] = await backend.hub(id);
    } catch (_) {}
  }

  Future<void> restore() async {
    final token = await _secure.read(key: 'client_token');
    if (token == null) {
      status = ClientStatus.loggedOut;
      return notifyListeners();
    }
    api.token = token;
    final cached = await _cachedUser();
    if (cached != null) {
      // Без сети — работаем с кэшем; «кто я» обновится, когда сеть появится.
      await _enter(cached);
      backend
          .me()
          .then((u) {
            user = u;
            notifyListeners();
          })
          .catchError((Object _) {});
      return;
    }
    try {
      await _enter(await backend.me());
    } on ApiException {
      status = ClientStatus.loggedOut;
      notifyListeners();
    }
  }

  Future<void> login(String login, String password) async {
    notice = null;
    final r = await backend.login(login.trim(), password);
    api.token = r.token;
    await _secure.write(key: 'client_token', value: r.token);
    await _enter(r.user);
  }

  /// Аккаунт удалён (сервер уже закрыл все сессии): данные на телефоне стираем, на входе — сообщение сервера.
  Future<void> accountDeleted(String message) async {
    await push.unregister();
    await _clear();
    notice = message;
    notifyListeners();
  }

  Future<void> logout() async {
    await push.unregister();
    try {
      await backend.logout();
    } catch (_) {}
    await _clear();
  }

  Future<void> _enter(ClientUser u) async {
    user = u;
    await LocalCache.setUser('client-${u.id}');
    await _secure.write(
      key: 'client_user',
      value: jsonEncode({'id': u.id, 'name': u.name, 'phone': u.phone}),
    );
    status = ClientStatus.loggedIn;
    notifyListeners();
    unawaited(push.onLoggedIn());
  }

  Future<ClientUser?> _cachedUser() async {
    final raw = await _secure.read(key: 'client_user');
    if (raw == null) return null;
    try {
      return ClientUser.fromJson(jsonDecode(raw) as Map<String, dynamic>);
    } catch (_) {
      return null;
    }
  }

  void _expired() {
    notice = 'Сессия закончилась — войдите снова';
    _clear();
  }

  Future<void> _clear() async {
    for (final b in _books.values) {
      b.dispose();
    }
    _books.clear();
    hubs.clear();
    api.token = null;
    user = null;
    push.onLoggedOut();
    await _secure.delete(key: 'client_token');
    await _secure.delete(key: 'client_user');
    await LocalCache.setUser(null);
    status = ClientStatus.loggedOut;
    notifyListeners();
  }
}
