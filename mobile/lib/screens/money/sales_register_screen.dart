import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';

import '../../api/mybook_api.g.dart' as v1api;
import '../../core/api.dart';
import '../../core/auth.dart';
import '../../core/format.dart';
import '../../core/v1.dart';
import '../../ui/kit.dart';
import '../../ui/tokens.dart';
import '../../widgets/crm_form.dart';
import '../deal_screen.dart';
import 'money_widgets.dart';

/// «Реестр продаж» (API v1 crmSalesRegister): покупатели периода — первая оплата в выбранные дни; цена, оплачено, остаток,
/// состояние, форма оплаты (меняется долгим нажатием — право менять сделки), комиссия банка (кому открыты расходы).
class SalesRegisterScreen extends StatefulWidget {
  const SalesRegisterScreen({super.key});

  @override
  State<SalesRegisterScreen> createState() => _SalesRegisterScreenState();
}

class _SalesRegisterScreenState extends State<SalesRegisterScreen> {
  v1api.SalesRegister? _s;
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
      final s = await v1(_api, (c) => c.crmSalesRegister(p: _q.preset, from: _q.from, to: _q.to));
      if (mounted) setState(() => _s = s);
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _payForm(v1api.SalesRegister s, v1api.SalesRow r) async {
    final v = await pickChoice(context, title: 'Форма оплаты · Д${r.number}', options: [for (final f in s.payForms) (f, f)], current: r.payForm, emptyLabel: 'Не указана');
    if (v == null || v == r.payForm || !mounted) return;
    try {
      final res = await v1(_api, (c) => c.crmSalesPayForm(dealId: r.id, body: v1api.PayFormBody(form: v)));
      HapticFeedback.lightImpact();
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(res.message ?? 'Сохранено')));
      _load();
    } on ApiException catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
    }
  }

  @override
  Widget build(BuildContext context) {
    final s = _s;
    final c = context.c;
    return MoneyPage(
      title: 'Реестр продаж',
      period: s?.period,
      onPeriod: (q) {
        _q = q;
        _load();
      },
      onRefresh: _load,
      loading: _loading,
      error: _error,
      children: s == null
          ? const []
          : [
              StatGrid(tiles: [
                StatTile(label: 'Продаж', value: '${s.totals.count}', note: s.totals.count > 0 ? 'оплачены полностью: ${s.totals.settled}' : 'за период — нет'),
                StatTile(label: 'По договорам', value: money(s.totals.price), note: s.totals.count > 0 ? 'в среднем ${money((s.totals.price / s.totals.count).round())}' : null),
                StatTile(label: 'Оплачено', value: money(s.totals.paid), note: s.totals.price > 0 ? '${(s.totals.paid / s.totals.price * 100).round()}% суммы' : null),
                StatTile(label: 'Остаток', value: money(s.totals.rest), note: s.showFees && s.totals.fee > 0 ? 'комиссии ${money(s.totals.fee)}' : '${s.totals.count - s.totals.settled} не доплатили'),
              ]),
              MoneySection(title: 'Продажи', hint: s.canEdit ? 'свежие — первыми; долгое нажатие — форма оплаты' : 'свежие — первыми'),
              if (s.rows.isEmpty)
                const MoneyEmpty('За период продаж нет')
              else
                GroupCard(padding: EdgeInsets.zero, children: [
                  for (final r in s.rows)
                    InkWell(
                      onTap: () => Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => DealScreen(dealId: r.id))),
                      onLongPress: s.canEdit ? () => _payForm(s, r) : null,
                      child: Container(
                        decoration: BoxDecoration(border: Border(bottom: BorderSide(color: c.border.withValues(alpha: 0.6), width: 0.5))),
                        padding: const EdgeInsets.fromLTRB(16, 12, 16, 12),
                        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                          Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                            Expanded(child: Text('${r.client.isEmpty ? '—' : r.client} · Д${r.number}', style: TextStyle(fontSize: 15, fontWeight: FontWeight.w600, color: c.text))),
                            Text(money(r.paid), style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700, color: c.text, fontFeatures: const [FontFeature.tabularFigures()])),
                          ]),
                          const SizedBox(height: 3),
                          Text(
                            [
                              '${r.day.substring(8)}.${r.day.substring(5, 7)}',
                              if (r.city.isNotEmpty) r.city,
                              r.channel,
                              r.manager,
                            ].join(' · '),
                            style: AppText.caption(context),
                          ),
                          Text(
                            [
                              if (r.plan.isNotEmpty) r.plan,
                              'цена ${money(r.price)}',
                              r.rest > 0 ? 'остаток ${money(r.rest)}' : 'оплачено полностью',
                              if (r.payForm.isNotEmpty) r.payForm,
                              if (r.fee > 0) 'комиссия ${money(r.fee)}',
                            ].join(' · '),
                            style: AppText.caption(context).copyWith(color: r.rest > 0 ? c.text : null),
                          ),
                          Text([r.state, if (r.method.isNotEmpty) r.method, if (r.eventDate.length == 10) 'к ${r.eventDate.substring(8)}.${r.eventDate.substring(5, 7)}', if (r.phone.isNotEmpty) r.phone].join(' · '), style: AppText.caption(context)),
                        ]),
                      ),
                    ),
                ]),
            ],
    );
  }
}
