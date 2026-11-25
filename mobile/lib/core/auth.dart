import 'package:flutter/foundation.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../api/mybook_api.g.dart' as v1api;
import 'api.dart';
import 'notifier.dart';
import 'v1.dart';

const defaultServer = String.fromEnvironment('SERVER_URL', defaultValue: 'https://mybooks.kz');

/// Только для отладки: готовый токен сессии из --dart-define=DEV_TOKEN=… (в релизной сборке игнорируется).
const _devToken = String.fromEnvironment('DEV_TOKEN');

/// Кто вошёл: имя, роль, права и счётчики для бейджей.
class Staff {
  Staff({required this.id, required this.name, required this.email, required this.role, required this.permissions, required this.onShift, required this.unread, this.layout = 'sales'});
  final String id;
  final String name;
  final String email;
  final String role;

  /// Раскладка приложения по правам (сервер решает): leader | sales | production | analyst | support | basic.
  final String layout;
  final Set<String> permissions;
  bool onShift;
  int unread;

  bool can(String p) => permissions.contains(p);

  factory Staff.fromV1(v1api.CrmMe m) => Staff(
        id: m.id,
        name: m.name,
        email: m.email,
        role: m.role,
        layout: m.layout,
        permissions: m.permissions.toSet(),
        onShift: m.onShift,
        unread: m.unread,
      );

  factory Staff.fromJson(Map<String, dynamic> j) => Staff(
        id: j['id'] as String,
        name: (j['name'] as String?) ?? '',
        email: (j['email'] as String?) ?? '',
        role: (j['role'] as String?) ?? '',
        layout: (j['layout'] as String?) ?? 'sales',
        permissions: {for (final p in (j['permissions'] as List)) p as String},
        onShift: j['onShift'] == true,
        unread: (j['unread'] as num?)?.toInt() ?? 0,
      );
}

enum AuthStatus { loading, loggedOut, loggedIn }

/// Вход и сессия: адрес сервера и токен хранятся на устройстве (токен — в защищённом хранилище).
class AuthState extends ChangeNotifier {
  AuthState() : api = ApiClient(baseUrl: defaultServer) {
    api.onUnauthorized = _expired;
  }

  final ApiClient api;
  final _secure = const FlutterSecureStorage();
  AuthStatus status = AuthStatus.loading;
  Staff? staff;
  String? notice;

  /// Для второго шага входа (2FA).
  String? _ticket;
  bool get needsCode => _ticket != null;

  String get server => api.baseUrl;

  Future<void> restore() async {
    final prefs = await SharedPreferences.getInstance();
    api.baseUrl = prefs.getString('server') ?? defaultServer;
    api.token = (kDebugMode && _devToken.isNotEmpty) ? _devToken : await _secure.read(key: 'token');
    if (api.token == null) {
      status = AuthStatus.loggedOut;
      notifyListeners();
      return;
    }
    try {
      staff = Staff.fromV1(await v1(api, (c) => c.crmMe()));
      status = AuthStatus.loggedIn;
    } on ApiException catch (e) {
      // Нет сети — оставляем вход, пусть экраны покажут ошибку; сессия закрыта — на экран входа.
      if (e.status == 0) {
        status = AuthStatus.loggedOut;
        notice = e.message;
      } else {
        await _clear();
      }
    }
    notifyListeners();
  }

  Future<void> setServer(String url) async {
    var v = url.trim();
    if (v.isEmpty) v = defaultServer;
    if (!v.startsWith('http://') && !v.startsWith('https://')) v = 'https://$v';
    api.baseUrl = v.replaceAll(RegExp(r'/+$'), '');
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString('server', api.baseUrl);
    notifyListeners();
  }

  Future<void> login(String login, String password) async {
    final r = await v1(api, (c) => c.authLogin(body: v1api.LoginBody(login: login, password: password)));
    if (r.secondFactorTicket != null) {
      _ticket = r.secondFactorTicket;
      notifyListeners();
      return;
    }
    final session = r.session;
    if (session == null) throw ApiException(401, 'Не удалось войти');
    await _openSession(session);
  }

  Future<void> verifyCode(String code) async {
    final r = await v1(api, (c) => c.authSecondFactor(body: v1api.SecondFactorBody(ticket: _ticket ?? '', code: code)));
    _ticket = null;
    await _openSession(r);
  }

  void cancelCode() {
    _ticket = null;
    notifyListeners();
  }

  Future<void> _openSession(v1api.Session session) async {
    if (!session.user.isStaff) {
      api.token = session.token;
      try {
        await v1(api, (c) => c.authLogout());
      } on ApiException {
        // Не критично: клиентская сессия не должна остаться на устройстве.
      }
      api.token = null;
      throw ApiException(403, 'Доступ только для сотрудников');
    }
    api.token = session.token;
    await _secure.write(key: 'token', value: api.token);
    try {
      staff = Staff.fromV1(await v1(api, (c) => c.crmMe()));
    } on ApiException {
      // Вход заблокирован правилами безопасности CRM (сеть, обязательная 2FA).
      await _clear();
      notifyListeners();
      rethrow;
    }
    status = AuthStatus.loggedIn;
    notice = null;
    notifyListeners();
  }

  Future<void> logout() async {
    await Notifier.forgetDevice(api);
    try {
      await v1(api, (c) => c.authLogout());
    } on ApiException {
      // Сервер недоступен — токен всё равно забываем.
    }
    await _clear();
    notifyListeners();
  }

  void _expired() {
    notice = 'Сессия закрыта. Войдите снова.';
    _clear().then((_) => notifyListeners());
  }

  Future<void> _clear() async {
    api.token = null;
    staff = null;
    _ticket = null;
    status = AuthStatus.loggedOut;
    await _secure.delete(key: 'token');
  }

  Future<void> refreshMe() async {
    try {
      staff = Staff.fromV1(await v1(api, (c) => c.crmMe()));
      notifyListeners();
    } on ApiException {
      // Бейдж подождёт следующего обновления.
    }
  }
}
