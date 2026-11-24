import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:provider/provider.dart';

import '../../api/mybook_api.g.dart' as v1api;
import '../../core/api.dart';
import '../../core/auth.dart';
import '../../core/format.dart';
import '../../core/v1.dart';
import '../../ui/kit.dart';
import '../../ui/tokens.dart';
import '../crm_web_screen.dart';
import '../money/money_widgets.dart';

/// «ИИ-дизайнер» (API v1 crmDesignAi): запросы, расход, люди от бесплатных до покупки, покупки пакетов, режимы, кто
/// пользуется — с «Подарить» запросы; бесплатный лимит на клиента. Модели и включение — страница CRM («Модели»).
class DesignAiScreen extends StatefulWidget {
  const DesignAiScreen({super.key});

  @override
  State<DesignAiScreen> createState() => _DesignAiScreenState();
}

class _DesignAiScreenState extends State<DesignAiScreen> {
  v1api.DesignAiReport? _r;
  String? _error;
  bool _loading = false;
  String _days = '30';

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
      final r = await v1(_api, (c) => c.crmDesignAi(days: _days));
      if (mounted) setState(() => _r = r);
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  void _toast(String t) => ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(t)));

  Future<void> _done(Future<v1api.Done> Function(v1api.MybookApi) call) async {
    try {
      final r = await v1(_api, call);
      HapticFeedback.lightImpact();
      _toast(r.message ?? 'Готово');
      _load();
    } on ApiException catch (e) {
      _toast(e.message);
    }
  }

  Future<void> _grant(String userId, String name) async {
    final v = await promptText(context, title: 'Подарить запросы · $name', hint: 'сколько, от 1 до 1000', ok: 'Подарить');
    final n = int.tryParse(v?.trim() ?? '');
    if (v == null) return;
    if (n == null || n < 1) return _toast('Укажите число от 1');
    await _done((c) => c.crmDesignAiGrant(body: v1api.DesignAiGrantBody(userId: userId, count: n)));
  }

  Future<void> _limit(int current) async {
    final v = await promptText(context, title: 'Бесплатных запросов на клиента', hint: '0 — только купленные', initial: '$current', ok: 'Сохранить');
    final n = int.tryParse(v?.trim() ?? '');
    if (v == null) return;
    if (n == null || n < 0) return _toast('Целое число от 0');
    await _done((c) => c.crmDesignAiLimit(body: v1api.DesignAiLimitBody(limit: n)));
  }

  static String _usd(num v) => '\$${v < 1 ? v.toStringAsFixed(3) : v.toStringAsFixed(2)}';

  @override
  Widget build(BuildContext context) {
    final r = _r;
    final c = context.c;
    return MoneyPage(
      title: 'ИИ-дизайнер',
      subtitle: r == null ? null : (r.enabled ? 'Включён' : 'Выключен'),
      period: null,
      onPeriod: null,
      onRefresh: _load,
      loading: _loading,
      error: _error,
      children: r == null
          ? const []
          : [
              SizedBox(
                height: 36,
                child: ListView(scrollDirection: Axis.horizontal, children: [
                  for (final (k, label) in const [('7', '7 дней'), ('30', '30 дней'), ('90', '90 дней'), ('0', 'Всё время')])
                    Padding(
                      padding: const EdgeInsets.only(right: 8),
                      child: FilterPill(label: label, selected: _days == k, onTap: () {
                        _days = k;
                        _load();
                      }),
                    ),
                ]),
              ),
              const SizedBox(height: 14),
              StatGrid(tiles: [
                StatTile(label: 'Запросов', value: '${r.totals.ok}', note: r.totals.failed > 0 ? 'ошибок ${r.totals.failed}' : 'бесплатных ${r.totals.free}, купленных ${r.totals.credit}'),
                StatTile(label: 'Клиентов', value: '${r.totals.users}', note: r.totals.avgSeconds == null ? null : 'ответ в среднем ${r.totals.avgSeconds} с'),
                StatTile(label: 'Расход', value: _usd(r.totals.costUsd), note: r.totals.ok > 0 ? '${_usd(r.totals.costUsd / r.totals.ok)} за запрос' : null),
                StatTile(label: 'Куплено пакетов', value: '${r.purchases.paid}', note: r.purchases.paidAmount > 0 ? money(r.purchases.paidAmount) : (r.purchases.pending > 0 ? 'ждут оплаты ${r.purchases.pending}' : null)),
              ]),
              MoneySection(title: 'От бесплатных до покупки', hint: 'за всё время'),
              GroupCard(padding: EdgeInsets.zero, children: [
                _row(context, 'Попробовали', '${r.people.used}'),
                _row(context, 'Использовали все ${r.freeLimit} бесплатных', '${r.people.hitLimit}'),
                _row(context, 'Держат купленные запросы', '${r.people.withCredits}', r.people.creditsLeft > 0 ? 'осталось ${r.people.creditsLeft}' : null),
              ]),
              if (r.byMode.isNotEmpty) ...[
                MoneySection(title: 'Режимы'),
                BarList(money: false, bars: [for (final m in r.byMode) v1api.MoneyBar(key: m.key, label: '${m.label} · ${_usd(m.costUsd)}', value: m.requests, count: 0)]),
              ],
              MoneySection(title: 'Кто пользуется', hint: r.canEdit ? '«Подарить» кладёт запросы на баланс, как купленные' : null),
              if (r.users.isEmpty)
                const MoneyEmpty('За период запросов нет')
              else
                GroupCard(padding: EdgeInsets.zero, children: [
                  for (final u in r.users)
                    GroupTile(
                      title: u.name.isEmpty ? u.email : u.name,
                      subtitle: 'запросов ${u.requests} (бесплатных ${u.free}, купленных ${u.credit}) · на балансе ${u.credits} · ${u.lastLabel}',
                      icon: LucideIcons.user,
                      trailing: r.canEdit ? Icon(LucideIcons.gift, size: 18, color: c.brand) : null,
                      onTap: r.canEdit ? () => _grant(u.userId, u.name.isEmpty ? u.email : u.name) : null,
                    ),
                ]),
              MoneySection(title: 'Настройки'),
              GroupCard(padding: EdgeInsets.zero, children: [
                GroupTile(title: 'Бесплатный лимит', subtitle: '${r.freeLimit} запросов на клиента', icon: LucideIcons.gauge, onTap: r.canEdit ? () => _limit(r.freeLimit) : null),
                GroupTile(title: 'Модели и включение', subtitle: 'какая модель отвечает на какую просьбу', icon: LucideIcons.cpu, onTap: () => openCrm(context, '/admin/ai-designer#ai-settings-h', title: 'Модели ИИ-дизайнера').then((_) => _load())),
              ]),
            ],
    );
  }

  Widget _row(BuildContext context, String label, String value, [String? note]) => Padding(
        padding: const EdgeInsets.fromLTRB(16, 11, 16, 11),
        child: Row(children: [
          Expanded(child: Text(label, style: TextStyle(fontSize: 14.5, color: context.c.text))),
          if (note != null) Padding(padding: const EdgeInsets.only(right: 8), child: Text(note, style: AppText.caption(context))),
          Text(value, style: TextStyle(fontSize: 14.5, fontWeight: FontWeight.w600, color: context.c.text)),
        ]),
      );
}
