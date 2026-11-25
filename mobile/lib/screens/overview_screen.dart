import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:provider/provider.dart';

import '../api/mybook_api.g.dart' as v1api;
import '../core/api.dart';
import '../core/auth.dart';
import '../core/format.dart';
import '../core/nav.dart';
import '../core/v1.dart';
import '../ui/kit.dart';
import '../ui/tokens.dart';
import 'deals_screen.dart' show hexColor;

/// «Обзор» для руководителя и аналитика: деньги за период против прошлого, выручка по дням, что горит, воронка клиентов,
/// тарифы и сделки по этапам. Данные — те же, что на дашборде CRM.
class OverviewScreen extends StatefulWidget {
  const OverviewScreen({super.key});

  @override
  State<OverviewScreen> createState() => _OverviewScreenState();
}

class _OverviewScreenState extends State<OverviewScreen> {
  v1api.CrmOverview? _d;
  String? _error;
  int _period = 30;
  String? _etag;
  int? _etagPeriod;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final period = _period;
    try {
      final api = context.read<AuthState>().api;
      final r = await v1Cached(
        api,
        (c) => c.crmOverview(period: period),
        etag: _d != null && _etagPeriod == period ? _etag : null,
      );
      if (!mounted || _period != period) return;
      _etag = r.etag;
      _etagPeriod = period;
      if (!r.notModified && r.data != null) {
        setState(() {
          _d = r.data;
          _error = null;
        });
      } else if (_error != null) {
        setState(() => _error = null);
      }
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    }
  }

  void _setPeriod(int p) {
    if (p == _period) return;
    setState(() {
      _period = p;
      _d = null;
    });
    _load();
  }

  @override
  Widget build(BuildContext context) {
    final c = context.c;
    final top = MediaQuery.of(context).padding.top;
    final d = _d;
    return Scaffold(
      backgroundColor: c.bg,
      body: RefreshIndicator(
        onRefresh: _load,
        edgeOffset: top,
        child: ListView(
          physics: const BouncingScrollPhysics(parent: AlwaysScrollableScrollPhysics()),
          padding: EdgeInsets.fromLTRB(16, top + 10, 16, 110),
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(4, 0, 4, 12),
              child: PageTitle('Обзор'),
            ),
            SizedBox(
              height: 40,
              child: ListView(
                scrollDirection: Axis.horizontal,
                children: [
                  for (final p in const [7, 30, 90])
                    Padding(
                      padding: const EdgeInsets.only(right: 8),
                      child: FilterPill(label: '$p дней', selected: _period == p, onTap: () => _setPeriod(p)),
                    ),
                ],
              ),
            ),
            const SizedBox(height: 14),
            if (_error != null && d == null)
              Padding(
                padding: const EdgeInsets.only(top: 60),
                child: EmptyState(icon: LucideIcons.wifiOff, title: 'Не удалось загрузить', hint: _error, action: 'Повторить', onAction: _load),
              )
            else if (d == null)
              const _OverviewSkeleton()
            else
              ..._content(context, d),
          ],
        ),
      ),
    );
  }

  List<Widget> _content(BuildContext context, v1api.CrmOverview d) {
    final c = context.c;
    final revenue = d.revenue;
    final sales = d.sales;
    final avg = d.avgCheck;
    final clients = d.newClients;
    final counters = d.counters;
    final attention = d.attention;
    final funnel = d.funnel;
    final plans = d.byPlan;
    final stages = d.stages;
    final series = _series(d.series, _period);
    final staff = context.read<AuthState>().staff!;
    final hot = <({String label, int n, IconData icon, Color color, String? tab})>[
      (label: 'Ждут ответа', n: counters.chats, icon: LucideIcons.messageCircle, color: c.warn, tab: staff.can('chats.view') ? 'chats' : null),
      (label: 'Задачи горят', n: counters.tasks, icon: LucideIcons.squareCheck, color: c.danger, tab: 'tasks'),
      (label: 'Заказы к работе', n: attention.orders, icon: LucideIcons.package, color: c.violet, tab: staff.can('orders.view') ? 'orders' : null),
      (label: 'Горит срок', n: attention.deadlines, icon: LucideIcons.calendarClock, color: c.danger, tab: null),
    ].where((h) => h.n > 0).toList();
    return [
      _HeroCard(value: revenue.cur.toInt(), prev: revenue.prev.toInt(), series: series, period: _period),
      const SizedBox(height: 12),
      IntrinsicHeight(
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Expanded(
              child: _Tile(label: 'Продажи', value: '${sales.cur.toInt()}', cur: sales.cur.toInt(), prev: sales.prev.toInt(), icon: LucideIcons.badgeCheck),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: _Tile(label: 'Средний чек', value: money(avg.cur), cur: avg.cur.toInt(), prev: avg.prev.toInt(), icon: LucideIcons.receipt),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: _Tile(label: 'Клиенты', value: '${clients.cur.toInt()}', cur: clients.cur.toInt(), prev: clients.prev.toInt(), icon: LucideIcons.userPlus),
            ),
          ],
        ),
      ),
      if (hot.isNotEmpty) ...[
        const _Section('Требует внимания'),
        Wrap(
          spacing: 10,
          runSpacing: 10,
          children: [
            for (final h in hot)
              GestureDetector(
                onTap: h.tab == null ? null : () => tabRequest.value = h.tab,
                child: Container(
                  padding: const EdgeInsets.fromLTRB(12, 10, 14, 10),
                  decoration: BoxDecoration(color: h.color.withValues(alpha: 0.12), borderRadius: BorderRadius.circular(Rd.md)),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Icon(h.icon, size: 18, color: h.color),
                      const SizedBox(width: 8),
                      Text(
                        '${h.n}',
                        style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800, color: h.color),
                      ),
                      const SizedBox(width: 8),
                      Text(
                        h.label,
                        style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: c.text),
                      ),
                    ],
                  ),
                ),
              ),
          ],
        ),
      ],
      const _Section('Воронка клиентов'),
      _Card(
        child: _Bars(
          rows: [
            _BarRowData('Зарегистрировались', funnel.registered, null),
            _BarRowData('Создали книгу', funnel.withBook, _pct(funnel.withBook, funnel.registered)),
            _BarRowData('Начали писать текст', funnel.engaged, _pct(funnel.engaged, funnel.registered)),
            _BarRowData('Оформили заказ', funnel.ordered, _pct(funnel.ordered, funnel.registered)),
            _BarRowData('Оплатили', funnel.paid, _pct(funnel.paid, funnel.registered)),
          ],
        ),
      ),
      if (plans.isNotEmpty) ...[
        const _Section('Выручка по тарифам'),
        _Card(child: _Bars(rows: [for (final p in plans) _BarRowData(p.label, p.sum.toInt(), '${p.n} шт.', money: true)])),
      ],
      if (stages.isNotEmpty) ...[
        const _Section('Сделки по этапам'),
        _Card(
          child: Column(
            children: [
              for (var i = 0; i < stages.length; i++) ...[
                Padding(
                  padding: const EdgeInsets.symmetric(vertical: 10),
                  child: Row(
                    children: [
                      Container(
                        width: 10,
                        height: 10,
                        decoration: BoxDecoration(color: hexColor(stages[i].color), shape: BoxShape.circle),
                      ),
                      const SizedBox(width: 12),
                      Expanded(
                        child: Text(stages[i].name, style: TextStyle(fontSize: 15.5, color: c.text)),
                      ),
                      Text(
                        '${stages[i].n}',
                        style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700, color: c.text),
                      ),
                    ],
                  ),
                ),
                if (i < stages.length - 1) Divider(height: 1, color: c.border),
              ],
            ],
          ),
        ),
      ],
    ];
  }

  static String? _pct(int a, int b) => b == 0 ? null : '${(a / b * 100).round()}%';

  /// Выручка по дням: пропущенные дни — нули, ровно period значений до сегодня.
  static List<int> _series(List<v1api.CrmOverviewSeries> rows, int period) {
    final byDay = {for (final r in rows) r.day: r.sum.toInt()};
    final now = DateTime.now();
    return [
      for (var i = period - 1; i >= 0; i--)
        () {
          final d = now.subtract(Duration(days: i));
          return byDay['${d.year}-${two(d.month)}-${two(d.day)}'] ?? 0;
        }(),
    ];
  }
}

class _Section extends StatelessWidget {
  const _Section(this.title);
  final String title;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.fromLTRB(6, 24, 6, 10),
    child: Text(title.toUpperCase(), style: AppText.label(context)),
  );
}

class _Card extends StatelessWidget {
  const _Card({required this.child});
  final Widget child;

  @override
  Widget build(BuildContext context) {
    final c = context.c;
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.fromLTRB(16, 6, 16, 6),
      decoration: BoxDecoration(color: c.surface, borderRadius: BorderRadius.circular(Rd.lg)),
      child: child,
    );
  }
}

/// Изменение к прошлому периоду, «▲ 12%» — зелёным, «▼ 8%» — красным.
class _Delta extends StatelessWidget {
  const _Delta({required this.cur, required this.prev, this.onDark = false});
  final int cur;
  final int prev;
  final bool onDark;

  @override
  Widget build(BuildContext context) {
    final c = context.c;
    if (prev == 0 && cur == 0) return const SizedBox.shrink();
    if (prev == 0) {
      return Text(
        'новое',
        style: TextStyle(fontSize: 12.5, fontWeight: FontWeight.w700, color: onDark ? Colors.white70 : c.success),
      );
    }
    final ch = (cur - prev) / prev;
    final up = ch >= 0;
    final color = onDark ? Colors.white : (up ? c.success : c.danger);
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Icon(up ? LucideIcons.trendingUp : LucideIcons.trendingDown, size: 14, color: color),
        const SizedBox(width: 3),
        Text(
          '${(ch.abs() * 100).round()}%',
          style: TextStyle(fontSize: 12.5, fontWeight: FontWeight.w700, color: color),
        ),
      ],
    );
  }
}

class _HeroCard extends StatelessWidget {
  const _HeroCard({required this.value, required this.prev, required this.series, required this.period});
  final int value;
  final int prev;
  final List<int> series;
  final int period;

  @override
  Widget build(BuildContext context) {
    final c = context.c;
    return Container(
      padding: const EdgeInsets.fromLTRB(18, 16, 18, 14),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(Rd.xl),
        // Ключевая цифра — тёмной плашкой «тушью», как сводка CRM; акцент — винный только у главной кнопки.
        color: context.isDark ? c.surface : c.text,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Text(
                'Выручка',
                style: TextStyle(color: Colors.white70, fontSize: 14.5, fontWeight: FontWeight.w600),
              ),
              const Spacer(),
              _Delta(cur: value, prev: prev, onDark: true),
            ],
          ),
          const SizedBox(height: 4),
          Text(
            money(value),
            style: const TextStyle(color: Colors.white, fontSize: 34, fontWeight: FontWeight.w800, letterSpacing: -0.8),
          ),
          const SizedBox(height: 2),
          Text('за $period дней · прошлые $period — ${money(prev)}', style: const TextStyle(color: Colors.white70, fontSize: 12.5)),
          const SizedBox(height: 14),
          SizedBox(
            height: 64,
            child: CustomPaint(size: Size.infinite, painter: _BarsPainter(series)),
          ),
        ],
      ),
    );
  }
}

class _BarsPainter extends CustomPainter {
  _BarsPainter(this.values);
  final List<int> values;

  @override
  void paint(Canvas canvas, Size size) {
    if (values.isEmpty) return;
    final maxV = values.reduce((a, b) => a > b ? a : b);
    final n = values.length;
    final gap = n > 40 ? 1.0 : 2.5;
    final w = (size.width - gap * (n - 1)) / n;
    final paint = Paint()..color = Colors.white.withValues(alpha: 0.9);
    final faint = Paint()..color = Colors.white.withValues(alpha: 0.22);
    for (var i = 0; i < n; i++) {
      final h = maxV == 0 ? 3.0 : (values[i] / maxV * (size.height - 3)) + 3;
      final r = RRect.fromRectAndRadius(Rect.fromLTWH(i * (w + gap), size.height - h, w, h), Radius.circular(w > 4 ? 3 : 1));
      canvas.drawRRect(r, values[i] == 0 ? faint : paint);
    }
  }

  @override
  bool shouldRepaint(covariant _BarsPainter old) => old.values != values;
}

class _Tile extends StatelessWidget {
  const _Tile({required this.label, required this.value, required this.cur, required this.prev, required this.icon});
  final String label;
  final String value;
  final int cur;
  final int prev;
  final IconData icon;

  @override
  Widget build(BuildContext context) {
    final c = context.c;
    return Container(
      padding: const EdgeInsets.fromLTRB(12, 12, 10, 12),
      decoration: BoxDecoration(color: c.surface, borderRadius: BorderRadius.circular(Rd.lg)),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, size: 18, color: c.brandDeep),
          const SizedBox(height: 10),
          FittedBox(
            fit: BoxFit.scaleDown,
            alignment: Alignment.centerLeft,
            child: Text(
              value,
              style: TextStyle(fontSize: 20, fontWeight: FontWeight.w800, color: c.text, letterSpacing: -0.4),
            ),
          ),
          const SizedBox(height: 2),
          Text(label, maxLines: 1, overflow: TextOverflow.ellipsis, style: AppText.caption(context)),
          const SizedBox(height: 4),
          _Delta(cur: cur, prev: prev),
        ],
      ),
    );
  }
}

class _BarRowData {
  _BarRowData(this.label, this.value, this.note, {this.money = false});
  final String label;
  final int value;
  final String? note;
  final bool money;
}

class _Bars extends StatelessWidget {
  const _Bars({required this.rows});
  final List<_BarRowData> rows;

  @override
  Widget build(BuildContext context) {
    final c = context.c;
    final maxV = rows.fold<int>(1, (m, r) => r.value > m ? r.value : m);
    return Column(
      children: [
        for (final r in rows)
          Padding(
            padding: const EdgeInsets.symmetric(vertical: 8),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Expanded(
                      child: Text(r.label, style: TextStyle(fontSize: 14.5, color: c.text)),
                    ),
                    if (r.note != null)
                      Padding(
                        padding: const EdgeInsets.only(right: 8),
                        child: Text(r.note!, style: AppText.caption(context)),
                      ),
                    Text(
                      r.money ? money(r.value) : '${r.value}',
                      style: TextStyle(fontSize: 14.5, fontWeight: FontWeight.w700, color: c.text),
                    ),
                  ],
                ),
                const SizedBox(height: 6),
                ClipRRect(
                  borderRadius: BorderRadius.circular(4),
                  child: Stack(
                    children: [
                      Container(height: 7, color: c.border),
                      FractionallySizedBox(
                        widthFactor: (r.value / maxV).clamp(0.02, 1.0),
                        child: Container(height: 7, color: c.brandDeep),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
      ],
    );
  }
}

class _OverviewSkeleton extends StatelessWidget {
  const _OverviewSkeleton();

  @override
  Widget build(BuildContext context) => Shimmer(
    child: Column(
      children: [
        const SkeletonBox(height: 170, radius: 24),
        const SizedBox(height: 12),
        Row(
          children: [
            for (var i = 0; i < 3; i++) ...[if (i > 0) const SizedBox(width: 10), const Expanded(child: SkeletonBox(height: 100, radius: 16))],
          ],
        ),
        const SizedBox(height: 24),
        const SkeletonBox(height: 200, radius: 16),
      ],
    ),
  );
}
