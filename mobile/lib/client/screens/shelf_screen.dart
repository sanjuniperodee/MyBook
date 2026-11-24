import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:provider/provider.dart';

import '../../ui/kit.dart';
import '../../ui/tokens.dart';
import '../data/models.dart';
import '../data/session.dart';
import '../data/stores.dart';
import 'book_screen.dart';

/// «Мои книги» — полка кабинета: каждая книга корешком-обложкой, ход работы и заказ.
class ShelfScreen extends StatefulWidget {
  const ShelfScreen({super.key});

  @override
  State<ShelfScreen> createState() => _ShelfScreenState();
}

class _ShelfScreenState extends State<ShelfScreen> {
  late final ShelfStore _shelf = ShelfStore(context.read<ClientSession>().backend)..load();

  @override
  void dispose() {
    _shelf.dispose();
    super.dispose();
  }

  Future<void> _account() async {
    final session = context.read<ClientSession>();
    await showAppSheet<void>(context, title: session.user?.name.isNotEmpty == true ? session.user!.name : 'Аккаунт', icon: LucideIcons.user, builder: (ctx) {
      return Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        if (session.user?.phone.isNotEmpty == true) Padding(padding: const EdgeInsets.only(bottom: 16), child: Text(session.user!.phone, style: AppText.sub(ctx))),
        GroupCard(padding: EdgeInsets.zero, children: [
          GroupTile(
            title: 'Выйти',
            icon: LucideIcons.logOut,
            destructive: true,
            onTap: () async {
              Navigator.of(ctx).pop();
              if (await confirm(context, title: 'Выйти из аккаунта?', message: 'Несохранённые без сети ответы на этом телефоне пропадут.', ok: 'Выйти', destructive: true)) await session.logout();
            },
          ),
        ]),
      ]);
    });
  }

  @override
  Widget build(BuildContext context) {
    final c = context.c;
    return ListenableBuilder(
      listenable: _shelf,
      builder: (context, _) {
        final books = _shelf.books;
        return Scaffold(
          backgroundColor: c.bg,
          body: RefreshIndicator(
            color: c.brand,
            onRefresh: _shelf.refresh,
            child: CustomScrollView(
              physics: const AlwaysScrollableScrollPhysics(parent: BouncingScrollPhysics()),
              slivers: [
                SliverAppBar(
                  pinned: true,
                  backgroundColor: c.bg,
                  surfaceTintColor: Colors.transparent,
                  expandedHeight: 108,
                  actions: [IconButton(icon: const Icon(LucideIcons.circleUser), tooltip: 'Аккаунт', onPressed: _account)],
                  flexibleSpace: FlexibleSpaceBar(
                    centerTitle: false,
                    titlePadding: const EdgeInsetsDirectional.only(start: 20, bottom: 12),
                    title: Text('Мои книги', style: AppText.serif(context, size: 28, weight: FontWeight.w600)),
                  ),
                ),
                if (_shelf.error != null && books != null)
                  SliverToBoxAdapter(child: Padding(padding: const EdgeInsets.fromLTRB(20, 0, 20, 8), child: Text(_shelf.error!, style: AppText.caption(context).copyWith(color: c.warn)))),
                if (books == null && _shelf.error == null)
                  const SliverFillRemaining(child: Center(child: CircularProgressIndicator()))
                else if (books == null)
                  SliverFillRemaining(child: EmptyState(icon: LucideIcons.wifiOff, title: 'Не удалось загрузить книги', hint: _shelf.error, action: 'Повторить', onAction: _shelf.refresh))
                else if (books.isEmpty)
                  const SliverFillRemaining(child: EmptyState(icon: LucideIcons.bookOpen, title: 'Книг пока нет', hint: 'Начните книгу на сайте mybooks.kz — она появится здесь.'))
                else
                  SliverPadding(
                    padding: const EdgeInsets.fromLTRB(16, 4, 16, 32),
                    sliver: SliverList.separated(
                      itemCount: books.length,
                      separatorBuilder: (_, _) => const SizedBox(height: 12),
                      itemBuilder: (context, i) => _BookCard(
                        book: books[i],
                        onTap: () async {
                          await Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => BookScreen(summary: books[i])));
                          _shelf.refresh();
                        },
                      ),
                    ),
                  ),
              ],
            ),
          ),
        );
      },
    );
  }
}

/// Обложка-корешок: винный переплёт с названием засечками — пока у книги нет снимка обложки.
class BookCoverMini extends StatelessWidget {
  const BookCoverMini({super.key, required this.title, this.width = 64});
  final String title;
  final double width;

  @override
  Widget build(BuildContext context) {
    final c = context.c;
    return Container(
      width: width,
      height: width * 1.43,
      padding: const EdgeInsets.fromLTRB(9, 8, 6, 8),
      decoration: BoxDecoration(
        color: c.brandDeep,
        borderRadius: const BorderRadius.horizontal(left: Radius.circular(3), right: Radius.circular(6)),
        border: Border(left: BorderSide(color: Colors.black.withValues(alpha: 0.25), width: 4)),
      ),
      alignment: Alignment.center,
      child: Text(title, maxLines: 4, overflow: TextOverflow.ellipsis, textAlign: TextAlign.center, style: const TextStyle(fontFamily: 'Cormorant', fontSize: 11.5, height: 1.1, fontWeight: FontWeight.w600, color: Color(0xFFF5EBDD))),
    );
  }
}

class _BookCard extends StatelessWidget {
  const _BookCard({required this.book, required this.onTap});
  final BookSummary book;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final c = context.c;
    final status = book.editable ? null : _orderLabel(book.orderStatus);
    return Material(
      color: c.surfaceRaised,
      borderRadius: BorderRadius.circular(14),
      child: InkWell(
        borderRadius: BorderRadius.circular(14),
        onTap: onTap,
        child: Container(
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(borderRadius: BorderRadius.circular(14), border: Border.all(color: c.border)),
          child: Row(children: [
            BookCoverMini(title: book.title),
            const SizedBox(width: 16),
            Expanded(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text(book.title.isEmpty ? 'Без названия' : book.title, maxLines: 2, overflow: TextOverflow.ellipsis, style: AppText.serif(context, size: 21, weight: FontWeight.w600).copyWith(height: 1.15)),
                const SizedBox(height: 6),
                if (status != null)
                  Row(children: [
                    Container(width: 7, height: 7, decoration: BoxDecoration(color: c.success, shape: BoxShape.circle)),
                    const SizedBox(width: 6),
                    Text(status, style: AppText.caption(context).copyWith(color: c.text, fontWeight: FontWeight.w500)),
                  ])
                else ...[
                  Text('Отвечено ${book.answered} из ${book.questions}${book.photos > 0 ? ' · фото ${book.photos}' : ''}', style: AppText.caption(context)),
                  const SizedBox(height: 8),
                  ClipRRect(
                    borderRadius: BorderRadius.circular(3),
                    child: LinearProgressIndicator(value: book.progress, minHeight: 4, color: c.brand, backgroundColor: c.surface),
                  ),
                ],
              ]),
            ),
            const SizedBox(width: 8),
            Icon(LucideIcons.chevronRight, size: 18, color: c.textFaint),
          ]),
        ),
      ),
    );
  }

  static String _orderLabel(String? s) => switch (s) {
        'printing' => 'Печатается',
        'shipped' => 'В пути',
        'delivered' => 'Доставлена',
        'paid' => 'Оплачена, готовим к печати',
        _ => 'Заказана',
      };
}
