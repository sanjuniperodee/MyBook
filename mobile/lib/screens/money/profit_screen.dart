import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:provider/provider.dart';

import '../../api/mybook_api.g.dart' as v1api;
import '../../core/api.dart';
import '../../core/auth.dart';
import '../../core/format.dart';
import '../../core/v1.dart';
import '../../ui/kit.dart';
import '../../ui/tokens.dart';
import '../../widgets/crm_form.dart';
import 'expenses_screen.dart';
import 'money_widgets.dart';

/// «Прибыль» как на сайте (API v1 crmProfit): выручка, расходы, прибыль и маржа с изменением к прошлому периоду, отчёт
/// строками, деньги периода, таблица по времени, экономика продаж; проценты комиссий и налог — правка (finance.manage).
class ProfitScreen extends StatefulWidget {
  const ProfitScreen({super.key});

  @override
  State<ProfitScreen> createState() => _ProfitScreenState();
}

class _ProfitScreenState extends State<ProfitScreen> {
  v1api.Profit? _p;
  String? _error;
  bool _loading = false;
  MoneyPeriodQuery _q = const MoneyPeriodQuery();

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
      final p = await v1(_api, (c) => c.crmProfit(p: _q.preset, from: _q.from, to: _q.to));
      if (mounted) setState(() => _p = p);
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final p = _p;
    final c = context.c;
    return MoneyPage(
      title: 'Прибыль',
      period: p?.period,
      onPeriod: (q) {
        _q = q;
        _load();
      },
      onRefresh: _load,
      loading: _loading,
      error: _error,
      actions: [
        if (p?.canManage == true)
          RoundIconButton(
            icon: LucideIcons.percent,
            size: 44,
            iconSize: 20,
            color: c.brand,
            tooltip: 'Комиссии и налог',
            onTap: () async {
              final saved = await Navigator.of(context).push<bool>(MaterialPageRoute(builder: (_) => FeeRatesScreen(profit: p!)));
              if (saved == true) _load();
            },
          ),
      ],
      children: p == null ? const [] : _content(context, p),
    );
  }

  List<Widget> _content(BuildContext context, v1api.Profit p) {
    final c = context.c;
    final t = p.totals;
    final (rNote, rColor) = deltaNote(context, t.deltaRevenue);
    final (eNote, eColor) = deltaNote(context, t.deltaExpenses, lessIsBetter: true);
    final (pNote, pColor) = deltaNote(context, t.deltaProfit);
    final u = p.unit;
    String? m(num? v) => v == null ? null : money(v);
    return [
      if (p.noExpenses)
        Container(
          margin: const EdgeInsets.only(bottom: 12),
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(color: c.warnBg, borderRadius: BorderRadius.circular(Rd.lg)),
          child: Row(children: [
            Expanded(child: Text('За период не внесено ни одного расхода — прибыль равна выручке.', style: TextStyle(color: c.warn, fontSize: 14))),
            TextButton(onPressed: () => Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => const _ExpensesPage())).then((_) => _load()), child: const Text('Внести')),
          ]),
        ),
      StatGrid(tiles: [
        StatTile(label: 'Выручка', value: money(t.revenue), note: rNote, noteColor: rColor),
        StatTile(label: 'Расходы', value: money(t.expenses), note: eNote, noteColor: eColor),
        StatTile(label: 'Прибыль', value: signedMoney(t.profit), note: pNote, noteColor: pColor, valueColor: t.profit < 0 ? c.danger : null),
        StatTile(label: 'Маржа', value: pct(t.margin), note: 'прибыль ÷ выручка'),
      ]),
      MoneySection(title: 'Отчёт', hint: 'справа — прошлый период'),
      Container(
        padding: const EdgeInsets.fromLTRB(16, 6, 16, 6),
        decoration: BoxDecoration(color: c.surface, borderRadius: BorderRadius.circular(Rd.lg)),
        child: Column(children: [
          for (final l in p.lines)
            Padding(
              padding: EdgeInsets.only(top: l.kind == 'sum' || l.kind == 'result' || l.kind == null ? 8 : 4, bottom: 4, left: l.kind == 'sub' ? 12 : 0),
              child: Row(children: [
                Expanded(child: Text(l.label, style: TextStyle(fontSize: l.kind == 'sub' ? 13.5 : 14.5, color: l.kind == 'sub' ? c.textMuted : c.text, fontWeight: l.kind == 'result' || l.kind == 'sum' ? FontWeight.w700 : FontWeight.w500))),
                Text(l.minus && l.value != 0 ? '−${money(l.value)}' : signedMoney(l.value), style: TextStyle(fontSize: 14.5, fontWeight: l.kind == 'result' ? FontWeight.w800 : FontWeight.w600, color: l.kind == 'result' && l.value < 0 ? c.danger : c.text, fontFeatures: const [FontFeature.tabularFigures()])),
                SizedBox(width: 86, child: Text(l.prev == 0 ? '' : signedMoney(l.minus ? -l.prev : l.prev), textAlign: TextAlign.right, style: AppText.caption(context))),
              ]),
            ),
        ]),
      ),
      MoneySection(title: 'Деньги периода'),
      MoneyFlowCard(flow: p.flow),
      MoneySection(title: {'day': 'По дням', 'week': 'По неделям', 'month': 'По месяцам'}[p.step] ?? 'По времени'),
      Container(
        padding: const EdgeInsets.fromLTRB(16, 8, 16, 8),
        decoration: BoxDecoration(color: c.surface, borderRadius: BorderRadius.circular(Rd.lg)),
        child: Column(children: [
          Row(children: [
            const Expanded(child: SizedBox()),
            for (final h in ['Выручка', 'Расходы', 'Прибыль']) SizedBox(width: 84, child: Text(h, textAlign: TextAlign.right, style: AppText.caption(context))),
          ]),
          for (final r in p.rows.where((r) => r.revenue != 0 || r.expenses != 0))
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 5),
              child: Row(children: [
                Expanded(child: Text(r.label, style: TextStyle(fontSize: 13.5, color: c.text))),
                for (final v in [r.revenue, r.expenses, r.profit])
                  SizedBox(width: 84, child: Text(_short(v), textAlign: TextAlign.right, style: TextStyle(fontSize: 13.5, color: v < 0 ? c.danger : c.text, fontFeatures: const [FontFeature.tabularFigures()]))),
              ]),
            ),
          if (p.rows.every((r) => r.revenue == 0 && r.expenses == 0)) Padding(padding: const EdgeInsets.all(8), child: Text('За период денег и расходов нет', style: AppText.sub(context))),
        ]),
      ),
      MoneySection(title: 'Экономика продаж', hint: 'заявки и покупатели периода, реклама — из «Расходов»'),
      GroupCard(padding: EdgeInsets.zero, children: [
        _row(context, 'Заявок', '${u.leads}'),
        _row(context, 'Покупателей', '${u.buyers}', pct(u.conversion, 1)),
        _row(context, 'Заказов', '${u.orders}'),
        _row(context, 'Стоимость заявки', m(u.cpl) ?? '—'),
        _row(context, 'Стоимость покупателя (CAC)', m(u.cac) ?? '—'),
        _row(context, 'Окупаемость рекламы', pct(u.roasCash), 'от всех денег'),
        _row(context, 'Окупаемость от первых оплат', pct(u.roasFirst)),
        _row(context, 'Окупаемость от договоров', pct(u.roasAgreed)),
        _row(context, 'Доля рекламы в деньгах', pct(u.adShare, 1)),
        _row(context, 'Средняя первая оплата', m(u.avgFirst) ?? '—'),
        _row(context, 'Средний договор', m(u.avgAgreed) ?? '—'),
        _row(context, 'Печать одной книги', m(u.printPerBook) ?? '—'),
        _row(context, 'Прибыль на покупателя', m(u.profitPerBuyer) ?? '—'),
      ]),
      if (p.fees.byForm.isNotEmpty || p.tax.rate > 0) ...[
        MoneySection(title: 'Комиссии и налог', hint: 'считаются сами с денег периода'),
        GroupCard(padding: EdgeInsets.zero, children: [
          for (final f in p.fees.byForm) _row(context, '${f.form} · ${_rate(f.rate)}', money(f.fee), 'с ${money(f.money)}'),
          if (p.tax.rate > 0) _row(context, 'Налог · ${_rate(p.tax.rate)}', money(p.tax.auto)),
        ]),
      ],
    ];
  }

  static String _rate(num r) => '${r.toString().replaceAll(RegExp(r'\.0$'), '').replaceAll('.', ',')}%';

  /// Сумма коротко для таблицы: 1,2 млн, 350 тыс.
  static String _short(int v) {
    final a = v.abs();
    final s = a >= 1000000 ? '${(a / 1000000).toStringAsFixed(1).replaceAll('.', ',')} млн' : a >= 10000 ? '${(a / 1000).round()} тыс' : '$a';
    return v < 0 ? '−$s' : s;
  }

  Widget _row(BuildContext context, String label, String value, [String? note]) => Padding(
        padding: const EdgeInsets.fromLTRB(16, 11, 16, 11),
        child: Row(children: [
          Expanded(child: Text(label, style: TextStyle(fontSize: 14.5, color: context.c.text))),
          if (note != null) Padding(padding: const EdgeInsets.only(right: 8), child: Text(note, style: AppText.caption(context))),
          Text(value, style: TextStyle(fontSize: 14.5, fontWeight: FontWeight.w600, color: context.c.text, fontFeatures: const [FontFeature.tabularFigures()])),
        ]),
      );
}

class _ExpensesPage extends StatelessWidget {
  const _ExpensesPage();

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(backgroundColor: context.c.bg, surfaceTintColor: Colors.transparent, toolbarHeight: 52, titleSpacing: 0, title: Text('Расходы', style: AppText.headline(context))),
        backgroundColor: context.c.bg,
        body: MediaQuery.removePadding(context: context, removeTop: true, child: InNavBar(actions: ValueNotifier(const []), child: const ExpensesScreen())),
      );
}

/// Проценты комиссий банка по формам оплаты сделки и налог с выручки — как «Комиссии и налог» на странице «Прибыль».
class FeeRatesScreen extends StatefulWidget {
  const FeeRatesScreen({super.key, required this.profit});
  final v1api.Profit profit;

  @override
  State<FeeRatesScreen> createState() => _FeeRatesScreenState();
}

class _FeeRatesScreenState extends State<FeeRatesScreen> {
  late final Map<String, TextEditingController> _rates = {
    for (final f in {...widget.profit.payForms, ...widget.profit.feeRates.keys}) f: TextEditingController(text: _fmt(widget.profit.feeRates[f])),
  };
  late final _tax = TextEditingController(text: _fmt(widget.profit.tax.rate));
  bool _busy = false;

  static String _fmt(num? v) => v == null || v == 0 ? '' : v.toString().replaceAll(RegExp(r'\.0$'), '').replaceAll('.', ',');
  static double? _num(String s) => s.trim().isEmpty ? 0 : double.tryParse(s.trim().replaceAll(',', '.'));

  @override
  void dispose() {
    for (final c in [..._rates.values, _tax]) {
      c.dispose();
    }
    super.dispose();
  }

  Future<void> _save() async {
    final rates = <v1api.FeeRatesBodyRates>[];
    for (final e in _rates.entries) {
      final v = _num(e.value.text);
      if (v == null || v < 0 || v > 100) return _toast('${e.key}: процент — число от 0 до 100');
      if (v > 0) rates.add(v1api.FeeRatesBodyRates(form: e.key, rate: v));
    }
    final tax = _num(_tax.text);
    if (tax == null || tax < 0 || tax > 50) return _toast('Налог — число от 0 до 50');
    setState(() => _busy = true);
    try {
      final r = await v1(context.read<AuthState>().api, (c) => c.crmProfitFees(body: v1api.FeeRatesBody(rates: rates, taxRate: tax)));
      if (!mounted) return;
      _toast(r.message ?? 'Сохранено');
      Navigator.of(context).pop(true);
    } on ApiException catch (e) {
      if (mounted) _toast(e.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  void _toast(String t) => ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(t)));

  @override
  Widget build(BuildContext context) {
    final c = context.c;
    return Scaffold(
      backgroundColor: c.surface,
      appBar: AppBar(backgroundColor: c.bg, surfaceTintColor: Colors.transparent, title: Text('Комиссии и налог', style: AppText.headline(context))),
      body: GestureDetector(
        onTap: () => FocusManager.instance.primaryFocus?.unfocus(),
        child: ListView(padding: const EdgeInsets.only(top: 16, bottom: 40), children: [
          FormSection(title: 'Комиссия банка, %', hint: '«Прибыль» и «Реестр продаж» считают её с денег сделки по форме оплаты; пусто — не считать', children: [
            for (final e in _rates.entries) LabeledField(label: e.key, controller: e.value, keyboard: const TextInputType.numberWithOptions(decimal: true), hint: '0'),
          ]),
          FormSection(title: 'Налог с выручки, %', children: [LabeledField(label: 'Налог', controller: _tax, keyboard: const TextInputType.numberWithOptions(decimal: true), hint: '0 — не считать')]),
          Padding(padding: const EdgeInsets.symmetric(horizontal: 16), child: PrimaryButton(label: 'Сохранить', icon: LucideIcons.check, busy: _busy, onPressed: _save)),
        ]),
      ),
    );
  }
}
