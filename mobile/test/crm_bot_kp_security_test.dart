import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:mybooks_seller/api/mybook_api.g.dart' as v1api;
import 'package:mybooks_seller/core/api.dart';
import 'package:mybooks_seller/core/layouts.dart';
import 'package:mybooks_seller/core/links.dart';
import 'package:mybooks_seller/models/chat.dart';
import 'package:mybooks_seller/screens/chat_screen.dart';
import 'package:mybooks_seller/screens/kp_sheet.dart';
import 'package:mybooks_seller/screens/settings/roles_screen.dart';
import 'package:mybooks_seller/screens/settings/two_factor_screen.dart';
import 'package:mybooks_seller/ui/tokens.dart';
import 'package:mybooks_seller/widgets/message_bubble.dart';

Widget _wrap(Widget child) => MaterialApp(
      theme: buildTheme(Brightness.light),
      home: Scaffold(body: child),
    );

void main() {
  setUpAll(() => initializeDateFormatting('ru'));

  group('Бот: пометка ответа и «Почему так?»', () {
    testWidgets('пузырь ответа бота показывает метку «Бот» и кнопку «Почему так?»', (tester) async {
      Message? tapped;
      final botMsg = Message.fromJson({
        'id': 'm-bot-1',
        'direction': 'out',
        'type': 'text',
        'text': 'Печатная книга стоит от 25 000 ₸.',
        'status': 'read',
        'at': '2026-11-25T10:00:00.000Z',
        'author': 'бот',
        'trace': true,
      });
      expect(botMsg.isBot, isTrue);
      expect(botMsg.hasTrace, isTrue);

      await tester.pumpWidget(_wrap(
        MessageBubble(
          message: botMsg,
          api: ApiClient(baseUrl: 'https://mybooks.kz'),
          tail: true,
          onLongPress: () {},
          onRetry: () {},
          onQuoteTap: (_) {},
          onBotTrace: (m) => tapped = m,
        ),
      ));

      expect(find.text('Бот'), findsOneWidget);
      expect(find.text('Почему так?'), findsOneWidget);
      await tester.tap(find.text('Почему так?'));
      await tester.pump();
      expect(tapped?.id, 'm-bot-1');
    });

    testWidgets('обычное сообщение менеджера не показывает «Почему так?»', (tester) async {
      final managerMsg = Message.fromJson({
        'id': 'm-mgr-1',
        'direction': 'out',
        'type': 'text',
        'text': 'Добрый день!',
        'status': 'sent',
        'at': '2026-11-25T10:00:00.000Z',
        'author': 'Марго',
      });
      expect(managerMsg.isBot, isFalse);
      expect(managerMsg.hasTrace, isFalse);

      await tester.pumpWidget(_wrap(
        MessageBubble(
          message: managerMsg,
          api: ApiClient(baseUrl: 'https://mybooks.kz'),
          tail: true,
          onLongPress: () {},
          onRetry: () {},
          onQuoteTap: (_) {},
          onBotTrace: (_) {},
        ),
      ));

      expect(find.text('Марго'), findsOneWidget);
      expect(find.text('Почему так?'), findsNothing);
    });

    testWidgets('BotTraceRowsView отображает строки следа и предупреждения', (tester) async {
      await tester.pumpWidget(_wrap(
        const BotTraceRowsView(
          rows: [
            v1api.BotTraceRow(label: 'Модель решила', lines: ['ответить · этап: предложение'], warn: false),
            v1api.BotTraceRow(label: 'Что сделал код', lines: ['убрал повторное «Здравствуйте»'], warn: true),
            v1api.BotTraceRow(label: 'База знаний', lines: ['Тарифы и доставка'], warn: false),
          ],
        ),
      ));

      expect(find.text('Модель решила'), findsOneWidget);
      expect(find.text('ответить · этап: предложение'), findsOneWidget);
      expect(find.text('Что сделал код'), findsOneWidget);
      expect(find.text('убрал повторное «Здравствуйте»'), findsOneWidget);
      expect(find.text('База знаний'), findsOneWidget);
    });
  });

  group('Коммерческое предложение (КП)', () {
    testWidgets('KpSheet показывает заказ, книгу и отправляет скидку с выбранным % и сроком', (tester) async {
      v1api.ChatOfferBody? sentBody;
      String? sentMsg;

      const offers = v1api.ChatOffers(
        order: v1api.ChatOffersOrder(number: 108),
        book: v1api.ChatOffersBook(title: 'Книга маме'),
        maxDiscount: 15,
        percents: [5, 10, 15],
        hours: [24, 48, 72, 168],
        hourOptions: [
          v1api.ChatOfferHourOption(hours: 24, label: 'на сутки'),
          v1api.ChatOfferHourOption(hours: 48, label: 'на 2 дня'),
        ],
        canSend: true,
      );

      await tester.pumpWidget(_wrap(
        KpSheet(
          chatId: 'chat-1',
          offers: offers,
          onSend: (b) async {
            sentBody = b;
            return const v1api.Done(ok: true, message: 'Отправлено, промокод GIFT15');
          },
          onSent: (m) => sentMsg = m,
        ),
      ));

      expect(find.text('Ссылка на оплату заказа №108'), findsOneWidget);
      expect(find.text('Ссылка на книгу «Книга маме»'), findsOneWidget);
      expect(find.text('Персональная скидка'), findsOneWidget);

      await tester.tap(find.text('15%'));
      await tester.pump();
      await tester.tap(find.text('на 2 дня'));
      await tester.pump();
      await tester.tap(find.text('Отправить промокод 15%'));
      await tester.pumpAndSettle();

      expect(sentBody?.kind, 'discount');
      expect(sentBody?.percent, 15);
      expect(sentBody?.hours, 48);
      expect(sentMsg, 'Отправлено, промокод GIFT15');
    });
  });

  group('Роли и права', () {
    testWidgets('RolesScreen открывает роль, позволяет переключить право и сохранить', (tester) async {
      v1api.CrmRoleSaveBody? saved;
      final rolesData = v1api.CrmRoles(
        roles: const [
          v1api.CrmRole(
            id: 'r-owner',
            name: 'Руководитель',
            scope: 'all',
            permissions: ['deals.view', 'chats.view'],
            system: true,
            locked: true,
            members: 1,
            isOwnRole: true,
          ),
          v1api.CrmRole(
            id: 'r-sales',
            name: 'Продавец',
            scope: 'own',
            permissions: ['deals.view'],
            system: false,
            locked: false,
            members: 3,
            isOwnRole: false,
          ),
        ],
        groups: const [
          v1api.CrmPermissionGroup(
            label: 'Сделки',
            items: [v1api.CrmPermissionItem(key: 'deals.view', label: 'Видеть сделки и воронку')],
          ),
          v1api.CrmPermissionGroup(
            label: 'Чаты',
            items: [v1api.CrmPermissionItem(key: 'chats.view', label: 'Видеть переписку')],
          ),
        ],
        totalPermissions: 2,
      );

      await tester.pumpWidget(MaterialApp(
        theme: buildTheme(Brightness.light),
        home: RolesScreen(
          loader: () async => rolesData,
          onSave: (body) async {
            saved = body;
            return const v1api.Done(ok: true, message: 'Роль сохранена');
          },
        ),
      ));
      await tester.pumpAndSettle();

      expect(find.text('Руководитель (ваша)'), findsOneWidget);
      expect(find.text('Продавец'), findsOneWidget);

      await tester.tap(find.text('Продавец'));
      await tester.pumpAndSettle();

      await tester.scrollUntilVisible(
        find.text('Видеть переписку'),
        200,
        scrollable: find.descendant(of: find.byType(ListView), matching: find.byType(Scrollable)).first,
      );
      expect(find.text('Видеть переписку'), findsOneWidget);
      await tester.tap(find.text('Видеть переписку'));
      await tester.pump();

      await tester.tap(find.text('Сохранить права'));
      await tester.pumpAndSettle();

      expect(saved?.id, 'r-sales');
      expect(saved?.permissions, containsAll(['deals.view', 'chats.view']));
    });
  });

  group('Безопасность и 2FA', () {
    testWidgets('TwoFactorScreen включает 2FA по секрету и 6-значному коду и показывает резервные коды', (tester) async {
      String? confirmedCode;
      v1api.CrmSecurityRulesBody? savedRules;

      const secOff = v1api.CrmSecurity(
        enabled: false,
        since: null,
        backupLeft: 0,
        canDisable: true,
        currentIp: '95.56.10.20',
        canManage: true,
        require2fa: false,
        ipAllowlist: '',
        team: [
          v1api.CrmSecurityTeamMember(
            id: 'u-2',
            name: 'Айгерим',
            email: 'a@mybooks.kz',
            enabled: true,
            since: '20 ноя',
            disabled: false,
            canReset: true,
          ),
        ],
      );

      await tester.pumpWidget(MaterialApp(
        theme: buildTheme(Brightness.light),
        home: TwoFactorScreen(
          loader: () async => secOff,
          onStart: () async => const v1api.CrmTwoFactorStart(
            secret: 'JBSWY3DPEHPK3PXP',
            otpauthUrl: 'otpauth://totp/MyBooks:owner?secret=JBSWY3DPEHPK3PXP',
            qrDataUrl: '',
          ),
          onConfirm: (code) async {
            confirmedCode = code;
            return const v1api.CrmTwoFactorCodes(codes: ['AAAA-1111', 'BBBB-2222']);
          },
          onSaveRules: (body) async {
            savedRules = body;
            return const v1api.Done(ok: true, message: 'Сохранено');
          },
        ),
      ));
      await tester.pumpAndSettle();

      expect(find.text('выключен'), findsOneWidget);
      expect(find.text('Айгерим'), findsOneWidget);

      await tester.tap(find.text('Включить 2FA'));
      await tester.pumpAndSettle();

      expect(find.text('JBSWY3DPEHPK3PXP'), findsOneWidget);
      expect(find.text('Открыть в аутентификаторе'), findsOneWidget);

      await tester.enterText(find.byType(TextField), '123456');
      await tester.tap(find.text('Подтвердить и включить'));
      await tester.pumpAndSettle();

      expect(confirmedCode, '123456');
      expect(find.text('Сохраните резервные коды'), findsOneWidget);
      expect(find.text('AAAA-1111'), findsOneWidget);

      // Переключение обязательной 2FA для команды.
      await tester.scrollUntilVisible(find.text('Обязательная 2FA для всех'), 200, scrollable: find.byType(Scrollable).first);
      await tester.tap(find.byType(Switch).first);
      await tester.pumpAndSettle();
      expect(savedRules?.require2fa, isTrue);
    });

    test('маршруты /admin/security и /admin/team/roles открываются нативными экранами', () {
      expect(nativePageFor('/admin/security'), isNotNull);
      expect(nativePageFor('/admin/team/roles'), isNotNull);
      expect(crmWebSections.any((w) => w.path == '/admin/security'), isFalse);
      expect(appSections.containsKey('security'), isTrue);
      expect(appSections.containsKey('roles'), isTrue);
    });
  });
}
