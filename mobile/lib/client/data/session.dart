import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

import '../../core/api.dart';
import '../../core/auth.dart' show defaultServer;
import '../../core/cache.dart';
import 'backend.dart';
import 'models.dart';

enum ClientStatus { loading, loggedOut, loggedIn }

/// Вход клиента и его данные на телефоне: токен — в защищённом хранилище (свой ключ, не как у CRM), книги — в кэше
/// (LocalCache по пользователю): полка и последняя открытая книга видны сразу и без сети, сервер их обновляет.
class ClientSession extends ChangeNotifier {
  ClientSession() : api = ApiClient(baseUrl: defaultServer) {
    backend = FixtureBackend.enabled ? FixtureBackend() : ApiBackend(api);
    api.onUnauthorized = _expired;
  }

  final ApiClient api;
  late final ClientBackend backend;
  final _secure = const FlutterSecureStorage();
  ClientStatus status = ClientStatus.loading;
  ClientUser? user;
  String? notice;

  Future<void> restore() async {
    final token = FixtureBackend.enabled ? null : await _secure.read(key: 'client_token');
    if (token == null) {
      status = ClientStatus.loggedOut;
      return notifyListeners();
    }
    api.token = token;
    final cached = await _cachedUser();
    if (cached != null) {
      // Без сети — работаем с кэшем; «кто я» обновится, когда сеть появится.
      await _enter(cached);
      backend.me().then((u) {
        user = u;
        notifyListeners();
      }).catchError((Object _) {});
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
    if (!FixtureBackend.enabled) await _secure.write(key: 'client_token', value: r.token);
    await _enter(r.user);
  }

  Future<void> logout() async {
    try {
      await backend.logout();
    } catch (_) {}
    await _clear();
  }

  Future<void> _enter(ClientUser u) async {
    user = u;
    await LocalCache.setUser('client-${u.id}');
    if (!FixtureBackend.enabled) await _secure.write(key: 'client_user', value: jsonEncode({'id': u.id, 'name': u.name, 'phone': u.phone}));
    status = ClientStatus.loggedIn;
    notifyListeners();
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
    api.token = null;
    user = null;
    await _secure.delete(key: 'client_token');
    await _secure.delete(key: 'client_user');
    await LocalCache.setUser(null);
    status = ClientStatus.loggedOut;
    notifyListeners();
  }
}
