import 'package:flutter/cupertino.dart';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:url_launcher/url_launcher.dart';

import '../api/mybook_api.g.dart' as v1api;
import '../models/work.dart';
import '../screens/chat_screen.dart';
import '../screens/client_screen.dart';
import '../screens/deal_screen.dart';
import 'api.dart';
import 'auth.dart';
import 'v1.dart';

/// Действия «позвонить» и «написать» по сделке, заказу или клиенту — одни и те же из задач, клиентов, звонков и сделок.
class ContactActions {
  ContactActions(this.context);
  final BuildContext context;

  ApiClient get _api => context.read<AuthState>().api;

  void _toast(String text) {
    if (context.mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(text)));
  }

  static v1api.CrmReachTargetBody _reachBody(TaskTarget? target, String? callId) => v1api.CrmReachTargetBody(
        dealId: target?.dealId,
        orderId: target?.orderId,
        clientId: target?.clientId,
        callId: callId,
      );

  /// Номер виден — набираем с телефона; скрыт ролью — просим АТС соединить (номер берёт сервер).
  Future<void> call({String? phone, TaskTarget? target, String? callId}) async {
    if (phone != null && phone.isNotEmpty) {
      final digits = phone.replaceAll(RegExp(r'[^0-9+]'), '');
      await launchUrl(Uri(scheme: 'tel', path: digits.startsWith('+') ? digits : '+$digits'));
      return;
    }
    try {
      final r = await v1(_api, (c) => c.crmCallDial(body: _reachBody(target, callId)));
      _toast(r.message ?? 'Сначала зазвонит ваш телефон, затем АТС соединит с клиентом');
    } on ApiException catch (e) {
      _toast(e.message);
    }
  }

  /// Открывает (или создаёт) чат WhatsApp с клиентом.
  Future<void> chat({TaskTarget? target, String? callId}) async {
    try {
      final r = await v1(_api, (c) => c.crmChatOpen(body: _reachBody(target, callId)));
      if (!context.mounted) return;
      await Navigator.of(context).push(CupertinoPageRoute<void>(builder: (_) => ChatScreen(chatId: r.id)));
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
