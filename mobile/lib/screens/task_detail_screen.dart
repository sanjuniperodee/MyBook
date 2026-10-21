import 'package:flutter/cupertino.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:provider/provider.dart';

import '../core/api.dart';
import '../core/auth.dart';
import '../core/contact_actions.dart';
import '../core/format.dart';
import '../core/tasks_store.dart';
import '../models/work.dart';
import '../ui/kit.dart';
import '../ui/tokens.dart';
import 'chat_screen.dart';
import 'client_screen.dart';
import 'deal_screen.dart';
import 'deals_screen.dart' show hexColor;
import 'order_screen.dart';
import 'task_editor.dart';
import 'tasks_screen.dart' show showTaskActions;

/// Карточка задачи: срок и тип, выполнено одним нажатием, и всё, к чему задача привязана, — сделка (этап, сумма, кто ведёт),
/// клиент со звонком и чатом, заказ, диалог, последние записи и другие задачи по сделке. Каждая карточка — переход туда.
class TaskDetailScreen extends StatefulWidget {
  const TaskDetailScreen({super.key, required this.taskId, this.title});
  final String taskId;
  final String? title;

  @override
  State<TaskDetailScreen> createState() => _TaskDetailScreenState();
}

class _TaskDetailScreenState extends State<TaskDetailScreen> {
  Map<String, dynamic>? _d;
  CrmTask? _task;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final r = await context.read<AuthState>().api.get('/api/mobile/tasks/${widget.taskId}') as Map<String, dynamic>;
      if (!mounted) return;
      setState(() {
        _d = r;
        _task = CrmTask.fromJson(r['item'] as Map<String, dynamic>);
        _error = null;
      });
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    }
  }

  void _toast(String? text) {
    if (text != null && mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(text)));
  }

  Future<void> _push(Widget page) async {
    await Navigator.of(context).push(CupertinoPageRoute<void>(builder: (_) => page));
    if (mounted) _load();
  }

  Future<void> _toggle() async {
    final t = _task!;
    HapticFeedback.mediumImpact();
    _toast(await context.read<TasksStore>().toggle(t));
    await _load();
  }

  @override
  Widget build(BuildContext context) {
    final c = context.c;
    final d = _d;
    final t = _task;
    final staff = context.read<AuthState>().staff!;
    return Scaffold(
      backgroundColor: c.surface,
      appBar: AppBar(
        backgroundColor: c.bg,
        surfaceTintColor: Colors.transparent,
        scrolledUnderElevation: 0,
        leading: RoundIconButton(icon: LucideIcons.chevronLeft, iconSize: 28, color: c.brandDeep, onTap: () => Navigator.of(context).maybePop()),
        title: Text('Задача', style: AppText.headline(context)),
        actions: [
          if (t != null)
            Padding(
              padding: const EdgeInsets.only(right: 6),
              child: RoundIconButton(
                icon: LucideIcons.ellipsis,
                color: c.text,
                tooltip: 'Действия',
                onTap: () async {
                  await showTaskActions(context, t);
                  if (mounted) _load();
                },
              ),
            ),
        ],
      ),
      body: d == null || t == null
          ? (_error != null
                ? EmptyState(icon: LucideIcons.wifiOff, title: 'Не удалось открыть задачу', hint: _error, action: 'Повторить', onAction: _load)
                : const Center(child: CircularProgressIndicator()))
          : RefreshIndicator(
              onRefresh: _load,
              child: ListView(
                physics: const AlwaysScrollableScrollPhysics(),
                padding: const EdgeInsets.fromLTRB(16, 8, 16, 40),
                children: [
                  _head(context, d, t),
                  if (d['deal'] != null) _dealCard(context, d['deal'] as Map<String, dynamic>),
                  if (d['client'] != null || (d['contact'] as Map<String, dynamic>)['name'] != null) _clientCard(context, d, t),
                  if (d['order'] != null && staff.can('orders.view')) _orderCard(context, d['order'] as Map<String, dynamic>),
                  if (d['chat'] != null) _chatCard(context, d['chat'] as Map<String, dynamic>),
                  if ((d['others'] as List).isNotEmpty) _others(context, (d['others'] as List).cast<Map<String, dynamic>>()),
                  if ((d['notes'] as List).isNotEmpty) _notes(context, (d['notes'] as List).cast<Map<String, dynamic>>()),
                ],
              ),
            ),
    );
  }

  Widget _section(BuildContext context, String title, {required Widget child, VoidCallback? onTap}) {
    final c = context.c;
    return Padding(
      padding: const EdgeInsets.only(top: 14),
      child: Material(
        color: c.surfaceRaised,
        borderRadius: BorderRadius.circular(Rd.lg),
        child: InkWell(
          borderRadius: BorderRadius.circular(Rd.lg),
          onTap: onTap,
          child: Container(
            width: double.infinity,
            padding: const EdgeInsets.fromLTRB(16, 14, 12, 14),
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(Rd.lg),
              border: Border.all(color: c.border, width: 0.6),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Expanded(child: Text(title.toUpperCase(), style: AppText.label(context))),
                    if (onTap != null) Icon(LucideIcons.chevronRight, size: 18, color: c.textFaint),
                  ],
                ),
                const SizedBox(height: 8),
                child,
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _head(BuildContext context, Map<String, dynamic> d, CrmTask t) {
    final c = context.c;
    final task = d['task'] as Map<String, dynamic>;
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: c.surfaceRaised,
        borderRadius: BorderRadius.circular(Rd.lg),
        border: Border.all(color: c.border, width: 0.6),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(taskKindIcon(t.kind), size: 16, color: c.textMuted),
              const SizedBox(width: 6),
              Text(taskKinds[t.kind]?.label ?? 'Задача', style: AppText.caption(context)),
              if (t.fromBot) ...[const SizedBox(width: 8), Tag('от бота', fg: c.violet, bg: c.violetBg, icon: LucideIcons.bot)],
            ],
          ),
          const SizedBox(height: 8),
          Text(
            t.title,
            style: TextStyle(
              fontSize: 21,
              height: 1.25,
              fontWeight: FontWeight.w700,
              letterSpacing: -0.3,
              color: t.done ? c.textFaint : c.text,
              decoration: t.done ? TextDecoration.lineThrough : null,
            ),
          ),
          const SizedBox(height: 10),
          Wrap(
            spacing: 8,
            runSpacing: 6,
            children: [
              if (t.done)
                Tag('выполнена', fg: c.success, bg: c.success.withValues(alpha: 0.12), icon: LucideIcons.check)
              else if (t.dueAt != null)
                Tag(
                  t.overdue ? 'просрочена · ${dueLabel(t.dueAt!)}' : dueLabel(t.dueAt!),
                  fg: t.overdue ? c.danger : c.textMuted,
                  bg: t.overdue ? c.danger.withValues(alpha: 0.12) : c.border,
                  icon: LucideIcons.clock,
                )
              else
                Tag('без срока', fg: c.textMuted, bg: c.border),
              Tag(task['assignee'] != null ? '${task['assignee']}' : 'ничья', fg: c.textMuted, bg: c.border, icon: LucideIcons.user),
            ],
          ),
          if ((task['result'] as String? ?? '').isNotEmpty) ...[
            const SizedBox(height: 12),
            Text('Результат', style: AppText.label(context)),
            const SizedBox(height: 4),
            Text(task['result'] as String, style: TextStyle(fontSize: 15, height: 1.35, color: c.text)),
          ],
          if (t.editable) ...[
            const SizedBox(height: 14),
            Row(
              children: [
                Expanded(
                  child: PrimaryButton(label: t.done ? 'Вернуть в работу' : 'Выполнено', icon: t.done ? LucideIcons.undo2 : LucideIcons.circleCheck, onPressed: _toggle),
                ),
                if (!t.done) ...[
                  const SizedBox(width: 10),
                  OutlinedButton(
                    onPressed: () async => _toast(
                      await context.read<TasksStore>().snooze(t, 'hour').then((e) async {
                        await _load();
                        return e;
                      }),
                    ),
                    style: OutlinedButton.styleFrom(
                      minimumSize: const Size(0, 52),
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                    ),
                    child: const Text('+1 ч'),
                  ),
                ],
              ],
            ),
          ],
        ],
      ),
    );
  }

  Widget _dealCard(BuildContext context, Map<String, dynamic> deal) {
    final c = context.c;
    final stage = deal['stage'] as Map<String, dynamic>?;
    return _section(
      context,
      'Сделка',
      onTap: () => _push(DealScreen(dealId: deal['id'] as String)),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('№${deal['number']} · ${deal['title']}', style: AppText.headline(context)),
          const SizedBox(height: 8),
          Wrap(
            spacing: 8,
            runSpacing: 6,
            crossAxisAlignment: WrapCrossAlignment.center,
            children: [
              if (stage != null)
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 3),
                  decoration: BoxDecoration(color: hexColor(stage['color'] as String), borderRadius: BorderRadius.circular(12)),
                  child: Text(
                    stage['name'] as String,
                    style: const TextStyle(color: Colors.white, fontSize: 12.5, fontWeight: FontWeight.w600),
                  ),
                ),
              if (deal['amountLabel'] != null)
                Text(
                  deal['amountLabel'] as String,
                  style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700, color: c.text),
                ),
            ],
          ),
          const SizedBox(height: 6),
          Text(
            '${deal['source']}${deal['assignee'] != null ? ' · ведёт ${deal['assignee']}' : ' · без ответственного'}${deal['unsorted'] == true ? ' · неразобранная' : ''}',
            style: AppText.caption(context),
          ),
        ],
      ),
    );
  }

  Widget _clientCard(BuildContext context, Map<String, dynamic> d, CrmTask t) {
    final c = context.c;
    final client = d['client'] as Map<String, dynamic>?;
    final contact = d['contact'] as Map<String, dynamic>;
    final reach = t.contact;
    final canCall = reach != null && (reach.phone != null || reach.pbx);
    final canChat = reach != null && reach.chat;
    return _section(
      context,
      'Клиент',
      onTap: client == null ? null : () => _push(ClientScreen(clientId: client['id'] as String)),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text((client?['name'] as String?)?.isNotEmpty == true ? client!['name'] as String : (contact['name'] as String? ?? '—'), style: AppText.headline(context)),
                if (contact['phone'] != null)
                  Padding(
                    padding: const EdgeInsets.only(top: 3),
                    child: Text(contact['phone'] as String, style: AppText.sub(context)),
                  ),
                if (contact['email'] != null) Text(contact['email'] as String, style: AppText.caption(context)),
              ],
            ),
          ),
          if (!t.done && canCall)
            RoundIconButton(
              icon: LucideIcons.phone,
              size: 42,
              iconSize: 20,
              color: c.brandDeep,
              fill: c.brand.withValues(alpha: 0.12),
              onTap: () => ContactActions(context).call(phone: reach.phone, target: t.target),
            ),
          if (canCall && canChat) const SizedBox(width: 6),
          if (!t.done && canChat)
            RoundIconButton(
              icon: LucideIcons.messageCircle,
              size: 42,
              iconSize: 20,
              color: c.brandDeep,
              fill: c.brand.withValues(alpha: 0.12),
              onTap: () => ContactActions(context).chat(target: t.target),
            ),
        ],
      ),
    );
  }

  Widget _orderCard(BuildContext context, Map<String, dynamic> o) {
    return _section(
      context,
      'Заказ',
      onTap: () => _push(OrderScreen(orderId: o['id'] as String, number: (o['number'] as num).toInt())),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('№${o['number']}', style: AppText.headline(context)),
          if ((o['statusLabel'] as String).isNotEmpty)
            Padding(
              padding: const EdgeInsets.only(top: 3),
              child: Text([o['statusLabel'], o['amountLabel']].where((x) => (x as String).isNotEmpty).join(' · '), style: AppText.sub(context)),
            ),
        ],
      ),
    );
  }

  Widget _chatCard(BuildContext context, Map<String, dynamic> chat) {
    final c = context.c;
    final unread = (chat['unread'] as num?)?.toInt() ?? 0;
    return _section(
      context,
      'Диалог',
      onTap: () => _push(ChatScreen(chatId: chat['id'] as String)),
      child: Row(
        children: [
          Expanded(
            child: Text((chat['preview'] as String).isEmpty ? 'Открыть переписку' : chat['preview'] as String, maxLines: 2, overflow: TextOverflow.ellipsis, style: AppText.sub(context)),
          ),
          if (unread > 0) CountBadge(unread, color: c.brandDeep),
        ],
      ),
    );
  }

  Widget _others(BuildContext context, List<Map<String, dynamic>> list) {
    final c = context.c;
    return _section(
      context,
      'Другие задачи по сделке',
      child: Column(
        children: [
          for (final o in list)
            InkWell(
              onTap: () => _push(TaskDetailScreen(taskId: o['id'] as String)),
              child: Padding(
                padding: const EdgeInsets.symmetric(vertical: 9),
                child: Row(
                  children: [
                    Expanded(
                      child: Text(
                        o['title'] as String,
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(fontSize: 15, color: c.text),
                      ),
                    ),
                    if (o['dueAt'] != null)
                      Padding(
                        padding: const EdgeInsets.only(left: 8),
                        child: Text(
                          dueLabel(DateTime.parse(o['dueAt'] as String).toLocal()),
                          style: TextStyle(fontSize: 12.5, color: o['overdue'] == true ? c.danger : c.textMuted, fontWeight: o['overdue'] == true ? FontWeight.w700 : FontWeight.w500),
                        ),
                      ),
                    Icon(LucideIcons.chevronRight, size: 16, color: c.textFaint),
                  ],
                ),
              ),
            ),
        ],
      ),
    );
  }

  Widget _notes(BuildContext context, List<Map<String, dynamic>> notes) {
    final c = context.c;
    return _section(
      context,
      'Последние записи',
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          for (final n in notes)
            Padding(
              padding: const EdgeInsets.only(bottom: 12),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('${n['author']} · ${dayLabel(DateTime.parse(n['at'] as String).toLocal())}, ${hhmm(DateTime.parse(n['at'] as String).toLocal())}', style: AppText.caption(context)),
                  const SizedBox(height: 2),
                  Text(n['text'] as String, style: TextStyle(fontSize: 15, height: 1.35, color: c.text)),
                ],
              ),
            ),
        ],
      ),
    );
  }
}
