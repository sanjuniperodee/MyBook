import 'package:flutter/cupertino.dart';
import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:provider/provider.dart';

import '../core/api.dart';
import '../core/auth.dart';
import '../core/contact_actions.dart';
import '../core/format.dart';
import '../core/tasks_store.dart';
import '../models/work.dart';
import '../ui/avatar.dart';
import '../ui/kit.dart';
import '../ui/tokens.dart';
import 'deal_screen.dart';
import 'deals_screen.dart' show hexColor;
import 'new_deal_sheet.dart';
import 'task_editor.dart';

const _orderStatus = {'pending_payment': 'Ожидает оплаты', 'paid': 'Оплачен', 'in_production': 'В производстве', 'shipped': 'Отправлен', 'delivered': 'Доставлен', 'cancelled': 'Отменён'};
const _bookStatus = {'draft': 'Пишется', 'ordered': 'Заказана'};
const _plan = {'hardcover': 'твёрдая', 'softcover': 'мягкая', 'digital': 'электронная'};

/// Карточка клиента: связаться, завести сделку или задачу, покупки, книги, заказы, сделки, заметки.
class ClientScreen extends StatefulWidget {
  const ClientScreen({super.key, required this.clientId, this.title});
  final String clientId;
  final String? title;

  @override
  State<ClientScreen> createState() => _ClientScreenState();
}

class _ClientScreenState extends State<ClientScreen> {
  Map<String, dynamic>? _d;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final r = await context.read<AuthState>().api.get('/api/mobile/clients/${widget.clientId}') as Map<String, dynamic>;
      if (mounted) setState(() => _d = r);
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    }
  }

  @override
  Widget build(BuildContext context) {
    final c = context.c;
    final d = _d;
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
                Expanded(child: Text(d?['name'] as String? ?? widget.title ?? 'Клиент', maxLines: 1, overflow: TextOverflow.ellipsis, style: AppText.headline(context))),
              ]),
            ),
          ),
        ),
        Expanded(
          child: d == null
              ? (_error != null ? EmptyState(icon: LucideIcons.circleAlert, title: 'Не удалось открыть клиента', hint: _error, action: 'Повторить', onAction: _load) : const Center(child: CircularProgressIndicator()))
              : RefreshIndicator(onRefresh: _load, color: c.brand, child: _body(context, d)),
        ),
      ]),
    );
  }

  Widget _body(BuildContext context, Map<String, dynamic> d) {
    final c = context.c;
    final staff = context.read<AuthState>().staff!;
    final name = d['name'] as String? ?? '';
    final phone = d['phone'] as String?;
    final email = d['email'] as String?;
    final tags = [for (final t in (d['tags'] as List? ?? const [])) t as String];
    final money0 = (d['money'] as Map<String, dynamic>?) ?? const {};
    num n(Object? v) => num.tryParse('${v ?? 0}') ?? 0;
    final canWrite = d['canWrite'] == true;
    final target = TaskTarget(clientId: widget.clientId);
    final deals = (d['deals'] as List).cast<Map<String, dynamic>>();
    final orders = (d['orders'] as List).cast<Map<String, dynamic>>();
    final books = (d['books'] as List).cast<Map<String, dynamic>>();
    final tasks = (d['tasks'] as List).cast<Map<String, dynamic>>();
    final notes = (d['notes'] as List).cast<Map<String, dynamic>>();
    final actions = <(IconData, String, VoidCallback)>[
      if (phone != null || staff.can('calls.make')) (LucideIcons.phone, 'Позвонить', () => ContactActions(context).call(phone: phone, target: target)),
      if (staff.can('chats.send')) (LucideIcons.messageCircle, 'Написать', () => ContactActions(context).chat(target: target)),
      if (staff.can('deals.edit') && canWrite)
        (LucideIcons.handshake, 'Сделка', () async {
          final id = await showNewDealSheet(context, api: context.read<AuthState>().api, clientId: widget.clientId, contactName: name, contactPhone: phone);
          if (id != null && context.mounted) {
            await Navigator.of(context).push(CupertinoPageRoute<void>(builder: (_) => DealScreen(dealId: id)));
            _load();
          }
        }),
      if (canWrite)
        (LucideIcons.listPlus, 'Задача', () async {
          if (await showTaskEditor(context, target: target, contextLabel: name)) _load();
        }),
    ];
    return ListView(physics: const BouncingScrollPhysics(parent: AlwaysScrollableScrollPhysics()), padding: const EdgeInsets.only(top: 16, bottom: 40), children: [
      Padding(
        padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
        child: Container(
          padding: const EdgeInsets.all(18),
          decoration: BoxDecoration(color: c.surfaceRaised, borderRadius: BorderRadius.circular(Rd.lg), border: Border.all(color: c.border, width: 0.6)),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Row(children: [
              AppAvatar(name: name, size: 64),
              const SizedBox(width: 16),
              Expanded(
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text(name, style: AppText.title(context)),
                  if (phone != null) Text(phone, style: AppText.sub(context)),
                  if (email != null && email.isNotEmpty) Text(email, style: AppText.caption(context)),
                ]),
              ),
            ]),
            if (tags.isNotEmpty) Padding(padding: const EdgeInsets.only(top: 14), child: Wrap(spacing: 6, runSpacing: 6, children: [for (final t in tags) Tag(t, fg: c.brandDeep, bg: c.brand.withValues(alpha: 0.12))])),
            const SizedBox(height: 16),
            Row(children: [
              _Stat(label: 'Куплено', value: money(n(money0['total']))),
              const SizedBox(width: 12),
              _Stat(label: 'Заказов', value: '${orders.length}'),
              const SizedBox(width: 12),
              _Stat(label: 'Книг', value: '${books.length}'),
            ]),
            if (d['manager'] != null) Padding(padding: const EdgeInsets.only(top: 14), child: Row(children: [Icon(LucideIcons.user, size: 15, color: c.textFaint), const SizedBox(width: 6), Text('Ведёт: ${d['manager']}', style: AppText.caption(context).copyWith(fontSize: 13.5))])),
          ]),
        ),
      ),
      if (actions.isNotEmpty)
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
          child: Row(children: [
            for (var i = 0; i < actions.length; i++) ...[
              if (i > 0) const SizedBox(width: 10),
              Expanded(child: _ActionTile(icon: actions[i].$1, label: actions[i].$2, onTap: actions[i].$3)),
            ],
          ]),
        ),
      if (deals.isNotEmpty)
        GroupCard(title: 'Сделки', children: [
          for (final x in deals)
            GroupTile(
              icon: LucideIcons.handshake,
              iconColor: hexColor(((x['stage'] as Map)['color'] as String?) ?? '#888888'),
              title: x['title'] as String? ?? '',
              subtitle: '№${x['number']} · ${(x['stage'] as Map)['name']} · ${money(n(x['amount']))}',
              onTap: () => Navigator.of(context).push(CupertinoPageRoute<void>(builder: (_) => DealScreen(dealId: x['id'] as String))),
            ),
        ]),
      if (tasks.isNotEmpty)
        GroupCard(title: 'Задачи', children: [
          for (final t in tasks)
            GroupTile(
              icon: LucideIcons.squareCheck,
              title: t['title'] as String? ?? '',
              subtitle: t['dueAt'] == null ? null : dueLabel(DateTime.parse(t['dueAt'] as String).toLocal()),
              trailing: IconButton(
                icon: Icon(LucideIcons.circle, size: 24, color: c.textFaint),
                onPressed: () async {
                  await context.read<TasksStore>().toggle(CrmTask.fromJson({...t, 'id': t['id'], 'kind': 'task'}));
                  _load();
                },
              ),
            ),
        ]),
      if (orders.isNotEmpty)
        GroupCard(title: 'Заказы', children: [
          for (final o in orders) GroupTile(icon: LucideIcons.package, title: 'Заказ №${o['number']}', subtitle: '${_orderStatus[o['status']] ?? o['status']} · ${_plan[o['plan']] ?? o['plan']}${n(o['amount']) > 0 ? ' · ${money(n(o['amount']))}' : ''}'),
        ]),
      if (books.isNotEmpty)
        GroupCard(title: 'Книги', children: [
          for (final b in books) GroupTile(icon: LucideIcons.bookOpen, title: b['title'] as String? ?? 'Без названия', subtitle: '${_bookStatus[b['status']] ?? b['status']} · ответов ${b['answered']}/${b['total']}'),
        ]),
      if (notes.isNotEmpty)
        GroupCard(title: 'Заметки', children: [
          for (final x in notes)
            Padding(padding: const EdgeInsets.all(14), child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(x['text'] as String? ?? '', style: AppText.body(context)),
              const SizedBox(height: 4),
              Text('${x['author'] ?? ''} · ${listTime(DateTime.parse(x['at'] as String).toLocal())}', style: AppText.caption(context)),
            ])),
        ]),
    ]);
  }
}

class _Stat extends StatelessWidget {
  const _Stat({required this.label, required this.value});
  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    final c = context.c;
    return Expanded(
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
        decoration: BoxDecoration(color: c.surface, borderRadius: BorderRadius.circular(Rd.md)),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(value, maxLines: 1, overflow: TextOverflow.ellipsis, style: TextStyle(fontSize: 16, fontWeight: FontWeight.w800, letterSpacing: -0.3, color: c.text)),
          const SizedBox(height: 2),
          Text(label, style: AppText.caption(context)),
        ]),
      ),
    );
  }
}

class _ActionTile extends StatelessWidget {
  const _ActionTile({required this.icon, required this.label, required this.onTap});
  final IconData icon;
  final String label;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final c = context.c;
    return Material(
      color: c.surfaceRaised,
      borderRadius: BorderRadius.circular(Rd.lg),
      child: InkWell(
        borderRadius: BorderRadius.circular(Rd.lg),
        onTap: onTap,
        child: Container(
          padding: const EdgeInsets.symmetric(vertical: 14),
          decoration: BoxDecoration(borderRadius: BorderRadius.circular(Rd.lg), border: Border.all(color: c.border, width: 0.6)),
          child: Column(children: [
            Icon(icon, size: 23, color: c.brandDeep),
            const SizedBox(height: 6),
            Text(label, style: TextStyle(fontSize: 12.5, fontWeight: FontWeight.w600, color: c.text)),
          ]),
        ),
      ),
    );
  }
}
