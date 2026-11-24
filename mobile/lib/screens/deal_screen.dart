import 'package:flutter/cupertino.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:provider/provider.dart';

import '../core/api.dart';
import '../core/auth.dart';
import '../core/contact_actions.dart';
import '../core/format.dart';
import '../models/chat.dart';
import '../models/deal.dart';
import '../models/work.dart' show TaskTarget;
import '../ui/kit.dart';
import '../ui/tokens.dart';
import 'chat_screen.dart';
import 'deals_screen.dart' show hexColor;
import 'invoice_sheet.dart';
import 'payment_sheet.dart';
import 'task_editor.dart';
import '../api/mybook_api.g.dart' as v1api;
import '../core/v1.dart';
import '../widgets/crm_form.dart';
import 'client_screen.dart';
import 'order_screen.dart';
import 'package:share_plus/share_plus.dart';
import 'deal_edit_screen.dart';

/// Карточка сделки: этап (меняется в один тап), чат и счёт, задачи, заметки, платежи и счета.

const _orderStatusLabels = {'pending_payment': 'Ожидает оплаты', 'paid': 'Оплачен', 'in_production': 'В производстве', 'shipped': 'Отправлен', 'delivered': 'Доставлен', 'cancelled': 'Отменён'};
class DealScreen extends StatefulWidget {
  const DealScreen({super.key, required this.dealId, this.fromChat = false});
  final String dealId;
  final bool fromChat;

  @override
  State<DealScreen> createState() => _DealScreenState();
}

class _DealScreenState extends State<DealScreen> {
  Map<String, dynamic>? _d;
  String? _error;

  ApiClientRef get _api => ApiClientRef(context.read<AuthState>().api);

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final r = await _api.c.get('/api/mobile/deals/${widget.dealId}') as Map<String, dynamic>;
      if (mounted) setState(() => _d = r);
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    }
    // Клиент, дубли, прошлые сделки, воронки — API v1 (необязательно: без них карточка работает).
    try {
      final x = await v1(_api.c, (c) => c.crmDealExtras(dealId: widget.dealId));
      if (mounted) setState(() => _x = x);
    } on ApiException {
      // нет прав или сеть — меню «Ещё» покажет только доступное
    }
  }

  v1api.DealExtras? _x;

  Future<void> _done(Future<v1api.Done> Function(v1api.MybookApi) call) async {
    try {
      final r = await v1(_api.c, call);
      HapticFeedback.lightImpact();
      _toast(r.message);
      await _load();
    } on ApiException catch (e) {
      _toast(e.message);
    }
  }

  /// «Ещё»: клиент (открыть, привязать найденного, завести, отвязать), другая воронка, удалить.
  Future<void> _more() async {
    final x = _x;
    if (x == null) return;
    final pick = await showAppSheet<String>(context, title: 'Сделка', builder: (sheet) {
      return ListView(shrinkWrap: true, padding: const EdgeInsets.fromLTRB(16, 4, 16, 24), children: [
        GroupCard(padding: EdgeInsets.zero, children: [
          if (x.clientId != null) GroupTile(title: 'Открыть клиента', icon: LucideIcons.user, onTap: () => Navigator.pop(sheet, 'client')),
          if (x.clientId == null && x.suggested != null && x.canLink) GroupTile(title: 'Привязать к клиенту', subtitle: '${x.suggested!.name} — тот же телефон', icon: LucideIcons.link, onTap: () => Navigator.pop(sheet, 'link')),
          if (x.canCreateClient) GroupTile(title: 'Завести клиента', subtitle: 'аккаунт на сайте по телефону сделки', icon: LucideIcons.userPlus, onTap: () => Navigator.pop(sheet, 'create')),
          if (x.clientId != null && x.canLink) GroupTile(title: 'Отвязать от клиента', icon: LucideIcons.unlink, onTap: () => Navigator.pop(sheet, 'unlink')),
          if (x.canMovePipeline) GroupTile(title: 'Перенести в другую воронку', icon: LucideIcons.arrowRightLeft, onTap: () => Navigator.pop(sheet, 'pipeline')),
          if (x.canDelete) GroupTile(title: 'Удалить сделку', icon: LucideIcons.trash2, onTap: () => Navigator.pop(sheet, 'delete')),
        ]),
      ]);
    });
    if (!mounted || pick == null) return;
    switch (pick) {
      case 'client':
        await Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => ClientScreen(clientId: x.clientId!)));
      case 'link':
        await _done((c) => c.crmDealClientLink(dealId: widget.dealId, body: v1api.DealLinkBody(clientId: x.suggested!.id)));
      case 'unlink':
        if (await confirm(context, title: 'Отвязать сделку от клиента?', ok: 'Отвязать')) await _done((c) => c.crmDealClientLink(dealId: widget.dealId, body: const v1api.DealLinkBody(clientId: null)));
      case 'pipeline':
        final v = await pickChoice(context, title: 'Воронка', options: [for (final p in x.pipelines) (p.id, p.label)], current: x.pipelineId);
        if (v != null && v.isNotEmpty && v != x.pipelineId) await _done((c) => c.crmDealPipeline(dealId: widget.dealId, body: v1api.DealPipelineBody(pipelineId: v)));
      case 'delete':
        if (!await confirm(context, title: 'Удалить сделку?', message: 'Сделку с деньгами или счётом удалить нельзя.', ok: 'Удалить', destructive: true)) return;
        try {
          final r = await v1(_api.c, (c) => c.crmDealDelete(dealId: widget.dealId));
          _toast(r.message);
          if (mounted) Navigator.of(context).pop(true);
        } on ApiException catch (e) {
          _toast(e.message);
        }
      case 'create':
        await _createClient(x);
    }
  }

  Future<void> _createClient(v1api.DealExtras x) async {
    final name = TextEditingController(text: (_d?['contactName'] as String?) ?? '');
    final email = TextEditingController();
    String? channel;
    final ok = await showAppSheet<bool>(context, title: 'Завести клиента', builder: (sheet) {
      return StatefulBuilder(builder: (context, set) {
        return ListView(shrinkWrap: true, padding: const EdgeInsets.fromLTRB(16, 4, 16, 24), children: [
          LabeledField(label: 'Имя', controller: name, autocorrect: false, capitalization: TextCapitalization.words),
          LabeledField(label: 'Почта', controller: email, keyboard: TextInputType.emailAddress, hint: 'если есть', autocorrect: false),
          GroupCard(padding: const EdgeInsets.only(bottom: 14), children: [
            ChoiceRow(
              label: 'Откуда пришёл',
              icon: LucideIcons.signpost,
              value: x.channels.where((c) => c.id == channel).map((c) => c.label).firstOrNull ?? 'выбрать',
              onTap: () async {
                final v = await pickChoice(context, title: 'Канал продаж', options: [for (final c in x.channels) (c.id, c.label)], current: channel);
                if (v != null && v.isNotEmpty) set(() => channel = v);
              },
            ),
          ]),
          PrimaryButton(label: 'Завести клиента', icon: LucideIcons.userPlus, onPressed: () => Navigator.pop(sheet, true)),
        ]);
      });
    });
    if (ok != true || !mounted) return;
    if (channel == null) return _toast('Укажите, откуда пришёл клиент');
    try {
      final r = await v1(_api.c, (c) => c.crmDealClientCreate(dealId: widget.dealId, body: v1api.DealClientBody(name: name.text.trim(), email: email.text.trim(), locale: 'ru', channel: channel!)));
      await _load();
      if (!mounted) return;
      await showAppSheet<void>(context, title: 'Клиент заведён', builder: (sheet) {
        return ListView(shrinkWrap: true, padding: const EdgeInsets.fromLTRB(16, 4, 16, 24), children: [
          GroupCard(padding: const EdgeInsets.fromLTRB(16, 12, 16, 12), children: [
            Text('Логин: ${r.login}', style: AppText.body(context)),
            const SizedBox(height: 4),
            SelectableText('Пароль: ${r.password}', style: AppText.body(context).copyWith(fontWeight: FontWeight.w700)),
            const SizedBox(height: 6),
            Text('Пароль показывается один раз — отправьте его клиенту сейчас.', style: AppText.caption(context).copyWith(color: context.c.warn)),
          ]),
          const SizedBox(height: 12),
          PrimaryButton(label: 'Отправить доступ клиенту', icon: LucideIcons.send, onPressed: () => SharePlus.instance.share(ShareParams(text: r.message, sharePositionOrigin: const Rect.fromLTWH(0, 0, 1, 1)))),
        ]);
      });
    } on ApiException catch (e) {
      _toast(e.message);
    }
  }

  void _toast(String? text) {
    if (text != null && mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(text)));
  }

  Future<void> _move(Stage stage) async {
    String? reason;
    if (stage.kind == 'lost') {
      reason = await promptText(context, title: 'Причина отказа', hint: 'Например: дорого', ok: 'Перенести');
      if (reason == null) return;
    }
    try {
      await _api.c.post('/api/mobile/deals/${widget.dealId}/move', body: {'stageId': stage.id, 'lostReason': ?reason});
      HapticFeedback.mediumImpact();
      await _load();
    } on ApiException catch (e) {
      _toast(e.message);
    }
  }

  /// Передать сделку коллеге (или снять ответственного): список сотрудников — с сервера, права проверяет он же.
  Future<void> _assign() async {
    final api = context.read<AuthState>().api;
    List<Map<String, dynamic>> people;
    try {
      people = ((await api.get('/api/mobile/staff') as Map<String, dynamic>)['staff'] as List).cast<Map<String, dynamic>>();
    } on ApiException catch (e) {
      return _toast(e.message);
    }
    if (!mounted) return;
    final picked = await showAppSheet<String>(
      context,
      title: 'Ответственный по сделке',
      icon: LucideIcons.userRoundPlus,
      builder: (sheet) => SingleChildScrollView(
        child: GroupCard(padding: const EdgeInsets.fromLTRB(16, 4, 16, 24), children: [
          for (final p in people) GroupTile(title: p['name'] as String, icon: LucideIcons.user, onTap: () => Navigator.pop(sheet, p['id'] as String)),
          GroupTile(title: 'Снять ответственного', icon: LucideIcons.userX, iconColor: sheet.c.textMuted, onTap: () => Navigator.pop(sheet, '')),
        ]),
      ),
    );
    if (picked == null) return;
    try {
      await api.post('/api/mobile/deals/${widget.dealId}/assign', body: {'userId': picked.isEmpty ? null : picked});
      _toast(picked.isEmpty ? 'Ответственный снят' : 'Сделка передана');
      _load();
    } on ApiException catch (e) {
      _toast(e.message);
    }
  }

  Future<void> _addNote() async {
    final text = await promptText(context, title: 'Заметка по сделке', lines: 4);
    if (text == null) return;
    try {
      await _api.c.post('/api/mobile/deals/${widget.dealId}/notes', body: {'text': text});
      await _load();
    } on ApiException catch (e) {
      _toast(e.message);
    }
  }

  Future<void> _addTask() async {
    final label = _d?['title'] as String?;
    if (await showTaskEditor(context, target: TaskTarget(dealId: widget.dealId), contextLabel: label)) await _load();
  }

  Future<void> _accept() async {
    try {
      await _api.c.post('/api/mobile/deals/${widget.dealId}/accept');
      HapticFeedback.mediumImpact();
      _toast('Заявка принята в работу');
      await _load();
    } on ApiException catch (e) {
      _toast(e.message);
    }
  }

  Future<void> _reject() async {
    final reason = await promptText(context, title: 'Почему отклоняете заявку?', hint: 'Например: спам, нет бюджета', ok: 'Отклонить');
    if (reason == null) return;
    try {
      final r = await _api.c.post('/api/mobile/deals/${widget.dealId}/reject', body: {'reason': reason, 'spam': false});
      _toast((r is Map && r['message'] is String) ? r['message'] as String : 'Заявка отклонена');
      await _load();
    } on ApiException catch (e) {
      _toast(e.message);
    }
  }

  Future<void> _toggleTask(TaskItem t) async {
    setState(() => t.done = !t.done);
    try {
      await _api.c.post('/api/mobile/tasks/${t.id}/toggle');
    } on ApiException catch (e) {
      setState(() => t.done = !t.done);
      _toast(e.message);
    }
  }

  Future<void> _invoiceAction(String id, String action) async {
    try {
      await _api.c.post('/api/mobile/invoices/$id', body: {'action': action});
      _toast(action == 'cancel' ? 'Счёт отменён' : 'Счёт отправлен ещё раз');
      await _load();
    } on ApiException catch (e) {
      _toast(e.message);
    }
  }

  @override
  Widget build(BuildContext context) {
    final d = _d;
    final c = context.c;
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
                Expanded(child: Text(d == null ? 'Сделка' : 'Сделка №${d['number']}', style: AppText.headline(context))),
                // Правка полей, своих полей, тарифа и подарков — экраном приложения (API v1).
                if (d != null && (d['perms'] as Map<String, dynamic>)['canEdit'] == true)
                  RoundIconButton(icon: LucideIcons.pencil, size: 44, iconSize: 20, color: c.text, tooltip: 'Изменить сделку', onTap: () async {
                    final saved = await Navigator.of(context).push<bool>(MaterialPageRoute(builder: (_) => DealEditScreen(dealId: widget.dealId)));
                    if (saved == true) _load();
                  }),
                // Клиент, другая воронка, удаление — API v1 (crmDealExtras и действия карточки сделки).
                if (_x != null) RoundIconButton(icon: LucideIcons.ellipsis, size: 44, iconSize: 22, color: c.text, tooltip: 'Ещё', onTap: _more),
              ]),
            ),
          ),
        ),
        Expanded(
          child: d == null
              ? (_error != null ? EmptyState(icon: LucideIcons.circleAlert, title: 'Не удалось открыть сделку', hint: _error, action: 'Повторить', onAction: _load) : const Center(child: CircularProgressIndicator()))
              : RefreshIndicator(onRefresh: _load, color: c.brand, child: _body(context, d)),
        ),
      ]),
    );
  }

  Widget _body(BuildContext context, Map<String, dynamic> d) {
    final c = context.c;
    final perms = d['perms'] as Map<String, dynamic>;
    final stages = [for (final s in (d['stages'] as List)) Stage.fromJson(s as Map<String, dynamic>)];
    final stage = d['stage'] as Map<String, dynamic>?;
    final tasks = [for (final t in (d['tasks'] as List)) TaskItem.fromJson(t as Map<String, dynamic>)];
    final notes = [for (final n in (d['notes'] as List)) NoteItem.fromJson(n as Map<String, dynamic>)];
    final payments = [for (final p in (d['payments'] as List)) PaymentItem.fromJson(p as Map<String, dynamic>)];
    final invoices = [for (final i in (d['invoices'] as List)) InvoiceBrief.fromJson(i as Map<String, dynamic>)];
    final order = d['order'] as Map<String, dynamic>?;
    final chatId = d['chatId'] as String?;
    final amount = ((d['amount'] as num?) ?? 0).toInt();
    final paid = ((d['paid'] as num?) ?? 0).toInt();
    final progress = amount > 0 ? (paid / amount).clamp(0.0, 1.0) : 0.0;
    final actions = <_ActionItem>[
      if (chatId != null && !widget.fromChat) _ActionItem(LucideIcons.messageCircle, 'Чат', () => Navigator.of(context).push(CupertinoPageRoute<void>(builder: (_) => ChatScreen(chatId: chatId, title: d['contactName'] as String?)))),
      if (perms['canInvoice'] == true && order == null)
        _ActionItem(LucideIcons.receipt, 'Счёт', () async {
          final api = context.read<AuthState>().api;
          final ok = await showInvoiceSheet(context, api: api, dealId: widget.dealId, conversationId: chatId);
          if (ok) _load();
        }),
      if (d['phone'] != null || (context.read<AuthState>().staff!.can('calls.make') && perms['canEdit'] == true))
        _ActionItem(LucideIcons.phone, 'Позвонить', () => ContactActions(context).call(phone: d['phone'] as String?, target: TaskTarget(dealId: widget.dealId))),
      if (perms['canEdit'] == true) _ActionItem(LucideIcons.listPlus, 'Задача', _addTask),
      if (perms['canEdit'] == true) _ActionItem(LucideIcons.stickyNote, 'Заметка', _addNote),
    ];
    return ListView(physics: const BouncingScrollPhysics(parent: AlwaysScrollableScrollPhysics()), padding: const EdgeInsets.only(top: 16, bottom: 40), children: [
      Padding(
        padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
        child: Container(
          padding: const EdgeInsets.all(18),
          decoration: BoxDecoration(color: c.surfaceRaised, borderRadius: BorderRadius.circular(Rd.lg), border: Border.all(color: c.border, width: 0.6)),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(d['title'] as String? ?? '', style: AppText.title(context)),
            const SizedBox(height: 4),
            Text([
              if ((d['contactName'] as String?)?.isNotEmpty == true) d['contactName'] as String,
              if (d['phone'] != null) d['phone'] as String,
              d['source'] as String? ?? '',
            ].where((e) => e.isNotEmpty).join(' · '), style: AppText.sub(context)),
            const SizedBox(height: 16),
            Row(crossAxisAlignment: CrossAxisAlignment.end, children: [
              Text(money(amount), style: TextStyle(fontSize: 30, fontWeight: FontWeight.w800, letterSpacing: -1, color: c.text)),
              const Spacer(),
              if (paid > 0) Text('внесено ${money(paid)}', style: TextStyle(fontSize: 14, fontWeight: FontWeight.w700, color: c.success)),
            ]),
            if (paid > 0 && amount > 0) Padding(padding: const EdgeInsets.only(top: 10), child: ClipRRect(borderRadius: BorderRadius.circular(4), child: LinearProgressIndicator(value: progress, minHeight: 6, backgroundColor: c.surface, valueColor: AlwaysStoppedAnimation(c.success)))),
            Padding(
              padding: const EdgeInsets.only(top: 14),
              child: GestureDetector(
                behavior: HitTestBehavior.opaque,
                onTap: perms['canEdit'] == true ? _assign : null,
                child: Row(children: [
                  Icon(LucideIcons.user, size: 15, color: c.textFaint),
                  const SizedBox(width: 6),
                  Text(d['assignee'] != null ? 'Ведёт: ${d['assignee']}' : 'Ответственного нет', style: AppText.caption(context).copyWith(fontSize: 13.5)),
                  if (perms['canEdit'] == true) ...[const SizedBox(width: 4), Icon(LucideIcons.chevronDown, size: 14, color: c.textFaint)],
                ]),
              ),
            ),
          ]),
        ),
      ),
      if (d['unsorted'] == true)
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
          child: Container(
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(color: c.warnBg, borderRadius: BorderRadius.circular(Rd.md)),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Row(children: [Icon(LucideIcons.inbox, size: 18, color: c.warn), const SizedBox(width: 10), Expanded(child: Text('Новая заявка — ещё ничья', style: TextStyle(color: c.warn, fontWeight: FontWeight.w700, fontSize: 15.5)))]),
              if (context.read<AuthState>().staff!.can('deals.edit')) ...[
                const SizedBox(height: 12),
                Row(children: [
                  Expanded(child: PrimaryButton(label: 'Принять', icon: LucideIcons.check, onPressed: _accept)),
                  const SizedBox(width: 10),
                  Expanded(child: SizedBox(height: 52, child: OutlinedButton(onPressed: _reject, style: OutlinedButton.styleFrom(foregroundColor: c.danger, side: BorderSide(color: c.danger.withValues(alpha: 0.5)), shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14))), child: const Text('Отклонить', style: TextStyle(fontSize: 16.5, fontWeight: FontWeight.w600))))),
                ]),
              ],
            ]),
          ),
        ),
      if (actions.isNotEmpty)
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
          child: Row(children: [
            for (var i = 0; i < actions.length; i++) ...[
              if (i > 0) const SizedBox(width: 10),
              Expanded(child: _ActionTile(item: actions[i])),
            ],
          ]),
        ),
      Padding(padding: const EdgeInsets.fromLTRB(22, 0, 22, 8), child: Text('ЭТАП', style: AppText.label(context))),
      SizedBox(
        height: 38,
        child: ListView(scrollDirection: Axis.horizontal, padding: const EdgeInsets.symmetric(horizontal: 16), children: [
          for (final s in stages)
            Padding(
              padding: const EdgeInsets.only(right: 8),
              child: Opacity(
                opacity: perms['canMove'] == true || stage?['id'] == s.id ? 1 : 0.5,
                child: FilterPill(label: s.name, dot: hexColor(s.color), selected: stage?['id'] == s.id, onTap: () {
                  if (perms['canMove'] == true && stage?['id'] != s.id) _move(s);
                }),
              ),
            ),
        ]),
      ),
      const SizedBox(height: 20),
      if (order != null)
        GroupCard(title: 'Заказ', children: [
          GroupTile(
            icon: LucideIcons.package,
            title: 'Заказ №${order['number']}',
            subtitle: '${_orderStatusLabels[order['status']] ?? order['status']} · ${money(order['amount'] as num)}',
            onTap: order['id'] is String ? () => Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => OrderScreen(orderId: order['id'] as String, number: (order['number'] as num).toInt()))) : null,
          ),
        ]),
      if (invoices.isNotEmpty)
        GroupCard(title: 'Счета', children: [
          for (final i in invoices)
            GroupTile(
              icon: i.paidLabel != null ? LucideIcons.circleCheck : LucideIcons.receipt,
              iconColor: i.paidLabel != null ? c.success : (i.overdue ? c.danger : c.warn),
              title: '${i.label} · ${money(i.amount)}',
              subtitle: i.paidLabel != null ? 'оплачен ${i.paidLabel}' : (i.status == 'pending_payment' ? (i.overdue ? 'срок вышел ${i.expiresLabel}' : 'ждёт оплаты до ${i.expiresLabel}') : i.status),
              trailing: i.payable && perms['canEdit'] == true ? _InvoiceMenu(onSelected: (v) => _invoiceAction(i.id, v)) : const SizedBox.shrink(),
            ),
        ]),
      GroupCard(title: 'Задачи', children: [
        if (tasks.isEmpty) GroupTile(icon: LucideIcons.circleAlert, iconColor: c.warn, title: 'Нет следующего шага', subtitle: 'Запланируйте задачу, чтобы сделка не потерялась'),
        for (final t in tasks) _TaskRow(task: t, onToggle: () => _toggleTask(t)),
      ]),
      if (payments.isNotEmpty || perms['canEdit'] == true)
        GroupCard(title: 'Платежи', children: [
          for (final p in payments)
            GroupTile(
              icon: p.kind == 'refund' ? LucideIcons.undo2 : LucideIcons.banknote,
              iconColor: p.kind == 'refund' ? c.danger : c.success,
              title: '${p.kind == 'refund' ? '−' : ''}${money(p.amount)}',
              subtitle: [p.methodLabel, if (p.payForm != null) p.payForm!, '${two(p.at.day)}.${two(p.at.month)}.${p.at.year}'].join(' · '),
            ),
          if (perms['canEdit'] == true)
            GroupTile(
              icon: d['hasOrder'] == true ? LucideIcons.undo2 : LucideIcons.plus,
              iconColor: c.brand,
              title: d['hasOrder'] == true ? 'Оформить возврат лишнего' : 'Принять оплату',
              subtitle: 'с чеком и формой оплаты',
              onTap: () async {
                final ok = await showPaymentSheet(
                  context,
                  api: context.read<AuthState>().api,
                  dealId: widget.dealId,
                  suggested: amount - paid,
                  payForms: [for (final f in (d['payForms'] as List? ?? const [])) '$f'],
                  refundOnly: d['hasOrder'] == true,
                  invoices: invoices,
                  paymentIds: [for (final p in payments) p.id],
                );
                if (ok) {
                  _toast('Платёж записан');
                  _load();
                }
              },
            ),
        ]),
      if (_x != null && _x!.duplicates.isNotEmpty)
        GroupCard(title: 'Дубли контакта', children: [
          for (final dup in _x!.duplicates)
            GroupTile(
              title: 'Д${dup.number} · ${dup.title}',
              subtitle: '${dup.stage} · ${money(dup.amount)} · ${dup.dateLabel}',
              icon: LucideIcons.copy,
              trailing: _x!.canMerge
                  ? TextButton(
                      onPressed: () async {
                        if (await confirm(context, title: 'Слить Д${dup.number} в эту сделку?', message: 'Заметки, задачи, платежи и переписка перейдут сюда; открытые счета дубля могут отмениться.', ok: 'Слить')) {
                          await _done((c) => c.crmDealMerge(dealId: widget.dealId, body: v1api.DealMergeBody(sourceId: dup.id)));
                        }
                      },
                      child: const Text('Слить'),
                    )
                  : null,
              onTap: () => Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => DealScreen(dealId: dup.id))),
            ),
        ]),
      if (_x != null && _x!.past.isNotEmpty)
        GroupCard(title: 'Прошлые сделки контакта', children: [
          for (final p in _x!.past)
            GroupTile(
              title: 'Д${p.number} · ${p.title}',
              subtitle: '${p.stage} · ${money(p.amount)} · ${p.dateLabel}',
              icon: LucideIcons.history,
              onTap: () => Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => DealScreen(dealId: p.id))),
            ),
        ]),
      if (notes.isNotEmpty)
        GroupCard(title: 'Заметки', children: [
          for (final n in notes) Padding(padding: const EdgeInsets.all(14), child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [Text(n.text, style: AppText.body(context)), const SizedBox(height: 4), Text('${n.author ?? ''} · ${two(n.at.day)}.${two(n.at.month)} ${hhmm(n.at)}', style: AppText.caption(context))])),
        ]),
    ]);
  }
}

/// Обёртка, чтобы не тянуть клиент через виджет-дерево в каждый метод.
class ApiClientRef {
  ApiClientRef(this.c);
  final dynamic c;
}

class _ActionItem {
  _ActionItem(this.icon, this.label, this.onTap);
  final IconData icon;
  final String label;
  final VoidCallback onTap;
}

class _ActionTile extends StatelessWidget {
  const _ActionTile({required this.item});
  final _ActionItem item;

  @override
  Widget build(BuildContext context) {
    final c = context.c;
    return Material(
      color: c.surfaceRaised,
      borderRadius: BorderRadius.circular(Rd.lg),
      child: InkWell(
        borderRadius: BorderRadius.circular(Rd.lg),
        onTap: item.onTap,
        child: Container(
          padding: const EdgeInsets.symmetric(vertical: 14),
          decoration: BoxDecoration(borderRadius: BorderRadius.circular(Rd.lg), border: Border.all(color: c.border, width: 0.6)),
          child: Column(children: [
            Icon(item.icon, size: 23, color: c.brandDeep),
            const SizedBox(height: 6),
            Text(item.label, style: TextStyle(fontSize: 12.5, fontWeight: FontWeight.w600, color: c.text)),
          ]),
        ),
      ),
    );
  }
}

class _TaskRow extends StatelessWidget {
  const _TaskRow({required this.task, required this.onToggle});
  final TaskItem task;
  final VoidCallback onToggle;

  @override
  Widget build(BuildContext context) {
    final c = context.c;
    final overdue = !task.done && task.dueAt != null && task.dueAt!.isBefore(DateTime.now());
    return InkWell(
      onTap: onToggle,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
        child: Row(children: [
          AnimatedContainer(
            duration: const Duration(milliseconds: 150),
            width: 24,
            height: 24,
            decoration: BoxDecoration(shape: BoxShape.circle, color: task.done ? c.brand : Colors.transparent, border: Border.all(color: task.done ? c.brand : c.textFaint, width: 1.6)),
            child: task.done ? Icon(LucideIcons.check, size: 15, color: c.onBrand) : null,
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(task.title, style: TextStyle(fontSize: 16.5, fontWeight: FontWeight.w500, color: task.done ? c.textFaint : c.text, decoration: task.done ? TextDecoration.lineThrough : null)),
              if (task.dueAt != null) Padding(padding: const EdgeInsets.only(top: 2), child: Text('до ${two(task.dueAt!.day)}.${two(task.dueAt!.month)} ${hhmm(task.dueAt!)}', style: TextStyle(fontSize: 13.5, color: overdue ? c.danger : c.textMuted, fontWeight: overdue ? FontWeight.w600 : FontWeight.w400))),
            ]),
          ),
        ]),
      ),
    );
  }
}

class _InvoiceMenu extends StatelessWidget {
  const _InvoiceMenu({required this.onSelected});
  final ValueChanged<String> onSelected;

  @override
  Widget build(BuildContext context) => PopupMenuButton<String>(
        icon: Icon(LucideIcons.ellipsis, size: 22, color: context.c.textMuted),
        onSelected: onSelected,
        itemBuilder: (_) => const [PopupMenuItem(value: 'resend', child: Text('Отправить ещё раз')), PopupMenuItem(value: 'cancel', child: Text('Отменить счёт'))],
      );
}
