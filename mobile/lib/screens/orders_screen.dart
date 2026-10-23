import 'package:flutter/cupertino.dart';
import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:provider/provider.dart';

import '../core/api.dart';
import '../core/auth.dart';
import '../ui/kit.dart';
import '../ui/tokens.dart';
import 'order_screen.dart';

/// Цвета статусов заказа (как на доске CRM) — общие для списка и карточки.
Color orderStatusColor(BuildContext context, String status) {
  final c = context.c;
  return switch (status) {
    'pending_payment' => c.warn,
    'paid' => c.success,
    'in_production' => const Color(0xFF2B8FD6),
    'shipped' => c.violet,
    'delivered' => c.textMuted,
    'cancelled' => c.danger,
    _ => c.textMuted,
  };
}

/// «Заказы» для производства — доска CRM в телефоне: статусы-«пилюли» со счётчиками, карточки с признаками «срочно»,
/// «сюрприз», «клиент сообщил об оплате» и сроком; нажатие открывает заказ, где статус меняется одной кнопкой.
class OrdersScreen extends StatefulWidget {
  const OrdersScreen({super.key});

  @override
  State<OrdersScreen> createState() => _OrdersScreenState();
}

class _OrdersScreenState extends State<OrdersScreen> {
  List<Map<String, dynamic>> _orders = [];
  List<Map<String, dynamic>> _statuses = [];
  bool _loaded = false;
  String? _error;
  String _status = 'paid';
  String _q = '';

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final r = await context.read<AuthState>().api.get('/api/mobile/orders') as Map<String, dynamic>;
      if (!mounted) return;
      setState(() {
        _orders = [for (final o in (r['orders'] as List)) o as Map<String, dynamic>];
        _statuses = [for (final s in (r['statuses'] as List)) s as Map<String, dynamic>];
        // Первый раз открываем статус, где есть заказы: пустой «Оплачен» выглядел как «заказов нет».
        if (!_loaded && _count(_status) == 0) {
          final first = ['paid', 'in_production', 'pending_payment', 'shipped', 'delivered'].where((s) => _count(s) > 0);
          if (first.isNotEmpty) _status = first.first;
        }
        _loaded = true;
        _error = null;
      });
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    }
  }

  int _count(String s) => _orders.where((o) => o['status'] == s).length;

  Future<void> _open(Map<String, dynamic> o) async {
    final changed = await Navigator.of(context).push<bool>(
      CupertinoPageRoute<bool>(
        builder: (_) => OrderScreen(orderId: o['id'] as String, number: (o['number'] as num).toInt()),
      ),
    );
    if (changed == true) await _load();
  }

  @override
  Widget build(BuildContext context) {
    final c = context.c;
    final top = MediaQuery.of(context).padding.top;
    final q = _q.toLowerCase();
    final list = _orders.where((o) => o['status'] == _status && (q.isEmpty || '${o['number']} ${o['contactName']}'.toLowerCase().contains(q))).toList();
    return Scaffold(
      backgroundColor: c.bg,
      body: RefreshIndicator(
        onRefresh: _load,
        edgeOffset: top,
        child: CustomScrollView(
          physics: const BouncingScrollPhysics(parent: AlwaysScrollableScrollPhysics()),
          slivers: [
            SliverToBoxAdapter(
              child: Padding(
                padding: EdgeInsets.fromLTRB(20, top + 10, 20, 4),
                child: Text('Заказы', style: AppText.largeTitle(context)),
              ),
            ),
            SliverToBoxAdapter(
              child: Padding(
                padding: const EdgeInsets.fromLTRB(16, 10, 16, 10),
                child: AppSearchField(hint: 'Номер или получатель', onChanged: (v) => setState(() => _q = v)),
              ),
            ),
            SliverToBoxAdapter(
              child: SizedBox(
                height: 40,
                child: ListView(
                  scrollDirection: Axis.horizontal,
                  padding: const EdgeInsets.symmetric(horizontal: 16),
                  children: [
                    for (final s in _statuses)
                      Padding(
                        padding: const EdgeInsets.only(right: 8),
                        child: FilterPill(
                          label: s['label'] as String,
                          count: _count(s['key'] as String),
                          dot: orderStatusColor(context, s['key'] as String),
                          selected: _status == s['key'],
                          onTap: () => setState(() => _status = s['key'] as String),
                        ),
                      ),
                  ],
                ),
              ),
            ),
            const SliverToBoxAdapter(child: SizedBox(height: 8)),
            if (!_loaded && _error == null)
              const SliverFillRemaining(hasScrollBody: false, child: SizedBox(height: 480, child: ChatListSkeleton()))
            else if (_error != null && !_loaded)
              SliverFillRemaining(
                hasScrollBody: false,
                child: EmptyState(icon: LucideIcons.wifiOff, title: 'Не удалось загрузить', hint: _error, action: 'Повторить', onAction: _load),
              )
            else if (list.isEmpty)
              SliverFillRemaining(
                hasScrollBody: false,
                child: EmptyState(icon: LucideIcons.package, title: 'Здесь пусто', hint: 'Заказов в этом статусе за 30 дней нет'),
              )
            else
              SliverList.builder(
                itemCount: list.length,
                itemBuilder: (_, i) => _OrderCard(order: list[i], onTap: () => _open(list[i])),
              ),
            const SliverToBoxAdapter(child: SizedBox(height: 110)),
          ],
        ),
      ),
    );
  }
}

class _OrderCard extends StatelessWidget {
  const _OrderCard({required this.order, required this.onTap});
  final Map<String, dynamic> order;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final c = context.c;
    final o = order;
    final daysLeft = (o['daysLeft'] as num?)?.toInt();
    final urgent = daysLeft != null && daysLeft <= 3 && o['status'] != 'delivered' && o['status'] != 'shipped';
    final qty = (o['quantity'] as num?)?.toInt() ?? 1;
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 0, 16, 10),
      child: Material(
        color: c.surface,
        borderRadius: BorderRadius.circular(Rd.lg),
        child: InkWell(
          borderRadius: BorderRadius.circular(Rd.lg),
          onTap: onTap,
          child: Padding(
            padding: const EdgeInsets.fromLTRB(14, 12, 12, 12),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Container(
                      width: 4,
                      height: 38,
                      decoration: BoxDecoration(color: orderStatusColor(context, o['status'] as String), borderRadius: BorderRadius.circular(2)),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text('№${o['number']} · ${o['contactName']}', maxLines: 1, overflow: TextOverflow.ellipsis, style: AppText.headline(context).copyWith(fontSize: 16.5)),
                          const SizedBox(height: 2),
                          Text(
                            '${o['planName']}${qty > 1 ? ' × $qty' : ''}${(o['printed'] as bool? ?? true) ? '' : ' · электронная'}',
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: AppText.sub(context),
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(width: 8),
                    Text(
                      o['amountLabel'] as String,
                      style: TextStyle(fontSize: 15.5, fontWeight: FontWeight.w700, color: c.text),
                    ),
                  ],
                ),
                const SizedBox(height: 10),
                Wrap(
                  spacing: 6,
                  runSpacing: 6,
                  children: [
                    if (o['express'] == true) Tag('срочно', fg: c.danger, bg: c.danger.withValues(alpha: 0.12), icon: LucideIcons.zap),
                    if (o['claimed'] == true) Tag('клиент сообщил об оплате', fg: c.warn, bg: c.warnBg, icon: LucideIcons.circleDollarSign),
                    if (o['surprise'] == true) Tag('сюрприз', fg: c.violet, bg: c.violetBg, icon: LucideIcons.gift),
                    if (o['giftNote'] == true) Tag('открытка', fg: c.violet, bg: c.violetBg, icon: LucideIcons.heart),
                    if (daysLeft != null)
                      Tag(
                        daysLeft < 0
                            ? 'просрочен на ${-daysLeft} дн.'
                            : daysLeft == 0
                            ? 'нужен сегодня'
                            : 'нужен через $daysLeft дн.',
                        fg: urgent ? c.danger : c.textMuted,
                        bg: urgent ? c.danger.withValues(alpha: 0.12) : c.border,
                        icon: LucideIcons.calendarClock,
                      ),
                    if (o['assignee'] != null) Tag(o['assignee'] as String, fg: c.textMuted, bg: c.border, icon: LucideIcons.user),
                  ],
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
