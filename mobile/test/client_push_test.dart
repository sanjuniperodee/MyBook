import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mybooks_seller/api/mybook_api.g.dart' as v1api;
import 'package:mybooks_seller/client/push.dart';

class _FakePlatform implements ClientPushPlatform {
  _FakePlatform({this.platformName = 'ios', this.launchPayload});

  @override
  final String? platformName;
  final Object? launchPayload;

  Future<void> Function(String token)? onToken;
  void Function(Object? payload)? onOpen;
  int initCount = 0;
  int permissionCount = 0;
  int registerCount = 0;
  Map<String, String>? lastAndroidOptions;

  @override
  Future<void> initialize({
    required Future<void> Function(String token) onToken,
    required void Function(Object? payload) onOpen,
  }) async {
    initCount++;
    this.onToken = onToken;
    this.onOpen = onOpen;
  }

  @override
  Future<void> requestPermission() async {
    permissionCount++;
  }

  @override
  Future<void> registerDevice({Map<String, String>? androidOptions}) async {
    registerCount++;
    lastAndroidOptions = androidOptions;
  }

  @override
  Future<Object?> initialLaunchPayload() async => launchPayload;
}

class _MemoryTokenStore implements PushTokenStore {
  String? value;

  @override
  Future<String?> read() async => value;

  @override
  Future<void> write(String token) async {
    value = token;
  }

  @override
  Future<void> clear() async {
    value = null;
  }
}

void main() {
  group('ClientPushTarget.parse', () {
    test('разбирает ссылки книги, заказа, локализованные пути и полные URL', () {
      final book = ClientPushTarget.parse('/books/book-123');
      expect(book.bookId, 'book-123');
      expect(book.orderId, isNull);
      expect(book.openHelp, isFalse);
      expect(book.prefersOrder, isFalse);

      final helpBook = ClientPushTarget.parse('/kk/books/book-123?help=1');
      expect(helpBook.bookId, 'book-123');
      expect(helpBook.openHelp, isTrue);

      final order = ClientPushTarget.parse('/orders/ord-555');
      expect(order.orderId, 'ord-555');
      expect(order.prefersOrder, isTrue);

      final fullUrl = ClientPushTarget.parse('https://mybooks.kz/uz/orders/ord-777');
      expect(fullUrl.orderId, 'ord-777');
      expect(fullUrl.prefersOrder, isTrue);

      expect(ClientPushTarget.parse('/books').isEmpty, isTrue);
      expect(ClientPushTarget.parse('').isEmpty, isTrue);
      expect(ClientPushTarget.parse(null).isEmpty, isTrue);
    });

    test('разбирает JSON и Map payload с kind, bookId и orderId', () {
      final paid = ClientPushTarget.parse('{"kind":"order_paid","orderId":"ord-1","bookId":"book-1"}');
      expect(paid.kind, 'order_paid');
      expect(paid.orderId, 'ord-1');
      expect(paid.bookId, 'book-1');
      expect(paid.prefersOrder, isTrue);

      final ready = ClientPushTarget.parse('{"kind":"book_ready","orderId":"ord-1","bookId":"book-1"}');
      expect(ready.kind, 'book_ready');
      expect(ready.prefersOrder, isFalse);

      final reply = ClientPushTarget.parse({
        'kind': 'manager_reply',
        'bookId': 'book-9',
        'link': '/books/book-9?help=1',
      });
      expect(reply.kind, 'manager_reply');
      expect(reply.bookId, 'book-9');
      expect(reply.openHelp, isTrue);
      expect(reply.prefersOrder, isFalse);
    });
  });

  group('ClientPush: регистрация, отписка и навигация по тапу', () {
    test('iOS: запрашивает разрешение, регистрирует APNs токен через meDevicePut и отписывает через meDeviceDelete', () async {
      final platform = _FakePlatform(platformName: 'ios');
      final store = _MemoryTokenStore();
      final registered = <v1api.DeviceBody>[];
      final forgotten = <v1api.DeviceForgetBody>[];
      var loggedIn = true;

      final push = ClientPush(
        platform: platform,
        tokenStore: store,
        environment: 'sandbox',
        isLoggedIn: () => loggedIn,
        registerDevice: (body) async {
          registered.add(body);
          return true;
        },
        forgetDevice: (body) async {
          forgotten.add(body);
        },
      );

      await push.onLoggedIn();
      expect(platform.initCount, 1);
      expect(platform.permissionCount, 1);
      expect(platform.registerCount, 1);

      final token = 'a1b2c3d4' * 8;
      await platform.onToken!(token);
      expect(registered, hasLength(1));
      expect(registered.first.platform, 'ios');
      expect(registered.first.token, token);
      expect(registered.first.environment, 'sandbox');
      expect(push.serverReady, isTrue);
      expect(store.value, token);

      // Повторный приход того же токена не шлёт лишний запрос
      await platform.onToken!(token);
      expect(registered, hasLength(1));

      // Выход / удаление аккаунта — отписка и очистка сохранённого токена
      await push.unregister();
      loggedIn = false;
      push.onLoggedOut();
      expect(forgotten, hasLength(1));
      expect(forgotten.first.token, token);
      expect(store.value, isNull);
    });

    test('Android: передаёт настройки Firebase в registerAndroid и регистрирует FCM токен', () async {
      final platform = _FakePlatform(platformName: 'android');
      final store = _MemoryTokenStore();
      final registered = <v1api.DeviceBody>[];

      final push = ClientPush(
        platform: platform,
        tokenStore: store,
        environment: 'production',
        isLoggedIn: () => true,
        androidOptionsProvider: () async => {
          'apiKey': 'AIzaTest',
          'appId': '1:123:android:abc',
          'projectId': 'mybooks',
          'senderId': '123',
        },
        registerDevice: (body) async {
          registered.add(body);
          return true;
        },
        forgetDevice: (_) async {},
      );

      await push.onLoggedIn();
      expect(platform.lastAndroidOptions, {
        'apiKey': 'AIzaTest',
        'appId': '1:123:android:abc',
        'projectId': 'mybooks',
        'senderId': '123',
      });

      final fcmToken = 'fcm_token_value_${'x' * 32}';
      await platform.onToken!(fcmToken);
      expect(registered, hasLength(1));
      expect(registered.first.platform, 'android');
      expect(registered.first.token, fcmToken);
    });

    test('токен, полученный до входа, регистрируется сразу после onLoggedIn', () async {
      final platform = _FakePlatform(platformName: 'ios');
      final store = _MemoryTokenStore();
      final registered = <v1api.DeviceBody>[];
      var loggedIn = false;

      final push = ClientPush(
        platform: platform,
        tokenStore: store,
        isLoggedIn: () => loggedIn,
        registerDevice: (body) async {
          registered.add(body);
          return true;
        },
        forgetDevice: (_) async {},
      );

      await push.init();
      final token = 'deadbeef' * 8;
      await platform.onToken!(token);
      expect(registered, isEmpty);

      loggedIn = true;
      await push.onLoggedIn();
      expect(registered, hasLength(1));
      expect(registered.first.token, token);
    });

    test('холодный запуск по уведомлению откладывает переход до входа и открывает заказ после логина', () async {
      final platform = _FakePlatform(platformName: 'ios', launchPayload: '/orders/ord-99');
      final opened = <ClientPushTarget>[];
      var loggedIn = false;

      final push = ClientPush(
        platform: platform,
        tokenStore: _MemoryTokenStore(),
        isLoggedIn: () => loggedIn,
        registerDevice: (_) async => true,
        forgetDevice: (_) async {},
        onOpen: opened.add,
      );

      await push.init();
      expect(opened, isEmpty);
      expect(push.pendingTarget?.orderId, 'ord-99');

      loggedIn = true;
      await push.onLoggedIn();
      expect(opened, hasLength(1));
      expect(opened.first.orderId, 'ord-99');
      expect(push.pendingTarget, isNull);

      // Тап при уже открытом приложении открывает книгу сразу
      platform.onOpen!('/books/book-77');
      expect(opened, hasLength(2));
      expect(opened.last.bookId, 'book-77');
    });

    test('unregister не падает при ошибке сети и всё равно очищает сохранённый токен', () async {
      final store = _MemoryTokenStore()..value = 'saved_token_${'1' * 32}';
      final push = ClientPush(
        platform: _FakePlatform(),
        tokenStore: store,
        isLoggedIn: () => true,
        registerDevice: (_) async => true,
        forgetDevice: (_) async => throw Exception('offline'),
      );

      await push.unregister();
      expect(store.value, isNull);
    });

    testWidgets('needsNavigator: держит отложенную цель до монтирования MaterialApp и открывает по flushPending', (tester) async {
      final navKey = GlobalKey<NavigatorState>();
      final opened = <ClientPushTarget>[];
      final push = ClientPush(
        platform: _FakePlatform(launchPayload: '/books/book-55'),
        tokenStore: _MemoryTokenStore(),
        navigatorKey: navKey,
        needsNavigator: true,
        isLoggedIn: () => true,
        registerDevice: (_) async => true,
        forgetDevice: (_) async {},
        onOpen: opened.add,
      );

      await push.init();
      // Навигатор ещё не смонтирован — цель сохранена
      expect(opened, isEmpty);
      expect(push.pendingTarget?.bookId, 'book-55');

      await tester.pumpWidget(MaterialApp(navigatorKey: navKey, home: const SizedBox()));
      expect(push.flushPending(), isTrue);
      expect(opened, hasLength(1));
      expect(opened.first.bookId, 'book-55');
      expect(push.pendingTarget, isNull);
    });
  });
}
