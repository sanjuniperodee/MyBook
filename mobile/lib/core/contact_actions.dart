import 'package:flutter/cupertino.dart';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:url_launcher/url_launcher.dart';

import '../models/work.dart';
import '../screens/chat_screen.dart';
import '../screens/client_screen.dart';
import '../screens/deal_screen.dart';
import 'api.dart';
import 'auth.dart';

/// Действия «позвонить» и «написать» по сделке, заказу или клиенту — одни и те же из задач, клиентов, звонков и сделок.
class ContactActions {
  ContactActions(this.context);
  final BuildContext context;

  ApiClient get _api => context.read<AuthState>().api;

  void _toast(String text) {
    if (context.mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(text)));
  }

  /// Номер виден — набираем с телефона; скрыт ролью — просим АТС соединить (номер берёт сервер).
  Future<void> call({String? phone, TaskTarget? target, String? callId}) async {
    if (phone != null && phone.isNotEmpty) {
      final digits = phone.replaceAll(RegExp(r'[^0-9+]'), '');
      await launchUrl(Uri(scheme: 'tel', path: digits.startsWith('+') ? digits : '+$digits'));
      return;
    }
    try {
      await _api.post('/api/mobile/calls/dial', body: {...?target?.toJson(), 'callId': ?callId});
      _toast('Сначала зазвонит ваш телефон, затем АТС соединит с клиентом');
    } on ApiException catch (e) {
      _toast(e.message);
    }
  }

  /// Открывает (или создаёт) чат WhatsApp с клиентом.
  Future<void> chat({TaskTarget? target, String? callId}) async {
    try {
      final r = await _api.post('/api/mobile/chats/open', body: {...?target?.toJson(), 'callId': ?callId}) as Map<String, dynamic>;
      final id = r['id'] as String?;
      if (id == null || !context.mounted) return;
      await Navigator.of(context).push(CupertinoPageRoute<void>(builder: (_) => ChatScreen(chatId: id)));
    } on ApiException catch (e) {
      _toast(e.message);
    }
  }

  /// Экран того, к чему относится задача.
  Future<void> openContext(TaskContext ctx) async {
    final page = switch (ctx.type) {
      'deal' => DealScreen(dealId: ctx.id),
      'client' => ClientScreen(clientId: ctx.id),
      _ => null,
    };
    if (page == null) return;
    await Navigator.of(context).push(CupertinoPageRoute<void>(builder: (_) => page));
  }
}
