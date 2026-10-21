import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:mybooks_seller/core/api.dart';
import 'package:mybooks_seller/core/format.dart';
import 'package:mybooks_seller/core/notifier.dart';
import 'package:mybooks_seller/models/chat.dart';
import 'package:mybooks_seller/models/deal.dart';
import 'package:mybooks_seller/widgets/message_bubble.dart';

void main() {
  setUpAll(() => initializeDateFormatting('ru'));

  group('ссылки уведомлений', () {
    test('диалог и сделка из ссылки CRM', () {
      final chat = NotificationTarget.parse('/admin/chats?c=20bc2e0b-885b-4d12-a10c-c984d0d5630b');
      expect(chat?.chatId, '20bc2e0b-885b-4d12-a10c-c984d0d5630b');
      final deal = NotificationTarget.parse('/admin/deals/b70f2c02-9eb4-4150-ae9d-ae02d1aa485b');
      expect(deal?.dealId, 'b70f2c02-9eb4-4150-ae9d-ae02d1aa485b');
      expect(NotificationTarget.parse('/admin/finance'), isNull);
      expect(NotificationTarget.parse(null), isNull);
    });
  });

  group('модели сервера', () {
    test('сообщение: направление, ответ на сообщение, расшифровка', () {
      final m = Message.fromJson({
        'id': 'm1',
        'direction': 'out',
        'type': 'audio',
        'text': '🎤 Голосовое',
        'media': '/api/admin/chats/messages/m1/media',
        'status': 'delivered',
        'at': '2026-10-21T04:00:00.000Z',
        'author': 'Margo',
        'transcript': 'Здравствуйте',
        'replyTo': {'id': 'm0', 'text': 'Цена?', 'type': 'text', 'direction': 'in', 'author': null},
      });
      expect(m.outgoing, isTrue);
      expect(m.type, 'audio');
      expect(m.replyTo?.text, 'Цена?');
      expect(m.replyTo?.outgoing, isFalse);
      expect(m.transcript, 'Здравствуйте');
      expect(m.isPending, isFalse);
    });

    test('сделка в списке: срок задачи и просрочка', () {
      final d = DealRow.fromJson({
        'id': 'd1',
        'number': 9,
        'title': 'Книга',
        'contactName': 'Айгерим',
        'stageId': 's1',
        'amount': 20000,
        'paid': 10000,
        'source': 'WhatsApp',
        'assignee': null,
        'unsorted': false,
        'unread': 2,
        'daysInStage': 3,
        'nextTask': {'at': '2026-10-20T04:00:00.000Z', 'overdue': true},
      });
      expect(d.paid, 10000);
      expect(d.taskOverdue, isTrue);
      expect(d.taskAt, isNotNull);
    });

    test('счёт можно оплатить, только пока он не просрочен', () {
      InvoiceBrief inv(bool overdue, String status) => InvoiceBrief.fromJson({'id': 'i', 'label': '№1', 'amount': 5000, 'status': status, 'overdue': overdue, 'expiresLabel': '', 'paidLabel': null, 'link': null});
      expect(inv(false, 'pending_payment').payable, isTrue);
      expect(inv(true, 'pending_payment').payable, isFalse);
      expect(inv(false, 'paid').payable, isFalse);
    });
  });

  group('форматы', () {
    test('время в списке: сегодня — часы, вчера — слово', () {
      final now = DateTime.now();
      expect(listTime(DateTime(now.year, now.month, now.day, 9, 5)), '09:05');
      expect(listTime(now.subtract(const Duration(days: 1))), 'Вчера');
      expect(listTime(null), '');
    });

    test('деньги и длительность', () {
      expect(money(1234567).replaceAll(RegExp(r'\s'), ' '), '1 234 567 ₸');
      expect(duration(const Duration(seconds: 75)), '1:15');
    });
  });

  group('API', () {
    test('адрес вложения: путь с сервера дополняется адресом сервера, чужая ссылка остаётся', () {
      final api = ApiClient(baseUrl: 'https://mybooks.kz/');
      expect(api.mediaUrl('/api/admin/chats/messages/1/media'), 'https://mybooks.kz/api/admin/chats/messages/1/media');
      expect(api.mediaUrl('https://cdn.example/a.png'), 'https://cdn.example/a.png');
      expect(api.mediaUrl(null), isNull);
      expect(api.mediaUrl('store:file'), isNull);
    });

    test('токен уходит заголовком Bearer', () {
      final api = ApiClient(baseUrl: 'https://mybooks.kz', token: 'abc');
      expect(api.headers['Authorization'], 'Bearer abc');
    });
  });

  test('контур пузыря: с хвостиком шире тела на ширину хвоста', () {
    const rect = Rect.fromLTWH(0, 0, 100, 40);
    final plain = const BubbleBorder(outgoing: true, tail: false).getOuterPath(rect).getBounds();
    final tailed = const BubbleBorder(outgoing: true, tail: true).getOuterPath(rect).getBounds();
    expect(plain.width, 100);
    expect(tailed.width, closeTo(100 + BubbleBorder.tailWidth, 0.5));
    final incoming = const BubbleBorder(outgoing: false, tail: true).getOuterPath(rect).getBounds();
    expect(incoming.left, closeTo(-BubbleBorder.tailWidth, 0.5));
  });
}
