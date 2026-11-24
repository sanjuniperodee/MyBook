import 'dart:io';
import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:path_provider/path_provider.dart';
import 'package:provider/provider.dart';
import 'package:share_plus/share_plus.dart';

import '../screens/chat_screen.dart';
import '../screens/client_screen.dart';
import '../screens/crm_web_screen.dart';
import '../screens/deal_screen.dart';
import '../screens/home_screen.dart' show SectionPage;
import '../screens/order_screen.dart';
import '../ui/kit.dart';
import '../ui/tokens.dart';
import 'api.dart';
import 'auth.dart';
import 'layouts.dart';
import 'notifier.dart';

/// Страницы CRM, которые в приложении — свои разделы: адрес → ключ раздела (appSections).
const _nativePaths = {'/admin/sales': 'register', '/admin/analytics': 'analytics', '/admin/leads': 'leads', '/admin/finance': 'finance', '/admin/expenses': 'expenses', '/admin/profit': 'profit', '/admin/support': 'support', '/admin/tasks/boards': 'boards'};

/// Свой экран для адреса раздела CRM (/admin/finance?p=prev → «Финансы»); null — такого раздела в приложении нет.
Widget? nativePageFor(String path) {
  final bare = path.split('?').first.split('#').first;
  final key = _nativePaths[bare];
  final section = key == null ? null : appSections[key];
  return section == null ? null : SectionPage(section: section);
}

/// Ссылка карточки CRM из ответа API (/admin/deals/<id>, /admin/orders/<id>, /admin/clients/<id>) — своим экраном;
/// чего в приложении нет — страницей CRM внутри приложения.
Future<void> openAdminLink(BuildContext context, String href, {String? title}) {
  final t = NotificationTarget.parse(href);
  Widget? screen;
  if (t.chatId != null) screen = ChatScreen(chatId: t.chatId!);
  if (t.dealId != null) screen = DealScreen(dealId: t.dealId!);
  if (t.orderId != null) screen = OrderScreen(orderId: t.orderId!);
  if (t.clientId != null) screen = ClientScreen(clientId: t.clientId!);
  screen ??= nativePageFor(href);
  if (screen != null) return Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => screen!));
  return openCrm(context, href, title: title);
}

/// Файл с сайта по маршруту с Bearer (чек оплаты, вложение): картинка — на весь экран с увеличением, остальное (PDF) —
/// меню «Поделиться» с просмотром.
Future<void> openFile(BuildContext context, String url, {String title = 'Файл'}) async {
  final api = context.read<AuthState>().api;
  final messenger = ScaffoldMessenger.of(context);
  final nav = Navigator.of(context);
  // Файл с сайта может идти секунды — затемнение с кругом, чтобы нажатие не казалось потерянным.
  var shown = true;
  showDialog<void>(context: context, barrierDismissible: false, builder: (_) => const Center(child: CircularProgressIndicator())).then((_) => shown = false);
  void hide() {
    if (shown) nav.pop();
    shown = false;
  }

  try {
    final res = await api.getRaw(url, timeout: const Duration(minutes: 2));
    hide();
    if (res.statusCode >= 400) throw ApiException(res.statusCode, 'Файл не открылся');
    final type = res.headers['content-type'] ?? '';
    if (type.startsWith('image/')) {
      await nav.push(MaterialPageRoute<void>(builder: (_) => _ImageView(bytes: res.bodyBytes, title: title)));
      return;
    }
    final name = RegExp(r'filename="?([^";]+)"?').firstMatch(res.headers['content-disposition'] ?? '')?.group(1) ?? (type.contains('pdf') ? 'file.pdf' : 'file');
    final dir = await getTemporaryDirectory();
    final file = File('${dir.path}/$name');
    await file.writeAsBytes(res.bodyBytes, flush: true);
    await SharePlus.instance.share(ShareParams(files: [XFile(file.path)], sharePositionOrigin: const Rect.fromLTWH(0, 0, 1, 1)));
  } on ApiException catch (e) {
    messenger.showSnackBar(SnackBar(content: Text(e.message)));
  } on Exception {
    messenger.showSnackBar(const SnackBar(content: Text('Файл не открылся — проверьте сеть')));
  } finally {
    hide();
  }
}

class _ImageView extends StatelessWidget {
  const _ImageView({required this.bytes, required this.title});
  final Uint8List bytes;
  final String title;

  @override
  Widget build(BuildContext context) => Scaffold(
        backgroundColor: Colors.black,
        appBar: AppBar(
          backgroundColor: Colors.black,
          foregroundColor: Colors.white,
          title: Text(title, style: const TextStyle(color: Colors.white, fontSize: 17, fontWeight: FontWeight.w600)),
          actions: [
            RoundIconButton(
              icon: LucideIcons.share,
              size: 44,
              iconSize: 20,
              color: Colors.white,
              onTap: () async {
                final dir = await getTemporaryDirectory();
                final f = File('${dir.path}/receipt.jpg');
                await f.writeAsBytes(bytes, flush: true);
                await SharePlus.instance.share(ShareParams(files: [XFile(f.path)], sharePositionOrigin: const Rect.fromLTWH(0, 0, 1, 1)));
              },
            ),
          ],
        ),
        body: Center(child: InteractiveViewer(maxScale: 6, child: Image.memory(bytes, errorBuilder: (_, _, _) => Text('Не картинка', style: TextStyle(color: context.c.textFaint))))),
      );
}
