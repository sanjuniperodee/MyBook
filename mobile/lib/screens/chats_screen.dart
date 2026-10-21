import 'package:flutter/cupertino.dart';
import 'package:flutter/services.dart';
import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:provider/provider.dart';

import '../core/chats_store.dart';
import '../core/format.dart';
import '../models/chat.dart';
import '../ui/avatar.dart';
import '../ui/kit.dart';
import '../ui/tokens.dart';
import 'chat_screen.dart';

/// Главный экран: большой заголовок, поиск, фильтры-«пилюли» и список диалогов с непрочитанным, ожиданием ответа и ботом.
class ChatsScreen extends StatelessWidget {
  const ChatsScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final store = context.watch<ChatsStore>();
    final c = context.c;
    final top = MediaQuery.of(context).padding.top;
    Widget body;
    if (!store.loaded && store.error == null) {
      body = const SliverFillRemaining(hasScrollBody: false, child: SizedBox(height: 520, child: ChatListSkeleton()));
    } else if (store.items.isEmpty) {
      body = SliverFillRemaining(
        hasScrollBody: false,
        child: store.error != null
            ? EmptyState(icon: LucideIcons.wifiOff, title: 'Не удалось загрузить', hint: store.error, action: 'Повторить', onAction: store.load)
            : EmptyState(
                icon: store.query.isEmpty ? LucideIcons.messagesSquare : LucideIcons.searchX,
                title: store.query.isEmpty ? 'Здесь пока пусто' : 'Ничего не нашлось',
                hint: store.query.isEmpty ? 'Новые сообщения клиентов появятся здесь' : 'Попробуйте другое имя, номер или слово',
              ),
      );
    } else {
      body = SliverList.builder(
        itemCount: store.items.length,
        itemBuilder: (_, i) => _ChatTile(chat: store.items[i], last: i == store.items.length - 1),
      );
    }
    return Scaffold(
      backgroundColor: c.bg,
      body: CustomScrollView(
        physics: const BouncingScrollPhysics(parent: AlwaysScrollableScrollPhysics()),
        slivers: [
          CupertinoSliverRefreshControl(onRefresh: store.load),
          SliverToBoxAdapter(
            child: Padding(
              padding: EdgeInsets.fromLTRB(20, top + 10, 20, 4),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.center,
                children: [
                  Expanded(child: Text('Чаты', style: AppText.largeTitle(context))),
                  if (store.unreadChats > 0) CountBadge(store.unreadChats),
                ],
              ),
            ),
          ),
          SliverToBoxAdapter(
            child: Padding(
              padding: const EdgeInsets.fromLTRB(16, 10, 16, 10),
              child: AppSearchField(hint: 'Имя, номер или текст', onChanged: store.setQuery),
            ),
          ),
          SliverToBoxAdapter(
            child: SizedBox(
              height: 40,
              child: ListView(
                scrollDirection: Axis.horizontal,
                padding: const EdgeInsets.symmetric(horizontal: 16),
                children: [
                  for (final e in chatFilters.entries)
                    Padding(
                      padding: const EdgeInsets.only(right: 8),
                      child: FilterPill(label: e.value, selected: store.filter == e.key, onTap: () => store.setFilter(e.key)),
                    ),
                ],
              ),
            ),
          ),
          const SliverToBoxAdapter(child: SizedBox(height: 6)),
          body,
          const SliverToBoxAdapter(child: SizedBox(height: 96)),
        ],
      ),
    );
  }
}

class _ChatTile extends StatelessWidget {
  const _ChatTile({required this.chat, required this.last});
  final ChatSummary chat;
  final bool last;

  /// Долгое нажатие: закрепить чат вверху списка (личное закрепление) или открепить.
  Future<void> _menu(BuildContext context) async {
    HapticFeedback.mediumImpact();
    final store = context.read<ChatsStore>();
    final pin = await showAppSheet<bool>(
      context,
      title: chat.title,
      builder: (sheet) => GroupCard(
        padding: const EdgeInsets.fromLTRB(16, 4, 16, 24),
        children: [
          GroupTile(
            title: chat.pinned ? 'Открепить чат' : 'Закрепить чат',
            subtitle: chat.pinned ? null : 'Будет вверху вашего списка — у коллег по-прежнему на своём месте',
            icon: chat.pinned ? LucideIcons.pinOff : LucideIcons.pin,
            trailing: const SizedBox.shrink(),
            onTap: () => Navigator.pop(sheet, !chat.pinned),
          ),
        ],
      ),
    );
    if (pin == null || !context.mounted) return;
    final err = await store.pin(chat.id, pin);
    if (err != null && context.mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(err)));
  }

  @override
  Widget build(BuildContext context) {
    final c = context.c;
    final unread = chat.unread > 0;
    return InkWell(
      onTap: () => Navigator.of(context).push(
        CupertinoPageRoute<void>(
          builder: (_) => ChatScreen(chatId: chat.id, title: chat.title, avatarUrl: chat.avatarUrl, channel: chat.channel),
        ),
      ),
      onLongPress: () => _menu(context),
      child: Padding(
        padding: const EdgeInsets.only(left: 16),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Padding(
              padding: const EdgeInsets.only(top: 10),
              child: AppAvatar(name: chat.title, url: chat.avatarUrl, size: 54, channel: chat.channel),
            ),
            const SizedBox(width: 14),
            Expanded(
              child: Container(
                padding: const EdgeInsets.fromLTRB(0, 11, 16, 11),
                decoration: BoxDecoration(
                  border: last ? null : Border(bottom: BorderSide(color: c.border, width: 0.6)),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Expanded(
                          child: Text(
                            chat.title,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: TextStyle(fontSize: 17, fontWeight: unread ? FontWeight.w700 : FontWeight.w600, letterSpacing: -0.3, color: c.text),
                          ),
                        ),
                        const SizedBox(width: 8),
                        Text(
                          listTime(chat.lastMessageAt),
                          style: TextStyle(fontSize: 13.5, color: unread ? c.brandDeep : c.textFaint, fontWeight: unread ? FontWeight.w700 : FontWeight.w400),
                        ),
                      ],
                    ),
                    const SizedBox(height: 3),
                    Row(
                      children: [
                        Expanded(
                          child: Text(
                            chat.preview.isEmpty ? '—' : chat.preview.replaceAll('\n', ' '),
                            maxLines: 2,
                            overflow: TextOverflow.ellipsis,
                            style: TextStyle(fontSize: 15, height: 1.25, color: unread ? c.text.withValues(alpha: 0.85) : c.textMuted),
                          ),
                        ),
                        if (chat.pinned) ...[const SizedBox(width: 8), Icon(LucideIcons.pin, size: 16, color: c.textFaint)],
                        if (unread) ...[const SizedBox(width: 10), CountBadge(chat.unread)],
                      ],
                    ),
                    if (chat.waitLabel != null || chat.bot || chat.assignee != null)
                      Padding(
                        padding: const EdgeInsets.only(top: 7),
                        child: Wrap(
                          spacing: 6,
                          runSpacing: 4,
                          crossAxisAlignment: WrapCrossAlignment.center,
                          children: [
                            if (chat.waitLabel != null)
                              Tag('ждёт ${chat.waitLabel}', fg: chat.overdue ? c.danger : c.warn, bg: chat.overdue ? c.danger.withValues(alpha: 0.12) : c.warnBg, icon: LucideIcons.clock),
                            if (chat.bot) Tag('бот ведёт', fg: c.violet, bg: c.violetBg, icon: LucideIcons.bot),
                            if (chat.assignee != null) Text(chat.assignee!, style: TextStyle(fontSize: 12.5, color: c.textFaint)),
                          ],
                        ),
                      ),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
