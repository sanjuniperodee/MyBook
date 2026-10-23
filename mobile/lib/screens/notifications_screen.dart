import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:provider/provider.dart';

import '../core/format.dart';
import '../core/notifications_store.dart';
import '../core/notifier.dart';
import '../models/work.dart';
import '../ui/kit.dart';
import '../ui/tokens.dart';

IconData notificationIcon(String kind) => switch (kind) {
      'message' || 'mention' => LucideIcons.messageCircle,
      'task' || 'reminder' => LucideIcons.alarmClock,
      'call' => LucideIcons.phoneMissed,
      'deal' => LucideIcons.handshake,
      'sla' => LucideIcons.timerOff,
      'invoice' || 'payment' => LucideIcons.receipt,
      _ => LucideIcons.bell,
    };

/// Лента уведомлений: напоминания о задачах, новые заявки, упоминания, пропущенные звонки. Нажатие открывает нужный экран.
class NotificationsScreen extends StatefulWidget {
  const NotificationsScreen({super.key});

  @override
  State<NotificationsScreen> createState() => _NotificationsScreenState();
}

class _NotificationsScreenState extends State<NotificationsScreen> {
  @override
  void initState() {
    super.initState();
    context.read<NotificationsStore>().load();
  }

  @override
  Widget build(BuildContext context) {
    final c = context.c;
    final store = context.watch<NotificationsStore>();
    return Scaffold(
      backgroundColor: c.surface,
      body: Column(children: [
        Container(
          decoration: BoxDecoration(color: c.bg, border: Border(bottom: BorderSide(color: c.border, width: 0.6))),
          child: SafeArea(
            bottom: false,
            child: SizedBox(
              height: 52,
              child: Row(children: [
                RoundIconButton(icon: LucideIcons.chevronLeft, size: 44, iconSize: 28, color: c.brandDeep, onTap: () => Navigator.of(context).maybePop()),
                Expanded(child: Text('Уведомления', style: AppText.headline(context))),
                if (store.unread > 0) TextButton(onPressed: store.markAllRead, child: Text('Прочитать все', style: TextStyle(color: c.brandDeep, fontWeight: FontWeight.w600))),
                const SizedBox(width: 6),
              ]),
            ),
          ),
        ),
        Expanded(
          child: !store.loaded
              ? (store.error != null ? EmptyState(icon: LucideIcons.wifiOff, title: 'Не удалось загрузить', hint: store.error, action: 'Повторить', onAction: store.load) : const ChatListSkeleton(rows: 7))
              : store.items.isEmpty
                  ? const EmptyState(icon: LucideIcons.bellOff, title: 'Уведомлений пока нет', hint: 'Здесь появятся напоминания о задачах и новые заявки')
                  : RefreshIndicator(
                      onRefresh: store.load,
                      color: c.brand,
                      child: ListView.separated(
                        physics: const AlwaysScrollableScrollPhysics(parent: BouncingScrollPhysics()),
                        padding: const EdgeInsets.only(bottom: 30),
                        itemCount: store.items.length,
                        separatorBuilder: (_, _) => Divider(indent: 72, color: c.border),
                        itemBuilder: (_, i) => _Row(n: store.items[i]),
                      ),
                    ),
        ),
      ]),
    );
  }
}

class _Row extends StatelessWidget {
  const _Row({required this.n});
  final AppNotification n;

  @override
  Widget build(BuildContext context) {
    final c = context.c;
    final accent = switch (n.kind) { 'call' || 'sla' => c.danger, 'task' || 'reminder' => c.warn, 'deal' => c.violet, _ => c.brandDeep };
    return Material(
      color: n.read ? c.bg : c.brand.withValues(alpha: context.isDark ? 0.08 : 0.05),
      child: InkWell(
        onTap: () {
          context.read<NotificationsStore>().markRead(n);
          final target = NotificationTarget.parse(n.link);
          if (target.isEmpty) return;
          Navigator.of(context).popUntil((r) => r.isFirst);
          context.read<Notifier>().open(target);
        },
        child: Padding(
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 12),
          child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Container(width: 42, height: 42, decoration: BoxDecoration(color: accent.withValues(alpha: 0.14), shape: BoxShape.circle), child: Icon(notificationIcon(n.kind), size: 20, color: accent)),
            const SizedBox(width: 14),
            Expanded(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Row(children: [
                  Expanded(child: Text(n.title, maxLines: 2, overflow: TextOverflow.ellipsis, style: TextStyle(fontSize: 16, fontWeight: n.read ? FontWeight.w500 : FontWeight.w700, color: c.text, letterSpacing: -0.2))),
                  const SizedBox(width: 8),
                  Text(listTime(n.at), style: AppText.caption(context)),
                ]),
                if (n.body.isNotEmpty) Padding(padding: const EdgeInsets.only(top: 2), child: Text(n.body, maxLines: 3, overflow: TextOverflow.ellipsis, style: AppText.sub(context))),
              ]),
            ),
            if (!n.read) Padding(padding: const EdgeInsets.only(left: 8, top: 6), child: Container(width: 9, height: 9, decoration: BoxDecoration(color: c.brand, shape: BoxShape.circle))),
          ]),
        ),
      ),
    );
  }
}
