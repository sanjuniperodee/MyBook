import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../api/mybook_api.g.dart' as v1api;
import '../../core/format.dart';
import '../../ui/kit.dart';
import '../../ui/tokens.dart';

/// Общее экранов денег («Финансы», «Расходы», «Прибыль», «Реестр», «Аналитика»): период, плитки, столбики, строки.

/// Сумма со знаком: «−5 000 ₸».
String signedMoney(num v) => v < 0 ? '−${money(-v)}' : money(v);

/// Доля 0…1 → «12%»; null — «—».
String pct(num? v, [int digits = 0]) => v == null ? '—' : '${(v * 100).toStringAsFixed(digits).replaceAll('.', ',').replaceAll('-', '−')}%';

/// Период экрана: пресет или свои даты.
class MoneyPeriodQuery {
  const MoneyPeriodQuery({this.preset = 'month', this.from, this.to});
  final String preset;
  final String? from;
  final String? to;
}

/// Плашки периода («Сегодня», «7 дней», «Месяц», «Прошлый месяц», «Даты…») и подпись выбранного.
class PeriodBar extends StatelessWidget {
  const PeriodBar({super.key, required this.period, required this.onPick});
  final v1api.MoneyPeriod? period;
  final ValueChanged<MoneyPeriodQuery> onPick;

  @override
  Widget build(BuildContext context) {
    final p = period;
    final presets = p?.presets ?? const <v1api.Choice>[];
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      SizedBox(
        height: 36,
        child: ListView(scrollDirection: Axis.horizontal, clipBehavior: Clip.none, children: [
          for (final x in presets)
            Padding(padding: const EdgeInsets.only(right: 8), child: FilterPill(label: x.label, selected: p?.preset == x.id, onTap: () => onPick(MoneyPeriodQuery(preset: x.id)))),
          FilterPill(
            label: p?.preset == 'custom' ? p!.label : 'Даты…',
            selected: p?.preset == 'custom',
            onTap: () async {
              final now = DateTime.now();
              final r = await showDateRangePicker(
                context: context,
                firstDate: DateTime(now.year - 3),
                lastDate: now,
                initialDateRange: p == null ? null : DateTimeRange(start: DateTime.parse(p.first), end: DateTime.parse(p.last)),
                locale: const Locale('ru'),
              );
              if (r == null) return;
              String d(DateTime x) => '${x.year}-${two(x.month)}-${two(x.day)}';
              onPick(MoneyPeriodQuery(preset: 'custom', from: d(r.start), to: d(r.end)));
            },
          ),
        ]),
      ),
      if (p != null && p.preset != 'custom') Padding(padding: const EdgeInsets.only(top: 8, left: 4), child: Text(p.label, style: AppText.caption(context))),
    ]);
  }
}

/// Плитка показателя: подпись, сумма, подстрочник (изменение к прошлому периоду или пояснение).
class StatTile extends StatelessWidget {
  const StatTile({super.key, required this.label, required this.value, this.note, this.noteColor, this.valueColor, this.onTap});
  final String label;
  final String value;
  final String? note;
  final Color? noteColor;
  final Color? valueColor;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final c = context.c;
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.fromLTRB(14, 12, 14, 12),
        decoration: BoxDecoration(color: c.surface, borderRadius: BorderRadius.circular(Rd.lg)),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, mainAxisSize: MainAxisSize.min, children: [
          Text(label, style: AppText.caption(context), maxLines: 1, overflow: TextOverflow.ellipsis),
          const SizedBox(height: 4),
          FittedBox(fit: BoxFit.scaleDown, alignment: Alignment.centerLeft, child: Text(value, style: TextStyle(fontSize: 20, fontWeight: FontWeight.w700, color: valueColor ?? c.text, fontFeatures: const [FontFeature.tabularFigures()]))),
          if (note != null) Padding(padding: const EdgeInsets.only(top: 2), child: Text(note!, style: AppText.caption(context).copyWith(color: noteColor), maxLines: 2)),
        ]),
      ),
    );
  }
}

/// Плитки по две в ряд.
class StatGrid extends StatelessWidget {
  const StatGrid({super.key, required this.tiles});
  final List<Widget> tiles;

  @override
  Widget build(BuildContext context) => Column(children: [
        for (var i = 0; i < tiles.length; i += 2)
          Padding(
            padding: const EdgeInsets.only(bottom: 10),
            child: IntrinsicHeight(
              child: Row(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                Expanded(child: tiles[i]),
                const SizedBox(width: 10),
                Expanded(child: i + 1 < tiles.length ? tiles[i + 1] : const SizedBox()),
              ]),
            ),
          ),
      ]);
}

/// Изменение к прошлому периоду: «▲ 12% к прошлому» зелёным, «▼ 8%» красным; null — без сравнения.
(String?, Color?) deltaNote(BuildContext context, num? delta, {bool lessIsBetter = false}) {
  // Нет сравнения или ничего не изменилось (оба периода пустые) — вместо «▲ 0%» показываем пояснение плитки.
  if (delta == null || delta == 0) return (null, null);
  final up = delta >= 0;
  final good = lessIsBetter ? !up : up;
  return ('${up ? '▲' : '▼'} ${pct(delta.abs())} к прошлому', good ? context.c.success : context.c.danger);
}

/// Список столбиков: подпись, сумма, полоса доли от максимума.
class BarList extends StatelessWidget {
  const BarList({super.key, required this.bars, this.money = true});
  final List<v1api.MoneyBar> bars;
  final bool money;

  @override
  Widget build(BuildContext context) {
    final c = context.c;
    final maxV = bars.fold<int>(1, (m, b) => b.value.abs() > m ? b.value.abs() : m);
    return Container(
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 8),
      decoration: BoxDecoration(color: c.surface, borderRadius: BorderRadius.circular(Rd.lg)),
      child: Column(children: [
        for (final b in bars)
          Padding(
            padding: const EdgeInsets.symmetric(vertical: 7),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Row(children: [
                Expanded(child: Text(b.label, style: TextStyle(fontSize: 14.5, color: c.text))),
                if (b.count > 0) Padding(padding: const EdgeInsets.only(right: 8), child: Text('${b.count}', style: AppText.caption(context))),
                Text(this.money ? signedMoney(b.value) : '${b.value}', style: TextStyle(fontSize: 14.5, fontWeight: FontWeight.w600, color: c.text, fontFeatures: const [FontFeature.tabularFigures()])),
              ]),
              const SizedBox(height: 5),
              ClipRRect(
                borderRadius: BorderRadius.circular(3),
                child: LinearProgressIndicator(value: b.value.abs() / maxV, minHeight: 5, backgroundColor: c.border.withValues(alpha: 0.5), color: b.value < 0 ? c.danger : c.brand),
              ),
            ]),
          ),
      ]),
    );
  }
}

/// Заголовок блока со счётчиком.
class MoneySection extends StatelessWidget {
  const MoneySection({super.key, required this.title, this.hint, this.trailing});
  final String title;
  final String? hint;
  final Widget? trailing;

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.fromLTRB(4, 22, 4, 10),
        child: Row(crossAxisAlignment: CrossAxisAlignment.end, children: [
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(title, style: AppText.headline(context)),
              if (hint != null) Padding(padding: const EdgeInsets.only(top: 2), child: Text(hint!, style: AppText.caption(context))),
            ]),
          ),
          if (trailing != null) trailing!,
        ]),
      );
}

/// Деньги периода одной строкой: пришло − возвраты − комиссии − налог = на счёт; − остальные расходы = прибыль.
class MoneyFlowCard extends StatelessWidget {
  const MoneyFlowCard({super.key, required this.flow});
  final v1api.MoneyFlow flow;

  @override
  Widget build(BuildContext context) {
    final c = context.c;
    final rows = <(String, int, bool)>[
      ('Пришло от клиентов', flow.incoming, false),
      if (flow.refunds != 0) ('Возвраты', -flow.refunds, false),
      if (flow.fees != 0) ('Комиссии банка', -flow.fees, false),
      if (flow.tax != 0) ('Налог', -flow.tax, false),
      ('На счёт', flow.net, true),
      if (flow.other != 0) ('Остальные расходы', -flow.other, false),
      ('Прибыль', flow.profit, true),
    ];
    return Container(
      padding: const EdgeInsets.fromLTRB(16, 6, 16, 6),
      decoration: BoxDecoration(color: c.surface, borderRadius: BorderRadius.circular(Rd.lg)),
      child: Column(children: [
        for (final (label, v, strong) in rows)
          Padding(
            padding: const EdgeInsets.symmetric(vertical: 6),
            child: Row(children: [
              Expanded(child: Text(label, style: TextStyle(fontSize: 14.5, color: strong ? c.text : c.textMuted, fontWeight: strong ? FontWeight.w600 : FontWeight.w400))),
              Text(signedMoney(v), style: TextStyle(fontSize: 14.5, fontWeight: strong ? FontWeight.w700 : FontWeight.w500, color: strong && v < 0 ? c.danger : c.text, fontFeatures: const [FontFeature.tabularFigures()])),
            ]),
          ),
      ]),
    );
  }
}

/// Пусто в блоке.
class MoneyEmpty extends StatelessWidget {
  const MoneyEmpty(this.text, {super.key});
  final String text;

  @override
  Widget build(BuildContext context) => Container(
        width: double.infinity,
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(color: context.c.surface, borderRadius: BorderRadius.circular(Rd.lg)),
        child: Row(children: [Icon(LucideIcons.circleCheck, size: 18, color: context.c.success), const SizedBox(width: 10), Expanded(child: Text(text, style: AppText.sub(context)))]),
      );
}

/// Каркас экрана денег: большой заголовок, кнопки справа, период, обновление жестом, ошибка и загрузка.
class MoneyPage extends StatelessWidget {
  const MoneyPage({super.key, required this.title, required this.period, required this.onPeriod, required this.onRefresh, required this.loading, this.error, this.actions = const [], required this.children, this.subtitle});
  final String title;
  final String? subtitle;
  final v1api.MoneyPeriod? period;
  final ValueChanged<MoneyPeriodQuery>? onPeriod;
  final Future<void> Function() onRefresh;
  final bool loading;
  final String? error;
  final List<Widget> actions;
  final List<Widget> children;

  @override
  Widget build(BuildContext context) {
    final c = context.c;
    return Scaffold(
      backgroundColor: c.bg,
      body: RefreshIndicator(
        color: c.brand,
        onRefresh: onRefresh,
        child: ListView(
          physics: const AlwaysScrollableScrollPhysics(parent: BouncingScrollPhysics()),
          padding: EdgeInsets.fromLTRB(16, MediaQuery.of(context).padding.top + 10, 16, 60),
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(4, 0, 0, 4),
              child: Row(children: [Expanded(child: Text(title, style: AppText.largeTitle(context))), ...actions]),
            ),
            if (subtitle != null) Padding(padding: const EdgeInsets.fromLTRB(4, 0, 4, 8), child: Text(subtitle!, style: AppText.sub(context))),
            if (onPeriod != null) Padding(padding: const EdgeInsets.only(top: 6, bottom: 14), child: PeriodBar(period: period, onPick: onPeriod!)),
            if (error != null && loading == false && children.isEmpty)
              Padding(padding: const EdgeInsets.only(top: 60), child: EmptyState(icon: LucideIcons.wifiOff, title: 'Не удалось загрузить', hint: error, action: 'Повторить', onAction: onRefresh))
            else if (children.isEmpty)
              const Padding(padding: EdgeInsets.only(top: 80), child: Center(child: CircularProgressIndicator()))
            else
              ...children,
          ],
        ),
      ),
    );
  }
}
