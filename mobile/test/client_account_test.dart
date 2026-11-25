import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:provider/provider.dart';
import 'package:mybooks_seller/api/mybook_api.g.dart' as v1api;
import 'package:mybooks_seller/client/data/backend.dart';
import 'package:mybooks_seller/client/data/models.dart';
import 'package:mybooks_seller/client/data/session.dart';
import 'package:mybooks_seller/client/screens/account_screen.dart';
import 'package:mybooks_seller/ui/tokens.dart';

/// «Аккаунт» приложения = страница «Аккаунт» сайта: группы, надписи и итог правки — с сервера (фикстура — ответ
/// API v1 meAccount); правки идут в meProfileUpdate, meRemindersSet, meLocaleSet.
class _Backend implements ClientBackend {
  _Backend(this.v1);
  final v1api.MybookApi v1;
  @override
  v1api.MybookApi get contract => v1;
  @override
  Future<T> call<T>(Future<T> Function() run) => run();
  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

class _Session extends ChangeNotifier implements ClientSession {
  _Session(this.backend);
  @override
  final ClientBackend backend;
  int refreshed = 0;
  @override
  ClientUser? get user => const ClientUser(id: 'u1', name: 'Айгерим', phone: '');
  @override
  Future<void> refreshUser() async => refreshed++;
  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

void main() {
  testWidgets('Аккаунт: профиль, пароль, уведомления, язык и данные — как на сайте; правки — в API v1', (tester) async {
    tester.view.physicalSize = const Size(430, 3200);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.reset);
    final fixture = jsonDecode(File('test/fixtures/account_view.json').readAsStringSync()) as Map<String, dynamic>;
    final calls = <String>[];
    final mock = MockClient((req) async {
      calls.add('${req.method} ${req.url.path} ${req.body}');
      final path = req.url.path;
      if (path.endsWith('/me/deletion')) {
        return http.Response(jsonEncode({'confirm': 'password', 'items': ['Книги'], 'kept': [], 'keptOrders': [], 'labels': {for (final k in ['title', 'intro', 'accounting', 'password', 'forgot', 'next', 'confirmTitle', 'confirm', 'cancel', 'done']) k: 'del-$k'}}), 200, headers: {'content-type': 'application/json'});
      }
      if (path.endsWith('/app-config')) {
        return http.Response(jsonEncode({'privacyUrl': 'https://x/privacy', 'termsUrl': 'https://x/offer', 'labels': {'privacy': 'Политика', 'terms': 'Оферта'}}), 200, headers: {'content-type': 'application/json'});
      }
      final v = Map<String, dynamic>.from(fixture);
      if (path.endsWith('/me/profile')) v['notice'] = {'ok': true, 'text': 'Данные сохранены', 'field': null};
      if (path.endsWith('/me/reminders')) v['remindersOn'] = !(fixture['remindersOn'] as bool);
      return http.Response(jsonEncode(v), 200, headers: {'content-type': 'application/json'});
    });
    final session = _Session(_Backend(v1api.MybookApi(baseUrl: 'http://127.0.0.1', client: mock)));
    await tester.pumpWidget(ChangeNotifierProvider<ClientSession>.value(value: session, child: MaterialApp(theme: buildTheme(Brightness.light, client: true), home: const AccountScreen())));
    await tester.pumpAndSettle();

    final l = fixture['labels'] as Map<String, dynamic>;
    final groups = l['groups'] as Map<String, dynamic>;
    for (final g in groups.values) {
      expect(find.text((g as Map)['title'] as String), findsOneWidget);
    }
    expect(find.text('Айгерим'), findsOneWidget);
    expect(find.text('client@example.kz'), findsOneWidget);
    expect(find.text('del-next'), findsOneWidget);
    expect(find.text('Политика'), findsOneWidget);

    // Профиль: «Сохранить» — PATCH /me/profile, сообщение сервера под формой, сессия перечитывает имя.
    await tester.enterText(find.widgetWithText(TextField, 'Айгерим'), 'Айгерим Н.');
    await tester.tap(find.text(l['save'] as String));
    await tester.pumpAndSettle();
    expect(calls.any((c) => c.startsWith('PATCH /api/v1/me/profile') && c.contains('Айгерим Н.')), isTrue);
    expect(find.text('Данные сохранены'), findsOneWidget);
    expect(session.refreshed, 1);

    // Напоминания и язык.
    final n = l['notifications'] as Map<String, dynamic>;
    await tester.tap(find.text((fixture['remindersOn'] as bool ? n['turnOff'] : n['turnOn']) as String));
    await tester.pumpAndSettle();
    expect(calls.any((c) => c.startsWith('PUT /api/v1/me/reminders')), isTrue);
    final other = (fixture['locales'] as List).cast<Map>().firstWhere((x) => x['id'] != fixture['locale']);
    await tester.tap(find.text(other['label'] as String));
    await tester.pumpAndSettle();
    expect(calls.any((c) => c.startsWith('PUT /api/v1/me/locale') && c.contains(other['id'] as String)), isTrue);
  });
}
