import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../api/mybook_api.g.dart' as v1api;
import '../core/api.dart';
import 'data/models.dart';
import 'data/session.dart';
import 'screens/book_screen.dart';
import 'screens/help_sheet.dart';
import 'screens/order_screen.dart';
import 'ui/motion.dart';

/// Среда APNs клиентского запуска: Xcode / flutter run — sandbox, TestFlight и App Store — production.
const clientApnsEnvironment = String.fromEnvironment(
  'APNS_ENV',
  defaultValue: kReleaseMode ? 'production' : 'sandbox',
);

const _fcmApiKey = String.fromEnvironment('FCM_API_KEY');
const _fcmAndroidAppId = String.fromEnvironment('FCM_ANDROID_APP_ID');
const _fcmProjectId = String.fromEnvironment('FCM_PROJECT_ID');
const _fcmSenderId = String.fromEnvironment('FCM_SENDER_ID');

/// Цель перехода по нажатию на push-уведомление в клиентском приложении «MyBooks».
class ClientPushTarget {
  const ClientPushTarget({
    this.kind,
    this.bookId,
    this.orderId,
    this.openHelp = false,
  });

  final String? kind;
  final String? bookId;
  final String? orderId;
  final bool openHelp;

  bool get isEmpty => bookId == null && orderId == null;

  /// Разбор payload из APNs/FCM: ссылка кабинета (`/books/<id>`, `/orders/<id>`, с префиксом локали или полным URL)
  /// либо структура/JSON с полями `kind`, `bookId`, `orderId`, `link`.
  static ClientPushTarget parse(Object? raw) {
    if (raw == null) return const ClientPushTarget();
    if (raw is Map) {
      return _fromMap(raw);
    }
    if (raw is! String) return const ClientPushTarget();
    final trimmed = raw.trim();
    if (trimmed.isEmpty) return const ClientPushTarget();
    if (trimmed.startsWith('{')) {
      try {
        final decoded = jsonDecode(trimmed);
        if (decoded is Map) return _fromMap(decoded);
      } catch (_) {}
    }
    return _fromLink(trimmed);
  }

  static ClientPushTarget _fromMap(Map<dynamic, dynamic> map) {
    final kind = _nonEmpty(map['kind']);
    final link = _nonEmpty(map['link']);
    final fromLink = link == null ? const ClientPushTarget() : _fromLink(link);
    final bookId = _nonEmpty(map['bookId']) ?? fromLink.bookId;
    final orderId = _nonEmpty(map['orderId']) ?? fromLink.orderId;
    final openHelp = fromLink.openHelp || map['help'] == true || map['help'] == '1';
    return ClientPushTarget(
      kind: kind ?? fromLink.kind,
      bookId: bookId,
      orderId: orderId,
      openHelp: openHelp,
    );
  }

  static ClientPushTarget _fromLink(String raw) {
    final uri = Uri.tryParse(raw);
    final path = uri?.path ?? raw;
    final openHelp = uri?.queryParameters['help'] == '1';
    final order = RegExp(r'^/(?:(?:kk|uz|en)/)?orders/([^/?#]+)$').firstMatch(path);
    if (order != null) {
      return ClientPushTarget(orderId: order.group(1));
    }
    final book = RegExp(r'^/(?:(?:kk|uz|en)/)?books/([^/?#]+)$').firstMatch(path);
    if (book != null) {
      return ClientPushTarget(bookId: book.group(1), openHelp: openHelp);
    }
    return const ClientPushTarget();
  }

  static String? _nonEmpty(Object? v) {
    if (v is! String) return null;
    final s = v.trim();
    return s.isEmpty ? null : s;
  }

  /// Приоритет экрана при открытии: для заказа (`order_paid`, `order_shipped` или когда есть только `orderId`) —
  /// экран заказа, для книги (`book_ready`, `manager_reply` с книгой/помощником) — экран книги.
  bool get prefersOrder {
    if (orderId == null) return false;
    if (bookId == null) return true;
    if (openHelp || kind == 'book_ready') return false;
    return true;
  }
}

/// Платформенный мост push (APNs на iOS, FCM на Android) — выделен в интерфейс для тестов без нативных плагинов.
abstract class ClientPushPlatform {
  String? get platformName;
  Future<void> initialize({
    required Future<void> Function(String token) onToken,
    required void Function(Object? payload) onOpen,
  });
  Future<void> requestPermission();
  Future<void> registerDevice({Map<String, String>? androidOptions});
  Future<Object?> initialLaunchPayload();
}

/// Реальная платформенная реализация: тот же MethodChannel `kz.mybooks.mybooksSeller/push`, что у AppDelegate.swift
/// и MainActivity.kt, плюс `FlutterLocalNotificationsPlugin` для разрешений и перехвата тапа на iOS.
class NativeClientPushPlatform implements ClientPushPlatform {
  static const _channel = MethodChannel('kz.mybooks.mybooksSeller/push');
  final FlutterLocalNotificationsPlugin _plugin = FlutterLocalNotificationsPlugin();
  bool _initialized = false;

  @override
  String? get platformName {
    if (kIsWeb) return null;
    if (Platform.isIOS) return 'ios';
    if (Platform.isAndroid) return 'android';
    return null;
  }

  @override
  Future<void> initialize({
    required Future<void> Function(String token) onToken,
    required void Function(Object? payload) onOpen,
  }) async {
    if (_initialized) return;
    _initialized = true;
    _channel.setMethodCallHandler((call) async {
      if (call.method == 'token' && call.arguments is String) {
        await onToken(call.arguments as String);
      } else if (call.method == 'open') {
        onOpen(call.arguments);
      }
    });
    try {
      await _plugin.initialize(
        settings: const InitializationSettings(
          iOS: DarwinInitializationSettings(
            requestAlertPermission: false,
            requestBadgePermission: false,
            requestSoundPermission: false,
          ),
          android: AndroidInitializationSettings('@mipmap/ic_launcher'),
        ),
        onDidReceiveNotificationResponse: (r) => onOpen(r.payload),
      );
    } catch (_) {}
  }

  @override
  Future<void> requestPermission() async {
    try {
      final ios = _plugin.resolvePlatformSpecificImplementation<IOSFlutterLocalNotificationsPlugin>();
      await ios?.requestPermissions(alert: true, badge: true, sound: true);
      final android = _plugin.resolvePlatformSpecificImplementation<AndroidFlutterLocalNotificationsPlugin>();
      await android?.requestNotificationsPermission();
    } catch (_) {}
  }

  @override
  Future<void> registerDevice({Map<String, String>? androidOptions}) async {
    try {
      if (Platform.isIOS) {
        await _channel.invokeMethod<void>('register');
      } else if (Platform.isAndroid) {
        final opts = androidOptions ?? _defaultAndroidOptions();
        if (opts != null) {
          await _channel.invokeMethod<void>('registerAndroid', opts);
        } else {
          await _channel.invokeMethod<void>('register');
        }
      }
    } on PlatformException {
      // Нет APNs/Google Play или Firebase ещё не сконфигурирован — остальной кабинет работает без push.
    } on MissingPluginException {
      // Тестовое окружение без нативного канала.
    }
  }

  @override
  Future<Object?> initialLaunchPayload() async {
    try {
      final details = await _plugin.getNotificationAppLaunchDetails();
      if (details?.didNotificationLaunchApp == true) {
        final payload = details?.notificationResponse?.payload;
        if (payload != null && payload.isNotEmpty) return payload;
      }
      if (Platform.isAndroid) {
        return await _channel.invokeMethod<String>('initialLink');
      }
    } catch (_) {}
    return null;
  }

  static Map<String, String>? _defaultAndroidOptions() {
    if (_fcmApiKey.isEmpty || _fcmAndroidAppId.isEmpty || _fcmProjectId.isEmpty) return null;
    return {
      'apiKey': _fcmApiKey,
      'appId': _fcmAndroidAppId,
      'projectId': _fcmProjectId,
      'senderId': _fcmSenderId,
    };
  }
}

/// Абстракция хранилища последнего push-токена клиента (по умолчанию SharedPreferences).
abstract class PushTokenStore {
  Future<String?> read();
  Future<void> write(String token);
  Future<void> clear();
}

class PrefsPushTokenStore implements PushTokenStore {
  static const _key = 'client_push_token';

  @override
  Future<String?> read() async {
    final prefs = await SharedPreferences.getInstance();
    return prefs.getString(_key);
  }

  @override
  Future<void> write(String token) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_key, token);
  }

  @override
  Future<void> clear() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove(_key);
  }
}

typedef RegisterDeviceFn = Future<bool> Function(v1api.DeviceBody body);
typedef ForgetDeviceFn = Future<void> Function(v1api.DeviceForgetBody body);
typedef OpenTargetFn = void Function(ClientPushTarget target);

/// Push-уведомления клиентского приложения «MyBooks»:
/// - запрашивает токен APNs/FCM и регистрирует его через `meDevicePut` после входа / старта сессии;
/// - отписывает устройство через `meDeviceDelete` при выходе или удалении аккаунта;
/// - открывает нужную книгу или заказ при нажатии на уведомление (в том числе при холодном запуске).
class ClientPush {
  ClientPush({
    required this.registerDevice,
    required this.forgetDevice,
    required this.isLoggedIn,
    ClientPushPlatform? platform,
    PushTokenStore? tokenStore,
    GlobalKey<NavigatorState>? navigatorKey,
    this.onOpen,
    this.environment = clientApnsEnvironment,
    this.androidOptionsProvider,
    this.needsNavigator = false,
  })  : _platform = platform ?? NativeClientPushPlatform(),
        _tokenStore = tokenStore ?? PrefsPushTokenStore(),
        navigatorKey = navigatorKey ?? GlobalKey<NavigatorState>();

  factory ClientPush.forSession(
    ClientSession session, {
    ClientPushPlatform? platform,
    PushTokenStore? tokenStore,
    GlobalKey<NavigatorState>? navigatorKey,
    OpenTargetFn? onOpen,
    String environment = clientApnsEnvironment,
    Future<Map<String, String>?> Function()? androidOptionsProvider,
  }) {
    final navKey = navigatorKey ?? GlobalKey<NavigatorState>();
    return ClientPush(
      platform: platform,
      tokenStore: tokenStore,
      navigatorKey: navKey,
      environment: environment,
      androidOptionsProvider: androidOptionsProvider,
      needsNavigator: onOpen == null,
      isLoggedIn: () => session.status == ClientStatus.loggedIn && session.api.token != null,
      registerDevice: (body) async {
        final r = await session.backend.call(() => session.backend.contract.meDevicePut(body: body));
        return r.serverReady;
      },
      forgetDevice: (body) async {
        final token = session.api.token;
        if (token == null) return;
        session.backend.contract.token = token;
        await session.backend.contract.meDeviceDelete(body: body);
      },
      onOpen: onOpen ?? (target) => _openInNavigator(navKey, session, target),
    );
  }

  final GlobalKey<NavigatorState> navigatorKey;
  final RegisterDeviceFn registerDevice;
  final ForgetDeviceFn forgetDevice;
  final bool Function() isLoggedIn;
  final ClientPushPlatform _platform;
  final PushTokenStore _tokenStore;
  final OpenTargetFn? onOpen;
  final String environment;
  final Future<Map<String, String>?> Function()? androidOptionsProvider;
  final bool needsNavigator;

  bool _initialized = false;
  bool serverReady = false;
  String? _lastToken;
  String? _registeredToken;
  ClientPushTarget? _pendingTarget;

  ClientPushTarget? get pendingTarget => _pendingTarget;

  /// Поднять обработчик нативного канала и проверить, не запустилось ли приложение тапом по уведомлению.
  Future<void> init() async {
    if (_initialized) return;
    _initialized = true;
    await _platform.initialize(
      onToken: _handleToken,
      onOpen: handleTap,
    );
    final initial = await _platform.initialLaunchPayload();
    if (initial != null) handleTap(initial);
  }

  /// Вызывается после успешного входа или восстановления сессии.
  Future<void> onLoggedIn() async {
    await init();
    await _platform.requestPermission();
    final opts = androidOptionsProvider != null ? await androidOptionsProvider!() : null;
    await _platform.registerDevice(androidOptions: opts);
    final cached = _lastToken ?? await _tokenStore.read();
    if (cached != null && cached.isNotEmpty) {
      await _handleToken(cached);
    }
    flushPending();
  }

  /// Отписать телефон на сервере перед выходом или удалением аккаунта и очистить сохранённый токен.
  Future<void> unregister() async {
    final token = _lastToken ?? await _tokenStore.read();
    _registeredToken = null;
    if (token == null || token.isEmpty) return;
    try {
      await forgetDevice(v1api.DeviceForgetBody(token: token));
    } on ApiException {
      // Не удалось связаться с сервером — APNs/FCM удалит недействительный токен при следующей отправке.
    } catch (_) {}
    try {
      await _tokenStore.clear();
    } catch (_) {}
  }

  /// Сброс внутреннего состояния после очистки сессии (например, при истёкшем токене).
  void onLoggedOut() {
    _registeredToken = null;
  }

  /// Обработка тапа по push-уведомлению: если сессия активна и навигатор готов — открывает сразу, иначе откладывает.
  void handleTap(Object? payload) {
    final target = ClientPushTarget.parse(payload);
    if (target.isEmpty) return;
    _pendingTarget = target;
    flushPending();
  }

  /// Выполнить отложенный переход по уведомлению, когда навигатор и сессия готовы.
  bool flushPending() {
    final target = _pendingTarget;
    if (target == null || !isLoggedIn()) return false;
    final handler = onOpen;
    if (handler == null) return false;
    if (needsNavigator && navigatorKey.currentState == null) return false;
    _pendingTarget = null;
    handler(target);
    return true;
  }

  Future<void> _handleToken(String token) async {
    final trimmed = token.trim();
    if (trimmed.isEmpty) return;
    _lastToken = trimmed;
    if (!isLoggedIn()) return;
    if (_registeredToken == trimmed) return;
    final platform = _platform.platformName;
    if (platform == null) return;
    try {
      serverReady = await registerDevice(
        v1api.DeviceBody(
          platform: platform,
          token: trimmed,
          environment: environment,
        ),
      );
      _registeredToken = trimmed;
      await _tokenStore.write(trimmed);
    } on ApiException {
      // Нет сети — повторим при следующем входе или запуске.
    } catch (_) {}
  }

  static void _openInNavigator(
    GlobalKey<NavigatorState> navKey,
    ClientSession session,
    ClientPushTarget target,
  ) {
    final nav = navKey.currentState;
    if (nav == null) return;
    if (target.prefersOrder && target.orderId != null) {
      nav.push(CabinetRoute(builder: (_) => OrderScreen(orderId: target.orderId!)));
      return;
    }
    final bookId = target.bookId;
    if (bookId != null) {
      final hub = session.hubs[bookId];
      final summary = BookSummary(
        id: bookId,
        title: hub?.title ?? '',
        status: 'draft',
        answered: 0,
        questions: 0,
        photos: 0,
      );
      nav.push(CabinetRoute(builder: (_) => BookScreen(summary: summary)));
      if (target.openHelp) {
        WidgetsBinding.instance.addPostFrameCallback((_) {
          final ctx = navKey.currentContext;
          if (ctx != null) {
            showHelp(ctx, bookId: bookId, section: 'overview');
          }
        });
      }
    }
  }
}
