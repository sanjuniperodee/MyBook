import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:provider/provider.dart';

import '../../api/mybook_api.g.dart' as v1api;
import '../../ui/kit.dart';
import '../../ui/tokens.dart';
import '../data/models.dart';
import '../data/session.dart';
import '../data/stores.dart';
import '../ui/cabinet.dart';
import '../ui/motion.dart';
import 'book_screen.dart';

/// «Мои книги» — как полка кабинета на телефоне (src/app/(app)/books/page.tsx, BooksShelf.tsx): главная книга крупно
/// (объёмная обложка, тема, название, подзаголовок, ход работы, срок, «Продолжить писать» и «Открыть книгу»), остальные —
/// листами «Другие книги». Данные и подписи — модель экрана с сервера (cabinetShelf).
class ShelfScreen extends StatefulWidget {
  const ShelfScreen({super.key});

  @override
  State<ShelfScreen> createState() => _ShelfScreenState();
}

class _ShelfScreenState extends State<ShelfScreen> {
  late final ShelfStore _shelf = ShelfStore(
    context.read<ClientSession>().backend,
  )..load();
  final _book = Book3DController();

  @override
  void dispose() {
    _shelf.dispose();
    super.dispose();
  }

  Future<void> _open(v1api.ShelfItem b, {bool write = false}) async {
    final summary = BookSummary(
      id: b.id,
      title: b.title,
      status: b.ordered ? 'ordered' : 'draft',
      answered: 0,
      questions: 0,
      photos: 0,
    );
    // «Продолжить писать»: книга сначала открывается на месте (OpenBookLink), потом — переход.
    if (write) await _book.open();
    if (!mounted) return;
    final from = write ? _book.rect : null;
    final page = BookScreen(
      summary: summary,
      writeSectionId: write ? (b.writeSectionId ?? '') : null,
      openFrom: from,
    );
    // «Продолжить писать»: под редактором сразу встаёт страница книги (назад из редактора — в книгу, как на сайте),
    // а сам редактор вырастает из открытой книги.
    await Navigator.of(context).push(
      write
          ? PageRouteBuilder<void>(
              opaque: false,
              transitionDuration: Duration.zero,
              reverseTransitionDuration: const Duration(milliseconds: 260),
              pageBuilder: (_, _, _) => page,
              transitionsBuilder: (_, a, _, c) =>
                  FadeTransition(opacity: a, child: c),
            )
          : CabinetRoute<void>(builder: (_) => page),
    );
    _book.reset();
    _shelf.refresh();
  }

  @override
  Widget build(BuildContext context) {
    final c = context.c;
    return Scaffold(
      backgroundColor: c.bg,
      appBar: CabinetTopBar(title: 'Мои книги'),
      body: ListenableBuilder(
        listenable: _shelf,
        builder: (context, _) {
          final books = _shelf.shelf?.books;
          if (books == null) {
            return _shelf.error == null
                ? const Center(child: CircularProgressIndicator())
                : EmptyState(
                    icon: LucideIcons.wifiOff,
                    title: 'Не удалось загрузить книги',
                    hint: _shelf.error,
                    action: 'Повторить',
                    onAction: _shelf.refresh,
                  );
          }
          if (books.isEmpty) {
            return const EmptyState(
              icon: LucideIcons.bookOpen,
              title: 'Книг пока нет',
              hint: 'Начните книгу на сайте mybooks.kz — она появится здесь.',
            );
          }
          final hero = books.first;
          final rest = books.skip(1).toList();
          return RefreshIndicator(
            color: c.brand,
            onRefresh: _shelf.refresh,
            child: ListView(
              physics: const AlwaysScrollableScrollPhysics(
                parent: BouncingScrollPhysics(),
              ),
              padding: const EdgeInsets.fromLTRB(16, 24, 16, 40),
              children: [
                if (_shelf.error != null)
                  Padding(
                    padding: const EdgeInsets.only(bottom: 12),
                    child: Text(
                      _shelf.error!,
                      style: AppText.caption(context).copyWith(color: c.warn),
                    ),
                  ),
                _Hero(
                  b: hero,
                  book: _book,
                  onOpen: () => _open(hero),
                  onWrite: () => _open(hero, write: true),
                ),
                if (rest.isNotEmpty) ...[
                  const SizedBox(height: 44),
                  Divider(color: c.border, height: 1),
                  const SizedBox(height: 26),
                  const Text(
                    'Другие книги',
                    style: TextStyle(
                      fontSize: 15.5,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                  const SizedBox(height: 16),
                  for (final b in rest)
                    Padding(
                      padding: const EdgeInsets.only(bottom: 14),
                      child: _ShelfCard(b: b, onTap: () => _open(b)),
                    ),
                ],
              ],
            ),
          );
        },
      ),
    );
  }
}

class _Hero extends StatelessWidget {
  const _Hero({
    required this.b,
    required this.book,
    required this.onOpen,
    required this.onWrite,
  });
  final v1api.ShelfItem b;
  final Book3DController book;
  final VoidCallback onOpen;
  final VoidCallback onWrite;

  @override
  Widget build(BuildContext context) {
    final c = context.c;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Row(
          children: [
            // Объёмная книга (Book3D, поворот 18°); на странице книги та же обложка — «перетекает» (Hero).
            GestureDetector(
              onTap: onOpen,
              child: Hero(
                tag: coverHeroTag(b.id),
                child: Book3D(
                  bookId: b.id,
                  controller: book,
                  width: 112,
                  cover: CoverPicture(url: b.coverUrl),
                ),
              ),
            ),
            const SizedBox(width: 20),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    b.kind,
                    style: TextStyle(fontSize: 14.5, color: c.textMuted),
                  ),
                  const SizedBox(height: 4),
                  GestureDetector(
                    onTap: onOpen,
                    child: Text(
                      b.title,
                      style: AppText.serif(
                        context,
                        size: 31,
                        weight: FontWeight.w500,
                      ).copyWith(height: 1.05),
                    ),
                  ),
                  if (b.subtitle.isNotEmpty) ...[
                    const SizedBox(height: 8),
                    Text(
                      b.subtitle,
                      style: AppText.serif(context, size: 17).copyWith(
                        fontStyle: FontStyle.italic,
                        color: c.textMuted,
                      ),
                    ),
                  ],
                ],
              ),
            ),
          ],
        ),
        const SizedBox(height: 24),
        if (b.ordered)
          _OrderState(b: b)
        else ...[
          ProgressRow(label: b.progressLabel, percent: b.progress),
          const SizedBox(height: 12),
          Text(
            '${b.counts} · ${b.updated}',
            style: TextStyle(fontSize: 14.5, color: c.textMuted),
          ),
        ],
        if (b.deadline != null && !b.ordered) ...[
          const SizedBox(height: 16),
          DeadlineChip(text: b.deadline!.text, tone: b.deadline!.tone),
        ],
        const SizedBox(height: 24),
        if (b.ordered) ...[
          CabinetButton(
            label: 'Открыть книгу',
            onPressed: onOpen,
            kind: b.order == null ? CabBtn.primary : CabBtn.outline,
          ),
        ] else ...[
          CabinetButton(
            label: b.started ? 'Продолжить писать' : 'Начать писать',
            icon: LucideIcons.penLine,
            onPressed: onWrite,
          ),
          const SizedBox(height: 12),
          CabinetButton(
            label: 'Открыть книгу',
            onPressed: onOpen,
            kind: CabBtn.outline,
          ),
        ],
      ],
    );
  }
}

class _OrderState extends StatelessWidget {
  const _OrderState({required this.b});
  final v1api.ShelfItem b;

  @override
  Widget build(BuildContext context) {
    final o = b.order;
    if (o == null)
      return const Align(
        alignment: Alignment.centerLeft,
        child: StatusBadge(label: 'Заказ оформлен', tone: 'success'),
      );
    return Row(
      children: [
        Text(
          o.label,
          style: const TextStyle(fontSize: 15.5, fontWeight: FontWeight.w500),
        ),
        const SizedBox(width: 12),
        StatusBadge(label: o.statusLabel, tone: o.tone),
      ],
    );
  }
}

/// Книга на второй полке: мини-обложка, тема, название, прогресс и действие — лист .panel.
class _ShelfCard extends StatelessWidget {
  const _ShelfCard({required this.b, required this.onTap});
  final v1api.ShelfItem b;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final c = context.c;
    return Material(
      color: c.surfaceRaised,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(Cab.panel),
        side: BorderSide(color: c.border),
      ),
      child: InkWell(
        borderRadius: BorderRadius.circular(Cab.panel),
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Hero(
                tag: coverHeroTag(b.id),
                child: CoverImage(url: b.coverThumbUrl, width: 80, flat: true),
              ),
              const SizedBox(width: 16),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      b.kind,
                      style: TextStyle(fontSize: 12.5, color: c.textMuted),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      b.title,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: AppText.serif(
                        context,
                        size: 21,
                        weight: FontWeight.w500,
                      ).copyWith(height: 1.2),
                    ),
                    const SizedBox(height: 12),
                    if (b.ordered)
                      _OrderState(b: b)
                    else ...[
                      ProgressRow(
                        label: b.progressLabel,
                        percent: b.progress,
                        compact: true,
                      ),
                      const SizedBox(height: 8),
                      Text(
                        b.counts,
                        style: TextStyle(fontSize: 12.5, color: c.textMuted),
                      ),
                    ],
                    if (b.deadline != null && !b.ordered) ...[
                      const SizedBox(height: 12),
                      DeadlineChip(
                        text: b.deadline!.text,
                        tone: b.deadline!.tone,
                        small: true,
                      ),
                    ],
                    const SizedBox(height: 14),
                    Row(
                      children: [
                        Text(
                          b.ordered
                              ? (b.order != null
                                    ? 'Следить за заказом'
                                    : 'Открыть книгу')
                              : (b.started
                                    ? 'Продолжить писать'
                                    : 'Начать писать'),
                          style: TextStyle(
                            fontSize: 14.5,
                            fontWeight: FontWeight.w500,
                            color: c.text,
                          ),
                        ),
                        Icon(LucideIcons.chevronRight, size: 16, color: c.text),
                      ],
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
