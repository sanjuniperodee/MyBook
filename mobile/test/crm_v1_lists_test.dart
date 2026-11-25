import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'package:mybooks_seller/api/mybook_api.g.dart' as v1api;
import 'package:mybooks_seller/core/api.dart';
import 'package:mybooks_seller/core/auth.dart';
import 'package:mybooks_seller/core/cache.dart';
import 'package:mybooks_seller/core/chat_controller.dart';
import 'package:mybooks_seller/core/chats_store.dart';
import 'package:mybooks_seller/core/live.dart';
import 'package:mybooks_seller/core/notifications_store.dart';
import 'package:mybooks_seller/core/notifier.dart';
import 'package:mybooks_seller/core/tasks_store.dart';
import 'package:mybooks_seller/core/v1.dart';
import 'package:mybooks_seller/screens/calls_screen.dart';
import 'package:mybooks_seller/screens/client_screen.dart';
import 'package:mybooks_seller/screens/clients_screen.dart';
import 'package:mybooks_seller/screens/deal_screen.dart';
import 'package:mybooks_seller/screens/deals_screen.dart';
import 'package:mybooks_seller/screens/order_screen.dart';
import 'package:mybooks_seller/screens/orders_screen.dart';
import 'package:mybooks_seller/ui/tokens.dart';

http.Response _jsonRes(Object body, {int status = 200, Map<String, String>? headers}) => http.Response.bytes(
  utf8.encode(jsonEncode(body)),
  status,
  headers: {'content-type': 'application/json; charset=utf-8', ...?headers},
);

class _FakeAuthState extends AuthState {
  _FakeAuthState(this._fakeApi, Staff fakeStaff) {
    staff = fakeStaff;
    status = AuthStatus.loggedIn;
  }

  final ApiClient _fakeApi;

  @override
  ApiClient get api => _fakeApi;
}

Staff _testStaff() => Staff(
  id: '00000000-0000-4000-8000-000000000001',
  name: 'Тест Менеджер',
  email: 'mgr@mybooks.kz',
  role: 'admin',
  permissions: {'chats.view', 'chats.send', 'deals.view', 'deals.edit', 'clients.view', 'clients.create', 'clients.edit', 'orders.view', 'orders.edit', 'calls.view', 'calls.make'},
  onShift: true,
  unread: 0,
);

Map<String, dynamic> _sampleOrdersPayload({String contactName = 'Айгерим'}) => {
  'canEdit': true,
  'statuses': [
    {'key': 'paid', 'label': 'Оплачен'},
    {'key': 'in_production', 'label': 'В печати'},
  ],
  'orders': [
    {
      'id': '11111111-1111-4111-8111-111111111111',
      'number': 1042,
      'status': 'paid',
      'contactName': contactName,
      'planName': 'Твёрдая обложка',
      'printed': true,
      'quantity': 1,
      'amount': 35000,
      'amountLabel': '35 000 ₸',
      'desiredDate': '2026-12-01',
      'daysLeft': 2,
      'claimed': false,
      'surprise': false,
      'giftNote': true,
      'express': true,
      'assignee': 'Марго',
      'ageDays': 1,
    },
  ],
};

Map<String, dynamic> _sampleChatDetail(String chatId) => {
  'conversation': {
    'pinned': false,
    'id': chatId,
    'title': 'Алия',
    'channel': 'whatsapp',
    'channelLabel': 'WhatsApp',
    'avatarUrl': null,
    'status': 'open',
    'unread': 1,
    'assigneeId': null,
    'assignee': null,
    'dealId': null,
    'clientId': null,
    'clientName': 'Алия',
  },
  'messages': [
    {
      'id': '22222222-2222-4222-8222-222222222221',
      'direction': 'out',
      'type': 'text',
      'text': 'Здравствуйте! Подскажите повод книги?',
      'mediaUrl': null,
      'media': null,
      'status': 'delivered',
      'error': null,
      'author': 'AI',
      'at': '2026-11-25T09:00:00.000Z',
      'trace': true,
    },
  ],
  'more': true,
  'deal': null,
  'perms': {'canReply': true, 'canNote': true, 'canInvoice': true, 'canEditInvoices': false, 'canCreateDeal': true, 'mine': true},
  'sendBlocker': null,
  'bot': {'label': 'Бот ведёт', 'canStart': false, 'canStop': true},
  'templates': <dynamic>[],
  'invoices': <dynamic>[],
};

void main() {
  late Directory tempDir;

  setUpAll(() async {
    TestWidgetsFlutterBinding.ensureInitialized();
    await initializeDateFormatting('ru');
  });

  setUp(() async {
    SharedPreferences.setMockInitialValues({});
    tempDir = await Directory.systemTemp.createTemp('mybooks_v1_test_');
    LocalCache.setDirectoryForTest(tempDir);
  });

  tearDown(() async {
    LocalCache.setDirectoryForTest(null);
    if (await tempDir.exists()) {
      await tempDir.delete(recursive: true);
    }
  });

  group('v1Cached и ETag/304 поверх LocalCache', () {
    test('200 → пишет кэш с ETag, повторный запрос шлёт If-None-Match → 304, при изменении → 200', () async {
      final seenHeaders = <String?>[];
      final seenPaths = <String>[];
      var serverVersion = 1;

      final mock = MockClient((req) async {
        seenPaths.add(req.url.toString());
        final inm = req.headers['if-none-match'];
        seenHeaders.add(inm);
        final currentEtag = 'W/"orders-$serverVersion"';
        if (inm == currentEtag) {
          return http.Response('', 304, headers: {'etag': currentEtag});
        }
        return _jsonRes(
          _sampleOrdersPayload(contactName: serverVersion == 1 ? 'Айгерим' : 'Дана'),
          headers: {'etag': currentEtag},
        );
      });

      // Хвостовой слэш в baseUrl не должен давать двойной слэш в пути v1.
      final api = ApiClient(baseUrl: 'https://mybooks.kz/', token: 'tok', client: mock);

      final first = await v1Cached(
        api,
        (c) => c.crmOrdersList(),
        cacheKey: 'orders_list',
        toJson: (d) => d.toJson(),
      );
      expect(first.notModified, isFalse);
      expect(first.etag, 'W/"orders-1"');
      expect(first.data!.orders.single.contactName, 'Айгерим');
      expect(seenPaths.single, 'https://mybooks.kz/api/v1/crm/orders');
      expect(seenHeaders.single, isNull);

      // Кэш на диске содержит данные и сохранённый ETag.
      await Future<void>.delayed(const Duration(milliseconds: 20));
      final cached = await v1ReadCache('orders_list', v1api.CrmOrders.fromJson);
      expect(cached, isNotNull);
      expect(cached!.etag, 'W/"orders-1"');
      expect(cached.data.orders.single.contactName, 'Айгерим');

      // Повтор с тем же ETag → сервер отвечает 304 Not Modified с пустым телом.
      final second = await v1Cached(
        api,
        (c) => c.crmOrdersList(),
        etag: cached.etag,
        cacheKey: 'orders_list',
        toJson: (d) => d.toJson(),
      );
      expect(second.notModified, isTrue);
      expect(second.data, isNull);
      expect(second.etag, 'W/"orders-1"');
      expect(seenHeaders.last, 'W/"orders-1"');

      // Данные на сервере поменялись → 200 с новым ETag и обновлением кэша.
      serverVersion = 2;
      final third = await v1Cached(
        api,
        (c) => c.crmOrdersList(),
        etag: second.etag,
        cacheKey: 'orders_list',
        toJson: (d) => d.toJson(),
      );
      expect(third.notModified, isFalse);
      expect(third.etag, 'W/"orders-2"');
      expect(third.data!.orders.single.contactName, 'Дана');

      await Future<void>.delayed(const Duration(milliseconds: 20));
      final updated = await v1ReadCache('orders_list', v1api.CrmOrders.fromJson);
      expect(updated!.etag, 'W/"orders-2"');
      expect(updated.data.orders.single.contactName, 'Дана');
    });

    test('401 вызывает onUnauthorized и пробрасывает ApiException', () async {
      var unauthorizedCalls = 0;
      final api = ApiClient(
        baseUrl: 'https://mybooks.kz',
        token: 'expired',
        client: MockClient((_) async => _jsonRes({'error': 'Войдите заново', 'code': 'unauthorized'}, status: 401)),
      )..onUnauthorized = () => unauthorizedCalls++;

      await expectLater(
        () => v1Cached(api, (c) => c.crmOrdersList()),
        throwsA(isA<ApiException>().having((e) => e.status, 'status', 401).having((e) => e.code, 'code', 'unauthorized')),
      );
      expect(unauthorizedCalls, 1);
    });
  });

  group('сторы CRM на API v1', () {
    test('ChatsStore: загрузка v1, предзагрузка непрочитанного, 304 без лишней перерисовки и холодный старт из кэша', () async {
      const chatId = '33333333-3333-4333-8333-333333333333';
      final requests = <(String path, String? inm)>[];

      final mock = MockClient((req) async {
        final pathWithQuery = req.url.hasQuery ? '${req.url.path}?${req.url.query}' : req.url.path;
        final inm = req.headers['if-none-match'];
        requests.add((pathWithQuery, inm));
        if (req.url.path == '/api/v1/crm/chats') {
          final f = req.url.queryParameters['f'] ?? 'open';
          final etag = 'W/"chats-$f"';
          if (inm == etag) return http.Response('', 304, headers: {'etag': etag});
          return _jsonRes({
            'chats': [
              {
                'id': chatId,
                'title': f == 'unread' ? 'Непрочитанный' : 'Алия',
                'channel': 'whatsapp',
                'channelLabel': 'WhatsApp',
                'avatarUrl': null,
                'lastMessageAt': '2026-11-25T10:00:00.000Z',
                'preview': 'Сколько стоит книга?',
                'unread': 2,
                'status': 'open',
                'assignee': 'Марго',
                'assigneeId': null,
                'waitLabel': '5 мин',
                'overdue': false,
                'bot': true,
                'pinned': false,
              },
            ],
          }, headers: {'etag': etag});
        }
        if (req.url.path == '/api/v1/crm/chats/$chatId') {
          return _jsonRes(_sampleChatDetail(chatId));
        }
        return _jsonRes({'error': 'unexpected ${req.url}'}, status: 404);
      });

      final api = ApiClient(baseUrl: 'https://mybooks.kz', token: 'tok', client: mock);
      final live = LiveService(api);
      final store = ChatsStore(api, live);
      var notifications = 0;
      store.addListener(() => notifications++);

      await store.load();
      await Future<void>.delayed(const Duration(milliseconds: 30));
      expect(store.loaded, isTrue);
      expect(store.items.single.title, 'Алия');
      expect(store.items.single.bot, isTrue);
      expect(requests.any((r) => r.$1 == '/api/v1/crm/chats?f=open' && r.$2 == null), isTrue);
      expect(requests.any((r) => r.$1 == '/api/v1/crm/chats/$chatId?limit=40'), isTrue);

      // Повторный load → If-None-Match → 304, список не перерисовывается.
      final before304 = notifications;
      await store.load();
      expect(requests.last, ('/api/v1/crm/chats?f=open', 'W/"chats-open"'));
      expect(notifications, before304);

      // Смена фильтра сбрасывает ETag прошлого фильтра.
      await store.setFilter('unread');
      expect(requests.last, ('/api/v1/crm/chats?f=unread', null));
      expect(store.items.single.title, 'Непрочитанный');

      // Холодный старт нового ChatsStore: мгновенно читает кэш + ETag и на первый load получает 304!
      final cold = ChatsStore(api, live);
      await cold.load();
      expect(cold.items.single.title, 'Алия');
      expect(requests.last, ('/api/v1/crm/chats?f=open', 'W/"chats-open"'));

      store.dispose();
      cold.dispose();
    });

    test('ChatController: load, refresh с ETag/304 и loadOlder через v1 с сохранением trace в raw', () async {
      const chatId = '44444444-4444-4444-8444-444444444444';
      var msgVersion = 1;
      final calls = <String>[];

      final mock = MockClient((req) async {
        calls.add('${req.method} ${req.url.path}${req.url.hasQuery ? '?${req.url.query}' : ''}');
        if (req.url.path == '/api/v1/crm/chats/$chatId') {
          return _jsonRes(_sampleChatDetail(chatId));
        }
        if (req.url.path == '/api/v1/crm/chats/$chatId/messages') {
          if (req.url.queryParameters.containsKey('before')) {
            return _jsonRes({
              'messages': [
                {
                  'id': '22222222-2222-4222-8222-222222222220',
                  'direction': 'in',
                  'type': 'text',
                  'text': 'Старое сообщение',
                  'mediaUrl': null,
                  'media': null,
                  'status': 'delivered',
                  'error': null,
                  'author': null,
                  'at': '2026-11-25T08:00:00.000Z',
                },
              ],
              'more': false,
              'unread': 0,
              'status': 'open',
            });
          }
          final etag = 'W/"msgs-$msgVersion"';
          if (req.headers['if-none-match'] == etag) return http.Response('', 304, headers: {'etag': etag});
          return _jsonRes({
            'messages': [
              {
                'id': '22222222-2222-4222-8222-22222222222${msgVersion + 1}',
                'direction': 'in',
                'type': 'text',
                'text': 'Новое #$msgVersion',
                'mediaUrl': null,
                'media': null,
                'status': 'delivered',
                'error': null,
                'author': null,
                'at': '2026-11-25T10:0$msgVersion:00.000Z',
              },
            ],
            'more': true,
            'unread': 1,
            'status': 'open',
          }, headers: {'etag': etag});
        }
        return _jsonRes({'error': 'unexpected'}, status: 404);
      });

      final api = ApiClient(baseUrl: 'https://mybooks.kz', token: 'tok', client: mock);
      final ctl = ChatController(api: api, live: LiveService(api), chatId: chatId, myId: 'u1');

      await ctl.load();
      expect(ctl.detail?.title, 'Алия');
      expect(ctl.messages.single.raw?['trace'], isTrue);

      await ctl.refresh();
      expect(ctl.messages.length, 2);

      // Второй refresh без изменений → 304, число сообщений не меняется.
      var updates = 0;
      ctl.addListener(() => updates++);
      await ctl.refresh();
      expect(updates, 0);

      // Догрузка истории старше первого сообщения.
      await ctl.loadOlder();
      expect(ctl.messages.first.text, 'Старое сообщение');
      expect(ctl.more, isFalse);
      expect(calls.any((c) => c.startsWith('GET /api/v1/crm/chats/$chatId/messages?before=')), isTrue);

      ctl.dispose();
    });

    test('TasksStore: /api/v1/crm/today и /api/v1/crm/tasks с ETag/304 и выполненными', () async {
      final seen = <(String, String?)>[];
      final mock = MockClient((req) async {
        final key = req.url.hasQuery ? '${req.url.path}?${req.url.query}' : req.url.path;
        final inm = req.headers['if-none-match'];
        seen.add((key, inm));
        final etag = 'W/"$key"';
        if (inm == etag) return http.Response('', 304, headers: {'etag': etag});
        if (req.url.path == '/api/v1/crm/today') {
          return _jsonRes({
            'counts': {'tasks': 2, 'overdueTasks': 1, 'waiting': 1, 'missed': 0, 'unsorted': 0, 'openDeals': 4, 'openDealsSum': 120000, 'noNextStep': 1},
            'plan': {'planAmount': 500000, 'factAmount': 250000, 'planDeals': 10, 'factDeals': 5},
            'tasks': <dynamic>[],
            'waiting': <dynamic>[],
            'missed': <dynamic>[],
          }, headers: {'etag': etag});
        }
        if (req.url.path == '/api/v1/crm/tasks') {
          final isDone = req.url.queryParameters['done'] == '1';
          return _jsonRes({
            'tasks': [
              {
                'id': isDone ? '55555555-5555-4555-8555-555555555552' : '55555555-5555-4555-8555-555555555551',
                'title': isDone ? 'Отправлено КП' : 'Позвонить клиенту',
                'kind': 'call',
                'dueAt': '2026-11-25T12:00:00.000Z',
                'overdue': !isDone,
                'done': isDone,
                'remindBeforeMin': null,
                'fromBot': false,
                'assigneeId': 'u1',
                'editable': true,
                'context': {'type': 'deal', 'id': 'd1', 'label': 'Сделка №7'},
                'target': {'dealId': 'd1', 'orderId': null, 'clientId': null},
              },
            ],
          }, headers: {'etag': etag});
        }
        return _jsonRes({'error': 'unexpected'}, status: 404);
      });

      final api = ApiClient(baseUrl: 'https://mybooks.kz', token: 'tok', client: mock);
      final live = LiveService(api);
      final notifier = Notifier(api: api, live: live, navigatorKey: GlobalKey<NavigatorState>(), onOpen: (_) {})..enabled = false;
      final store = TasksStore(api, live, notifier, myId: 'u1');

      await store.load();
      expect(store.loaded, isTrue);
      expect(store.badge, 2);
      expect(store.overdueCount, 1);
      expect(store.open.single.title, 'Позвонить клиенту');

      // Повторный load шлёт ETag по обоим маршрутам и получает 304.
      await store.load(silent: true);
      expect(seen.any((e) => e.$1 == '/api/v1/crm/today' && e.$2 == 'W/"/api/v1/crm/today"'), isTrue);
      expect(seen.any((e) => e.$1 == '/api/v1/crm/tasks' && e.$2 == 'W/"/api/v1/crm/tasks"'), isTrue);

      await store.loadDone();
      expect(store.doneLoaded, isTrue);
      expect(store.done.single.title, 'Отправлено КП');

      store.dispose();
    });

    test('NotificationsStore: загрузка и прочтение полностью через /api/v1/crm/notifications*', () async {
      final readBodies = <Map<String, dynamic>>[];
      var getCount = 0;

      final mock = MockClient((req) async {
        if (req.method == 'GET' && req.url.path == '/api/v1/crm/notifications') {
          getCount++;
          const etag = 'W/"notif-1"';
          if (req.headers['if-none-match'] == etag) return http.Response('', 304, headers: {'etag': etag});
          return _jsonRes({
            'notifications': [
              {
                'id': '66666666-6666-4666-8666-666666666661',
                'kind': 'deal',
                'title': 'Новая заявка',
                'body': 'Книга маме',
                'link': '/admin/deals/77777777-7777-4777-8777-777777777777',
                'read': false,
                'at': '2026-11-25T10:00:00.000Z',
              },
            ],
          }, headers: {'etag': etag});
        }
        if (req.method == 'POST' && req.url.path == '/api/v1/crm/notifications/read') {
          readBodies.add(jsonDecode(req.body) as Map<String, dynamic>);
          return _jsonRes({'ok': true});
        }
        return _jsonRes({'error': 'unexpected'}, status: 404);
      });

      final api = ApiClient(baseUrl: 'https://mybooks.kz', token: 'tok', client: mock);
      final store = NotificationsStore(api, LiveService(api));
      await Future<void>.delayed(const Duration(milliseconds: 20));
      expect(store.loaded, isTrue);
      expect(store.unread, 1);

      await store.load(silent: true);
      expect(getCount, 2);

      await store.markRead(store.items.single);
      expect(store.unread, 0);
      expect(readBodies.first, {'id': '66666666-6666-4666-8666-666666666661'});

      await store.markAllRead();
      expect(readBodies.last, isEmpty);

      store.dispose();
    });
  });

  group('экраны CRM грузят списки и карточки через API v1 (без /api/mobile)', () {
    Widget wrap(ApiClient api, Widget child) {
      final auth = _FakeAuthState(api, _testStaff());
      final live = LiveService(api);
      final notifier = Notifier(api: api, live: live, navigatorKey: GlobalKey<NavigatorState>(), onOpen: (_) {})..enabled = false;
      return MultiProvider(
        providers: [
          ChangeNotifierProvider<AuthState>.value(value: auth),
          Provider<LiveService>.value(value: live),
          ChangeNotifierProvider<TasksStore>(create: (_) => TasksStore(api, live, notifier, myId: auth.staff!.id)),
        ],
        child: MaterialApp(theme: buildTheme(Brightness.light), home: child),
      );
    }

    testWidgets('OrdersScreen, OrderScreen, DealsScreen, DealScreen, ClientsScreen, ClientScreen и CallsScreen ходят в /api/v1/crm/*', (tester) async {
      // В testWidgets (FakeAsync) отключаем дисковый I/O LocalCache — кэш и 304 проверяются в unit-группах выше.
      LocalCache.setDirectoryForTest(null);
      final hitPaths = <String>[];
      final mock = MockClient((req) async {
        hitPaths.add(req.url.path);
        expect(req.url.path.startsWith('/api/mobile'), isFalse, reason: 'Экран не должен звать ${req.url.path}');
        switch (req.url.path) {
          case '/api/v1/crm/orders':
            return _jsonRes(_sampleOrdersPayload(), headers: {'etag': 'W/"o1"'});
          case '/api/v1/crm/orders/11111111-1111-4111-8111-111111111111':
            return _jsonRes({
              'id': '11111111-1111-4111-8111-111111111111',
              'number': 1042,
              'status': 'paid',
              'statusLabel': 'Оплачен',
              'canEdit': true,
              'planName': 'Твёрдая обложка',
              'printed': true,
              'quantity': 1,
              'amountLabel': '35 000 ₸',
              'addons': <dynamic>[],
              'book': {'title': 'Мамина книга', 'author': 'Алия', 'recipient': 'Мама'},
              'contact': {'name': 'Айгерим', 'phone': '+7 701 000 11 22', 'email': 'a@example.com', 'masked': false},
              'delivery': {'method': 'Курьер', 'quoted': false, 'address': 'Алматы, Абая 1'},
              'tracking': 'KZ999',
              'desiredDate': '2026-12-01',
              'comment': null,
              'giftNote': null,
              'surprise': false,
              'claimed': false,
              'events': <dynamic>[],
            });
          case '/api/v1/crm/orders/11111111-1111-4111-8111-111111111111/links':
            return _jsonRes({'clientId': null, 'dealId': null, 'dealNumber': null, 'chatId': null, 'bookId': 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'adminNote': '', 'canNote': true, 'printUrl': null});
          case '/api/v1/crm/orders/11111111-1111-4111-8111-111111111111/money':
            return _jsonRes({
              'id': '11111111-1111-4111-8111-111111111111',
              'number': 1042,
              'status': 'paid',
              'statusLabel': 'Оплачен',
              'statuses': [
                {'id': 'paid', 'label': 'Оплачен'},
              ],
              'printed': true,
              'trackingNumber': 'KZ999',
              'amount': 35000,
              'received': 35000,
              'refundable': 0,
              'settled': true,
              'postpay': false,
              'cancelled': false,
              'payments': <dynamic>[],
              'payForms': <dynamic>[],
              'plan': 'hardcover',
              'plans': [
                {'id': 'hardcover', 'label': 'Твёрдая', 'price': 35000},
              ],
              'agreed': null,
              'maxDiscountPercent': null,
              'canEdit': true,
              'canVoid': false,
              'canReview': false,
              'canTerms': false,
              'canRequestReprice': false,
            });
          case '/api/v1/crm/orders/11111111-1111-4111-8111-111111111111/files':
            return _jsonRes({'canFiles': false, 'spec': null, 'files': <dynamic>[], 'packageUrl': null, 'progressUrl': '/progress', 'bookLocked': true, 'canLock': false, 'canRegenerate': false});
          case '/api/v1/crm/deals':
            return _jsonRes({
              'pipelines': [
                {'id': 'p1', 'name': 'Основная'},
              ],
              'pipeline': {'id': 'p1', 'name': 'Основная'},
              'stages': [
                {'id': 's1', 'name': 'Новый', 'color': '#2B8FD6', 'kind': 'open', 'position': 0},
              ],
              'deals': [
                {
                  'id': '88888888-8888-4888-8888-888888888888',
                  'number': 51,
                  'title': 'Книга папе',
                  'contactName': 'Ерлан',
                  'stageId': 's1',
                  'stageKind': 'open',
                  'amount': 45000,
                  'paid': 15000,
                  'source': 'WhatsApp',
                  'assigneeId': null,
                  'assignee': 'Марго',
                  'unsorted': false,
                  'unread': 0,
                  'daysInStage': 1,
                  'nextTask': null,
                  'createdAt': '2026-11-24T10:00:00.000Z',
                },
              ],
            }, headers: {'etag': 'W/"d1"'});
          case '/api/v1/crm/deals/88888888-8888-4888-8888-888888888888':
            return _jsonRes({
              'id': '88888888-8888-4888-8888-888888888888',
              'number': 51,
              'title': 'Книга папе',
              'contactName': 'Ерлан',
              'phone': '+7 702 123 45 67',
              'amount': 45000,
              'paid': 15000,
              'source': 'WhatsApp',
              'stage': {'id': 's1', 'name': 'Новый', 'color': '#2B8FD6', 'kind': 'open'},
              'stages': [
                {'id': 's1', 'name': 'Новый', 'color': '#2B8FD6', 'kind': 'open'},
              ],
              'assigneeId': null,
              'assignee': 'Марго',
              'unsorted': false,
              'tags': <dynamic>[],
              'customFields': <String, dynamic>{},
              'createdAt': '2026-11-24T10:00:00.000Z',
              'perms': {'canEdit': true, 'canMove': true, 'canInvoice': true, 'mine': true},
              'maxDiscountPercent': 10,
              'chatId': null,
              'client': null,
              'order': null,
              'tasks': <dynamic>[],
              'notes': <dynamic>[],
              'payments': <dynamic>[],
              'payForms': ['Kaspi Gold'],
              'hasOrder': false,
              'invoices': <dynamic>[],
            });
          case '/api/v1/crm/deals/88888888-8888-4888-8888-888888888888/extras':
            return _jsonRes({
              'clientId': null,
              'suggested': null,
              'canCreateClient': false,
              'canLink': false,
              'channels': <dynamic>[],
              'duplicates': <dynamic>[],
              'canMerge': false,
              'past': <dynamic>[],
              'pipelines': <dynamic>[],
              'pipelineId': 'p1',
              'canMovePipeline': false,
              'canDelete': false,
            });
          case '/api/v1/crm/clients':
            return _jsonRes({
              'total': 1,
              'page': 1,
              'pageSize': 30,
              'clients': [
                {
                  'id': '99999999-9999-4999-8999-999999999999',
                  'name': 'Гульнара',
                  'phone': '+7 701 111 22 33',
                  'ltv': 70000,
                  'orders': 2,
                  'books': 1,
                  'lastSeenAt': '2026-11-25T09:00:00.000Z',
                  'createdAt': '2026-10-01T09:00:00.000Z',
                  'tags': ['vip'],
                },
              ],
            }, headers: {'etag': 'W/"c1"'});
          case '/api/v1/crm/clients/99999999-9999-4999-8999-999999999999':
            return _jsonRes({
              'id': '99999999-9999-4999-8999-999999999999',
              'name': 'Гульнара',
              'phone': '+7 701 111 22 33',
              'email': 'g@example.com',
              'tags': ['vip'],
              'manager': 'Марго',
              'lastSeenAt': '2026-11-25T09:00:00.000Z',
              'createdAt': '2026-10-01T09:00:00.000Z',
              'money': {'total': 70000, 'sales': 2},
              'canWrite': true,
              'books': <dynamic>[],
              'orders': <dynamic>[],
              'deals': <dynamic>[],
              'tasks': <dynamic>[],
              'notes': <dynamic>[],
            });
          case '/api/v1/crm/calls':
            return _jsonRes({
              'stats': {'total': 1, 'answered': 0, 'missed': 1, 'talk': 0},
              'calls': [
                {
                  'id': 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
                  'direction': 'in',
                  'status': 'missed',
                  'at': '2026-11-25T09:30:00.000Z',
                  'durationSec': 0,
                  'phone': '+7 700 555 44 33',
                  'name': 'Сабина',
                  'handled': false,
                  'dealId': null,
                  'clientId': null,
                },
              ],
            }, headers: {'etag': 'W/"k1"'});
          default:
            return _jsonRes({'error': 'unexpected ${req.url.path}'}, status: 404);
        }
      });

      final api = ApiClient(baseUrl: 'https://mybooks.kz', token: 'tok', client: mock);

      await tester.pumpWidget(wrap(api, const OrdersScreen()));
      await tester.pumpAndSettle();
      expect(find.textContaining('№1042 · Айгерим'), findsOneWidget);

      await tester.pumpWidget(wrap(api, const OrderScreen(orderId: '11111111-1111-4111-8111-111111111111', number: 1042)));
      await tester.pumpAndSettle();
      expect(find.text('Заказ №1042'), findsOneWidget);
      expect(find.text('Айгерим'), findsOneWidget);

      await tester.pumpWidget(wrap(api, const DealsScreen()));
      await tester.pumpAndSettle();
      expect(find.text('Книга папе'), findsOneWidget);

      await tester.pumpWidget(wrap(api, const DealScreen(dealId: '88888888-8888-4888-8888-888888888888')));
      await tester.pumpAndSettle();
      expect(find.text('Сделка №51'), findsOneWidget);

      await tester.pumpWidget(wrap(api, const ClientsScreen()));
      await tester.pumpAndSettle();
      expect(find.text('Гульнара'), findsOneWidget);

      await tester.pumpWidget(wrap(api, const ClientScreen(clientId: '99999999-9999-4999-8999-999999999999')));
      await tester.pumpAndSettle();
      expect(find.text('Ведёт: Марго'), findsOneWidget);

      await tester.pumpWidget(wrap(api, const CallsScreen()));
      await tester.pumpAndSettle();
      expect(find.text('Сабина'), findsOneWidget);

      expect(
        hitPaths,
        containsAll([
          '/api/v1/crm/orders',
          '/api/v1/crm/orders/11111111-1111-4111-8111-111111111111',
          '/api/v1/crm/deals',
          '/api/v1/crm/deals/88888888-8888-4888-8888-888888888888',
          '/api/v1/crm/clients',
          '/api/v1/crm/clients/99999999-9999-4999-8999-999999999999',
          '/api/v1/crm/calls',
        ]),
      );
    });
  });
}
