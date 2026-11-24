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
import '../chat_screen.dart';
import 'money_widgets.dart';

/// «Аналитика продаж» (API v1 crmAnalytics): деньги периода, итоги с изменением, воронка этапов, каналы, команда (сделки,
/// деньги, сообщения, звонки, задачи, скорость ответа, план), кто дольше ждал ответа, телефония и причины отказов.
class AnalyticsScreen extends StatefulWidget {
  const AnalyticsScreen({super.key});

  @override
  State<AnalyticsScreen> createState() => _AnalyticsScreenState();
}

class _AnalyticsScreenState extends State<AnalyticsScreen> {
  v1api.SalesAnalytics? _a;
  String? _error;
  bool _loading = false;
  MoneyPeriodQuery _q = const MoneyPeriodQuery();
  String? _pipeline;

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
      final a = await v1(_api, (c) => c.crmAnalytics(p: _q.preset, from: _q.from, to: _q.to, pl: _pipeline));
      if (mounted) setState(() => _a = a);
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final a = _a;
    return MoneyPage(
      title: 'Аналитика продаж',
      period: a?.period,
      onPeriod: (q) {
        _q = q;
        _load();
      },
      onRefresh: _load,
      loading: _loading,
      error: _error,
      children: a == null ? const [] : _content(context, a),
    );
  }

  List<Widget> _content(BuildContext context, v1api.SalesAnalytics a) {
    final c = context.c;
    final t = a.tiles;
    (String?, Color?) d(num? v) => deltaNote(context, v);
    final maxTeam = a.team.fold<int>(1, (m, r) => r.revenue > m ? r.revenue : m);
    return [
      if (a.pipelines.length > 1)
        Padding(
          padding: const EdgeInsets.only(bottom: 12),
          child: SizedBox(
            height: 36,
            child: ListView(scrollDirection: Axis.horizontal, children: [
              for (final p in a.pipelines)
                Padding(
                  padding: const EdgeInsets.only(right: 8),
                  child: FilterPill(label: p.label, selected: a.pipelineId == p.id, onTap: () {
                    _pipeline = p.id;
                    _load();
                  }),
                ),
            ]),
          ),
        ),
      StatGrid(tiles: [
        StatTile(label: 'Пришло денег', value: money(t.received), note: d(t.receivedDelta).$1 ?? 'за вычетом возвратов', noteColor: d(t.receivedDelta).$2),
        StatTile(label: 'Сумма выигранных', value: money(t.wonSum), note: d(t.wonSumDelta).$1 ?? 'от повторных ${money(t.repeatRevenue)}', noteColor: d(t.wonSumDelta).$2),
        StatTile(label: 'Новых сделок', value: '${t.created}', note: d(t.createdDelta).$1 ?? 'повторных ${t.repeatCreated}', noteColor: d(t.createdDelta).$2),
        StatTile(label: 'Успешных', value: '${t.won}', note: d(t.wonDelta).$1 ?? 'повторных ${t.repeatWon}', noteColor: d(t.wonDelta).$2),
        StatTile(label: 'Конверсия в продажу', value: t.conversion, note: 'средний цикл ${t.cycle}'),
        StatTile(label: 'Первый ответ, медиана', value: t.responseMedian, note: 'в норматив ${t.slaMinutes} мин — ${t.inSla}; ждут ${t.awaiting}'),
      ]),
      Padding(
        padding: const EdgeInsets.fromLTRB(4, 0, 4, 0),
        child: Text('Время ответа — в рабочих минутах. Бот ответил первым ${t.botFirst} раз${t.botMedian != null ? ' (медиана ${t.botMedian})' : ''}.', style: AppText.caption(context)),
      ),
      if (a.flow != null) ...[MoneySection(title: 'Деньги периода'), MoneyFlowCard(flow: a.flow!)],

      MoneySection(title: 'Воронка', hint: 'сколько сделок периода дошли до этапа · сейчас в работе ${a.funnel.inWork}'),
      Container(
        padding: const EdgeInsets.fromLTRB(16, 8, 16, 8),
        decoration: BoxDecoration(color: c.surface, borderRadius: BorderRadius.circular(Rd.lg)),
        child: Column(children: [
          for (final r in a.funnel.rows)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 7),
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Row(children: [
                  Expanded(child: Text(r.name, style: TextStyle(fontSize: 14.5, fontWeight: FontWeight.w500, color: c.text))),
                  Text('${r.reached}', style: TextStyle(fontSize: 14.5, fontWeight: FontWeight.w700, color: c.text)),
                ]),
                const SizedBox(height: 4),
                ClipRRect(
                  borderRadius: BorderRadius.circular(3),
                  child: LinearProgressIndicator(value: a.funnel.base == 0 ? 0 : r.reached / a.funnel.base, minHeight: 5, backgroundColor: c.border.withValues(alpha: 0.5), color: r.kind == 'won' ? c.success : c.brand),
                ),
                if (r.conversion != null || r.timeLabel != null)
                  Padding(padding: const EdgeInsets.only(top: 3), child: Text([if (r.conversion != null) '${r.conversion} из предыдущего', if (r.timeLabel != null) '${r.timeLabel} на этапе'].join(' · '), style: AppText.caption(context))),
              ]),
            ),
        ]),
      ),

      if (a.channels.isNotEmpty) ...[
        MoneySection(title: 'Каналы', hint: 'откуда сделки и что продают'),
        BarList(bars: [for (final ch in a.channels) v1api.MoneyBar(key: ch.key, label: '${ch.label} · ${ch.won} из ${ch.created}', value: ch.revenue, count: 0)]),
      ],

      if (a.team.isNotEmpty) ...[
        MoneySection(title: 'Команда'),
        GroupCard(padding: EdgeInsets.zero, children: [
          for (final r in a.team)
            Container(
              decoration: BoxDecoration(border: Border(bottom: BorderSide(color: c.border.withValues(alpha: 0.6), width: 0.5))),
              padding: const EdgeInsets.fromLTRB(16, 12, 16, 12),
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Row(children: [
                  Expanded(child: Text(r.name, style: TextStyle(fontSize: 15, fontWeight: FontWeight.w600, color: c.text))),
                  Text(money(r.revenue), style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700, color: c.text)),
                ]),
                const SizedBox(height: 4),
                ClipRRect(borderRadius: BorderRadius.circular(3), child: LinearProgressIndicator(value: r.revenue / maxTeam, minHeight: 4, backgroundColor: c.border.withValues(alpha: 0.5), color: c.brand)),
                const SizedBox(height: 5),
                Text('сделок ${r.deals} · успешных ${r.won} · в работе ${r.open} · пришло ${money(r.received)} · план ${r.planLabel}', style: AppText.caption(context)),
                Text('сообщений ${r.messages}${r.phoneMessages > 0 ? ' (+${r.phoneMessages} с телефона)' : ''} · звонков ${r.calls}, ${r.talkMinutes} мин · ответ ${r.responseLabel}, в норматив ${r.inSlaLabel}', style: AppText.caption(context)),
                Text('задач сделано ${r.tasksDone}${r.tasksOverdue > 0 ? ' · просрочено ${r.tasksOverdue}' : ''}', style: AppText.caption(context).copyWith(color: r.tasksOverdue > 0 ? c.danger : null)),
              ]),
            ),
        ]),
      ],

      if (a.longest.isNotEmpty) ...[
        MoneySection(title: 'Дольше всех ждали ответа'),
        GroupCard(padding: EdgeInsets.zero, children: [
          for (final w in a.longest)
            GroupTile(
              title: w.waitLabel,
              subtitle: '${w.askedLabel}${w.answered ? '' : ' · без ответа'}',
              icon: w.answered ? LucideIcons.messageCircle : LucideIcons.messageCircleWarning,
              onTap: () => Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => ChatScreen(chatId: w.conversationId))),
            ),
        ]),
      ],

      MoneySection(title: 'Телефония и ответы'),
      GroupCard(padding: EdgeInsets.zero, children: [
        _row(context, 'Входящих', '${a.calls.incoming}'),
        _row(context, 'Исходящих', '${a.calls.outgoing}'),
        _row(context, 'Пропущенных', '${a.calls.missed}', a.calls.incoming > 0 ? '${(a.calls.missed / a.calls.incoming * 100).round()}%' : null, a.calls.missed > 0 ? c.danger : null),
        _row(context, 'Перезвонили', a.calls.missed > 0 ? '${(a.calls.handled / a.calls.missed * 100).round()}%' : '—', 'из пропущенных'),
        _row(context, 'Минут на линии', '${a.calls.talkMinutes}'),
        _row(context, 'Без ответа в чатах', '${a.calls.unanswered}', 'из ${a.calls.asked}', a.calls.unanswered > 0 ? c.danger : null),
      ]),

      if (a.lost.isNotEmpty) ...[
        MoneySection(title: 'Причины отказов'),
        BarList(money: false, bars: [for (final l in a.lost) v1api.MoneyBar(key: l.label, label: l.label, value: l.value, count: 0)]),
      ],
    ];
  }

  Widget _row(BuildContext context, String label, String value, [String? note, Color? color]) => Padding(
        padding: const EdgeInsets.fromLTRB(16, 11, 16, 11),
        child: Row(children: [
          Expanded(child: Text(label, style: TextStyle(fontSize: 14.5, color: context.c.text))),
          if (note != null) Padding(padding: const EdgeInsets.only(right: 8), child: Text(note, style: AppText.caption(context))),
          Text(value, style: TextStyle(fontSize: 14.5, fontWeight: FontWeight.w600, color: color ?? context.c.text)),
        ]),
      );
}
