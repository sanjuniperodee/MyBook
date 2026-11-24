import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../api/mybook_api.g.dart' as v1api;
import '../../core/api.dart';
import '../../core/auth.dart';
import '../../core/format.dart';
import '../../core/v1.dart';
import '../../ui/kit.dart';
import '../../ui/tokens.dart';
import 'money_widgets.dart';

/// «Статистика лидов» (API v1 crmLeadStats): заявки периода — сколько пришло, оплатили и где остальные; по дням с рекламой,
/// этапы, отказы, разрезы по источникам, менеджерам, получателю, поводу, сроку до события, дню недели и времени суток.
/// Фильтр — один менеджер.
class LeadStatsScreen extends StatefulWidget {
  const LeadStatsScreen({super.key});

  @override
  State<LeadStatsScreen> createState() => _LeadStatsScreenState();
}

class _LeadStatsScreenState extends State<LeadStatsScreen> {
  v1api.LeadStats? _s;
  String? _error;
  bool _loading = false;
  MoneyPeriodQuery _q = const MoneyPeriodQuery();
  String? _manager;

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
      final s = await v1(_api, (c) => c.crmLeadStats(p: _q.preset, from: _q.from, to: _q.to, m: _manager));
      if (mounted) setState(() => _s = s);
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final s = _s;
    return MoneyPage(
      title: 'Статистика лидов',
      period: s?.period,
      onPeriod: (q) {
        _q = q;
        _load();
      },
      onRefresh: _load,
      loading: _loading,
      error: _error,
      children: s == null ? const [] : _content(context, s),
    );
  }

  static String _hours(num? h) => h == null ? '—' : h < 1 ? '${(h * 60).round().clamp(1, 59)} мин' : h < 48 ? '${h.round()} ч' : '${(h / 24).round()} дн';

  List<Widget> _content(BuildContext context, v1api.LeadStats s) {
    final c = context.c;
    final t = s.totals;
    final (lNote, lColor) = deltaNote(context, t.deltaLeads);
    final (pNote, pColor) = deltaNote(context, t.deltaPaid);
    return [
      if (s.managers.length > 1)
        Padding(
          padding: const EdgeInsets.only(bottom: 12),
          child: SizedBox(
            height: 36,
            child: ListView(scrollDirection: Axis.horizontal, children: [
              Padding(
                padding: const EdgeInsets.only(right: 8),
                child: FilterPill(label: 'Все менеджеры', selected: s.managerId == null, onTap: () {
                  _manager = null;
                  _load();
                }),
              ),
              for (final m in s.managers)
                Padding(
                  padding: const EdgeInsets.only(right: 8),
                  child: FilterPill(label: m.label, selected: s.managerId == m.id, onTap: () {
                    _manager = m.id;
                    _load();
                  }),
                ),
            ]),
          ),
        ),
      StatGrid(tiles: [
        StatTile(label: 'Заявок', value: '${t.leads}', note: lNote ?? (t.junk > 0 ? 'ещё ${t.junk} — спам и дубли' : null), noteColor: lColor),
        StatTile(label: 'Оплатили', value: '${t.paid}', note: 'конверсия ${pct(t.conversion, 1)}'),
        StatTile(label: 'Оплат за период', value: '${t.payments}', note: pNote ?? money(t.paymentsFirst), noteColor: pColor),
        StatTile(label: 'Средний чек', value: t.avgCheck == null ? '—' : money(t.avgCheck!), note: 'до оплаты ${_hours(t.medianHours)}'),
        StatTile(label: 'В работе', value: '${t.open}', note: 'в отказе ${t.lost}'),
        StatTile(label: 'Повторных', value: '${t.repeat}', note: 'счетов ${t.invoices}'),
        if (s.showSpend && t.spend > 0) ...[
          StatTile(label: 'Реклама', value: money(t.spend), note: 'заявка ${t.cpl == null ? '—' : money(t.cpl!)}, покупатель ${t.cac == null ? '—' : money(t.cac!)}'),
          StatTile(label: 'Окупаемость', value: pct(t.roas), note: 'от договоров ${pct(t.roasAgreed)} · ДРР ${pct(t.adShare, 1)}'),
        ],
      ]),
      MoneySection(title: 'По дням', hint: 'заявки, оплаты${s.showSpend ? ' и реклама' : ''}'),
      Container(
        padding: const EdgeInsets.fromLTRB(16, 8, 16, 8),
        decoration: BoxDecoration(color: c.surface, borderRadius: BorderRadius.circular(Rd.lg)),
        child: Column(children: [
          Row(children: [
            const Expanded(child: SizedBox()),
            for (final h in ['Заявки', 'Оплаты', if (s.showSpend) 'Реклама']) SizedBox(width: 74, child: Text(h, textAlign: TextAlign.right, style: AppText.caption(context))),
          ]),
          for (final d in s.daily.reversed.where((d) => d.leads > 0 || d.payments > 0 || d.spend > 0))
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 5),
              child: Row(children: [
                Expanded(child: Text('${d.day.substring(8)}.${d.day.substring(5, 7)}', style: TextStyle(fontSize: 13.5, color: c.text))),
                SizedBox(width: 74, child: Text('${d.leads}${d.junk > 0 ? ' (−${d.junk})' : ''}', textAlign: TextAlign.right, style: TextStyle(fontSize: 13.5, color: c.text))),
                SizedBox(width: 74, child: Text(d.payments > 0 ? '${d.payments}' : '—', textAlign: TextAlign.right, style: TextStyle(fontSize: 13.5, color: c.text))),
                if (s.showSpend) SizedBox(width: 74, child: Text(d.spend > 0 ? '${(d.spend / 1000).round()} тыс' : '—', textAlign: TextAlign.right, style: TextStyle(fontSize: 13.5, color: c.text))),
              ]),
            ),
        ]),
      ),
      if (s.stages.isNotEmpty) ...[
        MoneySection(title: 'Где сейчас заявки'),
        _CutList(rows: [for (final x in s.stages) (label: '${x.label}${s.stages.map((y) => y.pipeline).toSet().length > 1 ? ' · ${x.pipeline}' : ''}', leads: x.count, paid: x.paid, note: pct(x.share))]),
      ],
      if (s.lost.isNotEmpty) ...[MoneySection(title: 'Причины отказа'), _CutList(rows: [for (final x in s.lost) (label: x.label, leads: x.count, paid: null, note: pct(x.share))])],
      for (final (title, rows) in [
        ('По источникам', s.bySource),
        ('По менеджерам', s.byManager),
        ('Для кого книга', s.byRecipient),
        ('Повод', s.byOccasion),
        ('Срок до события', s.byLeadTime),
        ('День недели', s.byWeekday),
        ('Время суток', s.byHour),
      ])
        if (rows.isNotEmpty) ...[MoneySection(title: title), _CutList(rows: [for (final x in rows) (label: x.label, leads: x.leads, paid: x.paid, note: pct(x.conversion, 1))])],
      if (s.buyersBySource.isNotEmpty) ...[
        MoneySection(title: 'Откуда покупатели', hint: 'по меткам рекламы или каналу, выбранному менеджером'),
        _CutList(rows: [for (final x in s.buyersBySource) (label: x.label, leads: x.buyers, paid: null, note: money(x.received))]),
      ],
      if (s.payDelay.any((x) => x.count > 0)) ...[
        MoneySection(title: 'Сколько думали до оплаты'),
        _CutList(rows: [for (final x in s.payDelay) (label: x.label, leads: x.count, paid: null, note: pct(x.share))]),
      ],
    ];
  }
}

/// Разрез: подпись, сколько, оплатили (если есть), пояснение справа; полоса — доля от самой большой строки.
class _CutList extends StatelessWidget {
  const _CutList({required this.rows});
  final List<({String label, int leads, int? paid, String note})> rows;

  @override
  Widget build(BuildContext context) {
    final c = context.c;
    final maxV = rows.fold<int>(1, (m, r) => r.leads > m ? r.leads : m);
    return Container(
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 8),
      decoration: BoxDecoration(color: c.surface, borderRadius: BorderRadius.circular(Rd.lg)),
      child: Column(children: [
        for (final r in rows)
          Padding(
            padding: const EdgeInsets.symmetric(vertical: 6),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Row(children: [
                Expanded(child: Text(r.label, style: TextStyle(fontSize: 14, color: c.text))),
                Text('${r.leads}${r.paid != null ? ' · опл. ${r.paid}' : ''}', style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: c.text)),
                SizedBox(width: 70, child: Text(r.note, textAlign: TextAlign.right, style: AppText.caption(context))),
              ]),
              const SizedBox(height: 4),
              ClipRRect(borderRadius: BorderRadius.circular(3), child: LinearProgressIndicator(value: r.leads / maxV, minHeight: 4, backgroundColor: c.border.withValues(alpha: 0.5), color: c.brand)),
            ]),
          ),
      ]),
    );
  }
}
