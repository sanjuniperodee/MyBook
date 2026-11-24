import 'package:flutter/cupertino.dart';
import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../api/mybook_api.g.dart' as v1api;
import '../../core/format.dart';
import '../../ui/tokens.dart';

/// Общее для экранов досок: цвета-токены CRM, подписи приоритета и вида, сроки, строка карточки.

/// Цвет-токен доски, метки или обложки (как в CRM: violet/teal — смеси wine/info и success/info).
Color tokenColor(BuildContext context, String? token) {
  final c = context.c;
  return switch (token) {
    'wine' => c.brand,
    'danger' => c.danger,
    'warning' => c.warn,
    'success' => c.success,
    'info' => c.violet,
    'violet' => Color.lerp(c.brand, c.violet, 0.5)!,
    'teal' => Color.lerp(c.success, c.violet, 0.5)!,
    'slate' => c.textMuted,
    _ => c.textMuted,
  };
}

const priorityLabels = {'urgent': 'Срочно', 'high': 'Высокий', 'normal': 'Обычный', 'low': 'Низкий'};
const kindLabels = {'task': 'Задача', 'call': 'Звонок', 'message': 'Написать', 'meeting': 'Встреча'};

IconData kindIcon(String kind) => switch (kind) {
      'call' => LucideIcons.phone,
      'message' => LucideIcons.messageCircle,
      'meeting' => LucideIcons.users,
      _ => LucideIcons.squareCheck,
    };

Color priorityColor(BuildContext context, String? p) => switch (p) {
      'urgent' => context.c.danger,
      'high' => context.c.warn,
      'low' => context.c.textFaint,
      _ => context.c.textMuted,
    };

/// «до 24.11 18:00», «сегодня 18:00», «завтра», с цветом: просрочено — красным.
({String text, Color color}) dueLabel(BuildContext context, String? iso, {bool done = false}) {
  final c = context.c;
  final d = iso == null ? null : DateTime.tryParse(iso)?.toLocal();
  if (d == null) return (text: '', color: c.textMuted);
  final now = DateTime.now();
  final today = DateTime(now.year, now.month, now.day);
  final day = DateTime(d.year, d.month, d.day);
  final diff = day.difference(today).inDays;
  final time = d.hour == 0 && d.minute == 0 ? '' : ' ${hhmm(d)}';
  final text = diff == 0 ? 'сегодня$time' : diff == 1 ? 'завтра$time' : diff == -1 ? 'вчера$time' : '${two(d.day)}.${two(d.month)}$time';
  final color = done ? c.textFaint : d.isBefore(now) ? c.danger : diff == 0 ? c.warn : c.textMuted;
  return (text: text, color: color);
}

/// Выбор даты и времени срока: колесо iOS, «Без срока» — null в ответе с флагом cleared.
Future<({DateTime? at, bool cleared})?> pickDue(BuildContext context, String? currentIso) async {
  var picked = DateTime.tryParse(currentIso ?? '')?.toLocal() ?? DateTime.now().add(const Duration(hours: 1)).copyWith(minute: 0);
  final r = await showCupertinoModalPopup<String>(
    context: context,
    builder: (ctx) => Container(
      height: 340,
      color: ctx.c.surfaceRaised,
      child: SafeArea(
        top: false,
        child: Column(children: [
          Row(children: [
            CupertinoButton(onPressed: () => Navigator.pop(ctx, 'clear'), child: Text('Без срока', style: TextStyle(color: ctx.c.danger))),
            const Spacer(),
            CupertinoButton(onPressed: () => Navigator.pop(ctx), child: const Text('Отмена')),
            CupertinoButton(onPressed: () => Navigator.pop(ctx, 'ok'), child: const Text('Готово', style: TextStyle(fontWeight: FontWeight.w600))),
          ]),
          Expanded(
            child: CupertinoDatePicker(mode: CupertinoDatePickerMode.dateAndTime, use24hFormat: true, minuteInterval: 5, initialDateTime: picked.copyWith(minute: picked.minute - picked.minute % 5), onDateTimeChanged: (d) => picked = d),
          ),
        ]),
      ),
    ),
  );
  if (r == 'clear') return (at: null, cleared: true);
  if (r == 'ok') return (at: picked, cleared: false);
  return null;
}

/// ISO-строка со смещением зоны телефона (контракт ждёт дату-время со смещением).
String isoWithOffset(DateTime local) {
  final o = local.timeZoneOffset;
  final sign = o.isNegative ? '-' : '+';
  final h = two(o.inHours.abs());
  final m = two(o.inMinutes.abs() % 60);
  return '${local.year.toString().padLeft(4, '0')}-${two(local.month)}-${two(local.day)}T${two(local.hour)}:${two(local.minute)}:00$sign$h:$m';
}

/// Карточка в списке колонки и в календаре: обложка-полоса, метки, название, срок, исполнители, счётчики.
class CardTile extends StatelessWidget {
  const CardTile({super.key, required this.card, required this.labels, required this.staff, this.onTap, this.onLongPress, this.showBoard});
  final v1api.CardSummary card;
  final Map<String, v1api.BoardLabel> labels;
  final Map<String, String> staff;
  final VoidCallback? onTap;
  final VoidCallback? onLongPress;
  final String? showBoard;

  @override
  Widget build(BuildContext context) {
    final c = context.c;
    final done = card.doneAt != null;
    final due = dueLabel(context, card.dueAt, done: done);
    final names = [for (final id in card.assigneeIds) staff[id] ?? ''].where((n) => n.isNotEmpty).toList();
    return Material(
      color: c.surfaceRaised,
      borderRadius: BorderRadius.circular(Rd.md),
      child: InkWell(
        borderRadius: BorderRadius.circular(Rd.md),
        onTap: onTap,
        onLongPress: onLongPress,
        child: Container(
          decoration: BoxDecoration(borderRadius: BorderRadius.circular(Rd.md), border: Border.all(color: c.border, width: 0.6)),
          clipBehavior: Clip.antiAlias,
          child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            if (card.coverColor != null) Container(height: 6, color: tokenColor(context, card.coverColor)),
            Padding(
              padding: const EdgeInsets.fromLTRB(12, 10, 12, 11),
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                if (card.labelIds.isNotEmpty)
                  Padding(
                    padding: const EdgeInsets.only(bottom: 6),
                    child: Wrap(spacing: 5, runSpacing: 4, children: [
                      for (final id in card.labelIds)
                        if (labels[id] != null)
                          Container(
                            padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 2),
                            decoration: BoxDecoration(color: tokenColor(context, labels[id]!.color).withValues(alpha: 0.14), borderRadius: BorderRadius.circular(6)),
                            child: Text(labels[id]!.name, style: TextStyle(fontSize: 11.5, fontWeight: FontWeight.w600, color: tokenColor(context, labels[id]!.color))),
                          ),
                    ]),
                  ),
                Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  if (card.kind != 'task') Padding(padding: const EdgeInsets.only(top: 2, right: 6), child: Icon(kindIcon(card.kind), size: 15, color: c.textMuted)),
                  Expanded(
                    child: Text(
                      card.title,
                      style: TextStyle(fontSize: 15.5, height: 1.3, fontWeight: FontWeight.w500, color: done ? c.textFaint : c.text, decoration: done ? TextDecoration.lineThrough : null),
                    ),
                  ),
                  if (card.priority == 'urgent' || card.priority == 'high') Padding(padding: const EdgeInsets.only(left: 6, top: 2), child: Icon(LucideIcons.flag, size: 14, color: priorityColor(context, card.priority))),
                ]),
                if (showBoard != null) Padding(padding: const EdgeInsets.only(top: 3), child: Text(showBoard!, style: AppText.caption(context))),
                if (due.text.isNotEmpty || names.isNotEmpty || card.checklistTotal > 0 || card.comments > 0 || card.attachments > 0 || card.links.isNotEmpty)
                  Padding(
                    padding: const EdgeInsets.only(top: 7),
                    child: Wrap(spacing: 10, runSpacing: 4, crossAxisAlignment: WrapCrossAlignment.center, children: [
                      if (due.text.isNotEmpty) _meta(LucideIcons.clock, due.text, due.color),
                      if (card.checklistTotal > 0) _meta(LucideIcons.squareCheck, '${card.checklistDone}/${card.checklistTotal}', card.checklistDone == card.checklistTotal ? c.success : c.textMuted),
                      if (card.comments > 0) _meta(LucideIcons.messageSquare, '${card.comments}', c.textMuted),
                      if (card.attachments > 0) _meta(LucideIcons.paperclip, '${card.attachments}', c.textMuted),
                      for (final l in card.links.take(2)) _meta(_linkIcon(l.type), l.label, c.textMuted),
                      if (names.isNotEmpty) _meta(LucideIcons.user, names.length > 1 ? '${names.first.split(' ').first} +${names.length - 1}' : names.first.split(' ').first, c.textMuted),
                    ]),
                  ),
              ]),
            ),
          ]),
        ),
      ),
    );
  }

  static IconData _linkIcon(String type) => switch (type) {
        'deal' => LucideIcons.handshake,
        'order' => LucideIcons.package,
        'client' => LucideIcons.user,
        'chat' => LucideIcons.messageCircle,
        _ => LucideIcons.bookOpen,
      };

  Widget _meta(IconData icon, String text, Color color) => Row(mainAxisSize: MainAxisSize.min, children: [
        Icon(icon, size: 13, color: color),
        const SizedBox(width: 3),
        ConstrainedBox(constraints: const BoxConstraints(maxWidth: 140), child: Text(text, maxLines: 1, overflow: TextOverflow.ellipsis, style: TextStyle(fontSize: 12.5, color: color, fontWeight: FontWeight.w500))),
      ]);
}
