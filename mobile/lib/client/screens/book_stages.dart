import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../api/mybook_api.g.dart' as v1api;
import '../data/session.dart';
import '../ui/book_chrome.dart';
import '../ui/motion.dart';
import 'answer_screen.dart';
import 'checkout_screen.dart';
import 'cover_screen.dart';
import 'letters_screen.dart';
import 'order_screen.dart';
import 'photos_screen.dart';
import 'preview_screen.dart';

/// Общий каркас книги, как лента BookTabs сайта: на штабе и на каждом этапе одна и та же шапка и одна и та же лента
/// («Обзор», шаги пути, «Макет и 3D», «Письма»). Этап меняется на месте — без возврата на штаб: новый этап встаёт
/// вместо текущего, «Обзор» — шаг назад к штабу. Ключи и подписи — с сервера (cabinetBook.steps).

/// Шаги пути из модели штаба — те, что есть экраном в приложении.
List<BookStep> bookSteps(v1api.CabinetBook h) => [
  for (final s in h.steps)
    if (s.key == 'write' || s.key == 'photos' || s.key == 'design' || s.key == 'order')
      BookStep(key: s.key, label: s.title, status: s.status, fraction: s.fraction),
];

/// Модель штаба для ленты этапа: свежая из сессии (штаб перечитывает её после каждого этапа), иначе переданная.
v1api.CabinetBook _fresh(BuildContext context, v1api.CabinetBook h) =>
    context.read<ClientSession>().hubs[h.id] ?? h;

/// Лента этапов под шапкой книги; active — ключ текущего экрана ('hub', 'write', 'photos', 'design', 'order',
/// 'preview', 'letters').
class BookStageTabs extends StatelessWidget {
  const BookStageTabs({super.key, required this.hub, required this.active, this.onTap});
  final v1api.CabinetBook hub;
  final String active;

  /// Своя обработка (штаб — с анимацией книги); по умолчанию — смена этапа на месте.
  final ValueChanged<String>? onTap;

  @override
  Widget build(BuildContext context) {
    final h = _fresh(context, hub);
    return StepTabs(
      steps: bookSteps(h),
      active: active,
      preview: h.preview.tab,
      letters: h.letters.tab,
      memory: h.id,
      onTap: onTap ?? (k) => openBookStage(context, h, k, from: active),
    );
  }
}

/// Открыть этап книги. С штаба — поверх штаба; с этапа — вместо него (лента и шапка остаются на месте).
Future<void> openBookStage(BuildContext context, v1api.CabinetBook hub, String key, {required String from}) async {
  if (key == from) return;
  final nav = Navigator.of(context);
  if (key == 'hub') {
    nav.maybePop();
    return;
  }
  final h = _fresh(context, hub);
  // Заказ уже оформлен — шаг ведёт в заказ: это отдельная страница, поверх.
  if (key == 'order') {
    final href = h.steps.where((s) => s.key == 'order').firstOrNull?.href ?? '';
    final parts = Uri.parse(href).pathSegments;
    if (parts.length >= 2 && parts[0] == 'orders') {
      await nav.push(CabinetRoute<void>(builder: (_) => OrderScreen(orderId: parts[1])));
      return;
    }
  }
  final page = await _stagePage(context, h, key);
  if (page == null || !context.mounted) return;
  final route = StageRoute<void>(builder: (_) => page);
  if (from == 'hub') {
    await nav.push(route);
  } else {
    await nav.pushReplacement(route);
  }
}

Future<Widget?> _stagePage(BuildContext context, v1api.CabinetBook h, String key) async {
  switch (key) {
    case 'write':
      final store = context.read<ClientSession>().book(h.id);
      if (store.book == null) await store.load();
      final qs = store.book?.questions ?? const [];
      if (qs.isEmpty) return null;
      final q = qs.where((x) => !x.answered).firstOrNull ?? qs.first;
      return AnswerScreen(store: store, questionId: q.id, hub: h);
    case 'photos':
      return PhotosScreen(store: context.read<ClientSession>().book(h.id), hub: h);
    case 'design':
      return CoverScreen(hub: h);
    case 'order':
      return CheckoutScreen(bookId: h.id, bookTitle: h.title);
    case 'preview':
      return PreviewScreen(hub: h);
    case 'letters':
      return LettersScreen(hub: h);
  }
  return null;
}

/// Смена этапа: шапка и лента одинаковые на обоих экранах, поэтому меняется только содержимое — короткое
/// растворение без сдвига страницы.
class StageRoute<T> extends PageRouteBuilder<T> {
  StageRoute({required WidgetBuilder builder})
    : super(
        transitionDuration: const Duration(milliseconds: 200),
        reverseTransitionDuration: const Duration(milliseconds: 200),
        pageBuilder: (context, _, _) => builder(context),
        transitionsBuilder: (_, animation, _, child) =>
            FadeTransition(opacity: CurvedAnimation(parent: animation, curve: Curves.easeOut), child: child),
      );
}
