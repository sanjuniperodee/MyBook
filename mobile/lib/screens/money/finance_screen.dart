import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:provider/provider.dart';

import '../../api/mybook_api.g.dart' as v1api;
import '../../core/api.dart';
import '../../core/auth.dart';
import '../../core/format.dart';
import '../../core/links.dart';
import '../../core/v1.dart';
import '../../ui/kit.dart';
import '../../ui/tokens.dart';
import 'money_widgets.dart';

/// «Финансы» как на сайте (API v1 crmFinance): сверху то, что требует действия — «Проверить» (ручные оплаты и возвраты
/// сверить с выпиской и отметить «Проверено») и «Нужно вернуть или зачесть» (оформить возврат в сделке или заказе либо
/// отметить решённым с комментарием); затем пришло за период, способы и менеджеры, последние поступления, кто должен.
class FinanceScreen extends StatefulWidget {
  const FinanceScreen({super.key});

  @override
  State<FinanceScreen> createState() => _FinanceScreenState();
}

class _FinanceScreenState extends State<FinanceScreen> {
  v1api.Finance? _f;
  String? _error;
  bool _loading = false;
  MoneyPeriodQuery _q = const MoneyPeriodQuery();
  final _busy = <String>{};

  ApiClient get _api => context.read<AuthState>().api;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final f = await v1(_api, (c) => c.crmFinance(p: _q.preset, from: _q.from, to: _q.to));
      if (mounted) setState(() => _f = f);
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  void _toast(String text) => ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(text)));

  Future<void> _act(String key, Future<v1api.Done> Function(v1api.MybookApi) call) async {
    if (_busy.contains(key)) return;
    setState(() => _busy.add(key));
    try {
      final r = await v1(_api, call);
      HapticFeedback.lightImpact();
      _toast(r.message ?? 'Готово');
      await _load();
    } on ApiException catch (e) {
      _toast(e.message);
    } finally {
      if (mounted) setState(() => _busy.remove(key));
    }
  }

  Future<void> _resolve(v1api.FinanceIssue i) async {
    final note = await promptText(context, title: 'Как решили?', hint: 'Вернули часть, зачли в заказ №…, договорились с клиентом', ok: 'Отметить решённым', lines: 3);
    if (note == null || note.trim().length < 3) {
      if (note != null) _toast('Напишите, как решили: от 3 символов');
      return;
    }
    await _act(i.key, (c) => c.crmFinanceResolve(body: v1api.FinanceResolveBody(key: i.key, amount: i.amount, note: note.trim())));
  }

  @override
  Widget build(BuildContext context) {
    final f = _f;
    return MoneyPage(
      title: 'Финансы',
      period: f?.period,
      onPeriod: (q) {
        _q = q;
        _load();
      },
      onRefresh: _load,
      loading: _loading,
      error: _error,
      children: f == null ? const [] : _content(context, f),
    );
  }

  List<Widget> _content(BuildContext context, v1api.Finance f) {
    final c = context.c;
    final t = f.totals;
    final (dNote, dColor) = deltaNote(context, t.delta);
    final canResolve = (v1api.FinanceIssue i) => i.target?.kind == 'order' || i.key.startsWith('o') ? f.perms.resolveOrder : f.perms.resolveDeal;
    return [
      if (f.own) Padding(padding: const EdgeInsets.only(bottom: 10, left: 4), child: Text('Только ваши сделки и заказы', style: AppText.caption(context))),
      StatGrid(tiles: [
        StatTile(label: 'Пришло за период', value: signedMoney(t.net), note: dNote ?? '${t.count} поступл.', noteColor: dColor),
        StatTile(label: 'Ожидается', value: money(t.expected), note: t.expectedReady > 0 ? '${money(t.expectedReady)} — книга готова' : null),
        StatTile(label: 'Проверить', value: '${t.reviewCount}', note: t.reviewCount > 0 ? money(t.reviewSum) : 'всё сверено', valueColor: t.reviewCount > 0 ? c.warn : null),
        StatTile(label: 'Вернуть или зачесть', value: money(t.overpaid), note: '${t.overpaidCount} случ.', valueColor: t.overpaidCount > 0 ? c.danger : null),
      ]),

      // ─── Проверить ───
      MoneySection(title: 'Проверить', hint: 'ручные оплаты и возвраты: сверьте чек с выпиской', trailing: t.reviewCount > 0 ? CountBadge(t.reviewCount) : null),
      if (f.review.isEmpty)
        const MoneyEmpty('Все ручные оплаты сверены')
      else
        GroupCard(padding: EdgeInsets.zero, children: [
          for (final r in f.review) _reviewTile(context, f, r),
        ]),

      // ─── Вернуть или зачесть ───
      MoneySection(title: 'Нужно вернуть или зачесть', hint: 'переплаты, отменённые заказы, оплаты Kaspi вне учёта'),
      if (f.issues.isEmpty)
        const MoneyEmpty('Переплат и денег к возврату нет')
      else
        GroupCard(padding: EdgeInsets.zero, children: [
          for (final i in f.issues)
            _MoneyTile(
              title: i.title,
              amount: money(i.amount),
              amountColor: c.danger,
              lines: [
                [i.ref, i.client, i.manager].where((s) => s.isNotEmpty && s != '—').join(' · '),
                i.note,
                if (i.dateLabel != null) i.dateLabel!,
              ],
              actions: [
                if (i.href != null) _ActionChip(label: i.target == null ? 'Открыть' : 'Оформить возврат', icon: LucideIcons.undo2, onTap: () async {
                  await openAdminLink(context, i.href!, title: i.ref);
                  _load();
                }),
                if (canResolve(i)) _ActionChip(label: 'Отметить решённым', icon: LucideIcons.check, busy: _busy.contains(i.key), onTap: () => _resolve(i)),
              ],
            ),
        ]),
      if (f.resolved.isNotEmpty) ...[
        MoneySection(title: 'Решённые за последние дни'),
        GroupCard(padding: EdgeInsets.zero, children: [
          for (final r in f.resolved)
            _MoneyTile(
              title: r.title,
              amount: money(r.amount),
              lines: ['${r.ref} · ${r.client}', '«${r.note}» — ${r.by}, ${r.dateLabel}'],
              actions: [
                if (r.stillOpen && (f.perms.resolveDeal || f.perms.resolveOrder))
                  _ActionChip(label: 'Отменить решение', icon: LucideIcons.rotateCcw, busy: _busy.contains(r.id), onTap: () async {
                    if (await confirm(context, title: 'Отменить решение?', message: 'Случай вернётся в очередь «вернуть или зачесть».', ok: 'Отменить решение')) {
                      await _act(r.id, (c) => c.crmFinanceUndo(resolutionId: r.id));
                    }
                  }),
              ],
            ),
        ]),
      ],

      // ─── Пришло ───
      if (f.flow != null) ...[
        MoneySection(title: 'Деньги периода', hint: 'пришло − возвраты − комиссии − налог = на счёт'),
        MoneyFlowCard(flow: f.flow!),
      ],
      MoneySection(title: 'Пришло', hint: '${money(t.incoming)} поступило · ${money(t.online)} онлайн · ${money(t.manual)} вручную${t.refunds > 0 ? ' · возвраты ${money(t.refunds)}' : ''}'),
      _DayBars(days: f.byDay),
      if (f.byMethod.isNotEmpty) ...[const SizedBox(height: 10), BarList(bars: f.byMethod)],
      if (f.byManager.length > 1) ...[MoneySection(title: 'По менеджерам'), BarList(bars: f.byManager)],

      MoneySection(title: 'Последние поступления', hint: f.recent.length >= 50 ? 'последние 50' : null),
      if (f.recent.isEmpty)
        const MoneyEmpty('За период поступлений нет')
      else
        GroupCard(padding: EdgeInsets.zero, children: [for (final m in f.recent) _moneyTile(context, m)]),
      if (f.refunds.isNotEmpty) ...[
        MoneySection(title: 'Возвраты'),
        GroupCard(padding: EdgeInsets.zero, children: [for (final m in f.refunds) _moneyTile(context, m)]),
      ],

      // ─── Кто должен ───
      MoneySection(title: 'Кто должен', hint: 'остатки договорённостей, заказы на оплате и постоплаты · всего ${money(f.expected.total)}'),
      if (f.expected.groups.any((g) => g.value > 0)) ...[BarList(bars: f.expected.groups.where((g) => g.value > 0).toList()), const SizedBox(height: 10)],
      if (f.expected.rows.isEmpty)
        const MoneyEmpty('Долгов нет')
      else
        GroupCard(padding: EdgeInsets.zero, children: [
          for (final e in f.expected.rows)
            _MoneyTile(
              title: '${e.ref} · ${e.client}',
              amount: money(e.left),
              amountColor: e.overdue ? c.danger : null,
              lines: [
                'из ${money(e.total)}, оплачено ${money(e.paid)} · ${e.manager}',
                [e.bookLabel, if (e.dueLabel != null) e.dueLabel!].join(' · '),
                if (e.invoice != null) e.invoice!,
                if (e.note != null) e.note!,
              ],
              onTap: () => openAdminLink(context, e.href, title: e.ref),
            ),
        ]),
    ];
  }

  Widget _reviewTile(BuildContext context, v1api.Finance f, v1api.FinanceReviewRow r) {
    final c = context.c;
    final can = r.kind == 'deal' ? f.perms.reviewDeal : f.perms.reviewOrder;
    return _MoneyTile(
      title: '${r.what} · ${r.client}',
      amount: r.refund ? '−${money(r.amount)}' : money(r.amount),
      amountColor: r.refund ? c.danger : null,
      lines: [
        [r.dateLabel, ...r.refs.map((x) => x.label), 'принял ${r.acceptedBy}'].join(' · '),
        if (r.invoice != null) r.invoice!,
        if (r.note != null && r.note!.isNotEmpty) r.note!,
      ],
      onTap: r.refs.isEmpty ? null : () => openAdminLink(context, r.refs.first.href, title: r.refs.first.label),
      actions: [
        if (r.receiptUrl != null) _ActionChip(label: 'Чек', icon: LucideIcons.receipt, onTap: () => openFile(context, r.receiptUrl!, title: 'Чек')),
        if (can && !r.mine)
          _ActionChip(label: 'Проверено', icon: LucideIcons.check, primary: true, busy: _busy.contains(r.key), onTap: () => _act(r.key, (c) => c.crmFinanceReview(body: v1api.FinanceReviewBody(kind: r.kind, id: r.id))))
        else if (r.mine)
          Padding(padding: const EdgeInsets.only(top: 6), child: Text('ваша запись — проверяет другой сотрудник', style: AppText.caption(context))),
      ],
    );
  }

  Widget _moneyTile(BuildContext context, v1api.FinanceMoneyRow m) {
    final c = context.c;
    return _MoneyTile(
      title: '${m.what} · ${m.client}',
      amount: signedMoney(m.amount),
      amountColor: m.refund ? c.danger : null,
      lines: [
        [m.dateLabel, m.method, ...m.refs.map((x) => x.label)].join(' · '),
        'менеджер ${m.manager} · принял ${m.acceptedBy}${m.check == 'pending' ? ' · не проверено' : m.check == 'reviewed' ? ' · проверено' : ''}',
      ],
      onTap: m.refs.isEmpty ? null : () => openAdminLink(context, m.refs.last.href, title: m.refs.last.label),
      actions: [if (m.receiptUrl != null) _ActionChip(label: 'Чек', icon: LucideIcons.receipt, onTap: () => openFile(context, m.receiptUrl!, title: 'Чек'))],
    );
  }
}

/// Строка денег: заголовок и сумма справа, строки пояснений, кнопки действий.
class _MoneyTile extends StatelessWidget {
  const _MoneyTile({required this.title, required this.amount, this.amountColor, this.lines = const [], this.actions = const [], this.onTap});
  final String title;
  final String amount;
  final Color? amountColor;
  final List<String> lines;
  final List<Widget> actions;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final c = context.c;
    return InkWell(
      onTap: onTap,
      child: Container(
        decoration: BoxDecoration(border: Border(bottom: BorderSide(color: c.border.withValues(alpha: 0.6), width: 0.5))),
        padding: const EdgeInsets.fromLTRB(16, 12, 16, 12),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Expanded(child: Text(title, style: TextStyle(fontSize: 15, fontWeight: FontWeight.w600, color: c.text))),
            const SizedBox(width: 10),
            Text(amount, style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700, color: amountColor ?? c.text, fontFeatures: const [FontFeature.tabularFigures()])),
          ]),
          for (final l in lines.where((l) => l.isNotEmpty)) Padding(padding: const EdgeInsets.only(top: 3), child: Text(l, style: AppText.caption(context))),
          if (actions.isNotEmpty) Padding(padding: const EdgeInsets.only(top: 8), child: Wrap(spacing: 8, runSpacing: 6, children: actions)),
        ]),
      ),
    );
  }
}

class _ActionChip extends StatelessWidget {
  const _ActionChip({required this.label, required this.icon, required this.onTap, this.primary = false, this.busy = false});
  final String label;
  final IconData icon;
  final VoidCallback onTap;
  final bool primary;
  final bool busy;

  @override
  Widget build(BuildContext context) {
    final c = context.c;
    return Material(
      color: primary ? c.brand : c.bg,
      borderRadius: BorderRadius.circular(18),
      child: InkWell(
        borderRadius: BorderRadius.circular(18),
        onTap: busy ? null : onTap,
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 7),
          child: Row(mainAxisSize: MainAxisSize.min, children: [
            busy ? SizedBox(width: 14, height: 14, child: CircularProgressIndicator(strokeWidth: 2, color: primary ? c.onBrand : c.brand)) : Icon(icon, size: 15, color: primary ? c.onBrand : c.brand),
            const SizedBox(width: 6),
            Text(label, style: TextStyle(fontSize: 13.5, fontWeight: FontWeight.w600, color: primary ? c.onBrand : c.brand)),
          ]),
        ),
      ),
    );
  }
}

/// Пришло по дням — столбики (возвраты — красной частью).
class _DayBars extends StatelessWidget {
  const _DayBars({required this.days});
  final List<v1api.FinanceByDay> days;

  @override
  Widget build(BuildContext context) {
    final c = context.c;
    final maxV = days.fold<int>(1, (m, d) => d.incoming > m ? d.incoming : m);
    return Container(
      height: 120,
      padding: const EdgeInsets.fromLTRB(12, 14, 12, 10),
      decoration: BoxDecoration(color: c.surface, borderRadius: BorderRadius.circular(Rd.lg)),
      child: Column(children: [
        Expanded(
          child: Row(crossAxisAlignment: CrossAxisAlignment.end, children: [
            for (final d in days)
              Expanded(
                child: Tooltip(
                  message: '${d.date.substring(8)}.${d.date.substring(5, 7)}: ${money(d.incoming)}${d.refunds > 0 ? ', возвраты ${money(d.refunds)}' : ''}',
                  child: Padding(
                    padding: EdgeInsets.symmetric(horizontal: days.length > 40 ? 0.5 : 1.5),
                    child: Column(mainAxisAlignment: MainAxisAlignment.end, children: [
                      Container(height: (d.incoming / maxV * 80).clamp(2, 80).toDouble(), decoration: BoxDecoration(color: d.incoming > 0 ? c.brand : c.border, borderRadius: BorderRadius.circular(2))),
                      if (d.refunds > 0) Container(height: (d.refunds / maxV * 80).clamp(2, 40).toDouble(), color: c.danger),
                    ]),
                  ),
                ),
              ),
          ]),
        ),
        const SizedBox(height: 6),
        if (days.isNotEmpty)
          Row(children: [
            Text('${days.first.date.substring(8)}.${days.first.date.substring(5, 7)}', style: AppText.caption(context)),
            const Spacer(),
            Text('${days.last.date.substring(8)}.${days.last.date.substring(5, 7)}', style: AppText.caption(context)),
          ]),
      ]),
    );
  }
}
