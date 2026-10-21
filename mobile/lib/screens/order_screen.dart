import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:provider/provider.dart';
import 'package:url_launcher/url_launcher.dart';

import '../core/api.dart';
import '../core/auth.dart';
import '../ui/kit.dart';
import '../ui/tokens.dart';
import 'orders_screen.dart' show orderStatusColor;

/// Заказ для производства: статус и его смена одной кнопкой, получатель с кнопкой «позвонить», доставка и трек, книга,
/// пожелания (открытка, «сюрприз») и журнал. Файлы типографии и правка данных — в CRM на сайте.
class OrderScreen extends StatefulWidget {
  const OrderScreen({super.key, required this.orderId, required this.number});
  final String orderId;
  final int number;

  @override
  State<OrderScreen> createState() => _OrderScreenState();
}

class _OrderScreenState extends State<OrderScreen> {
  Map<String, dynamic>? _o;
  String? _error;
  bool _changed = false;
  bool _busy = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final r = await context.read<AuthState>().api.get('/api/mobile/orders/${widget.orderId}') as Map<String, dynamic>;
      if (mounted) setState(() => _o = r);
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    }
  }

  void _toast(String text) => ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(text)));

  Future<void> _setStatus() async {
    final api = context.read<AuthState>().api;
    List<Map<String, dynamic>> statuses;
    try {
      statuses = [for (final s in ((await api.get('/api/mobile/orders') as Map<String, dynamic>)['statuses'] as List)) s as Map<String, dynamic>];
    } on ApiException catch (e) {
      return _toast(e.message);
    }
    if (!mounted) return;
    final current = _o!['status'] as String;
    final picked = await showAppSheet<String>(
      context,
      title: 'Перевести заказ',
      icon: LucideIcons.arrowRightLeft,
      builder: (sheet) => SingleChildScrollView(
        child: GroupCard(
          padding: const EdgeInsets.fromLTRB(16, 4, 16, 24),
          children: [
            for (final s in statuses)
              GroupTile(
                title: s['label'] as String,
                subtitle: s['key'] == current ? 'сейчас' : null,
                icon: LucideIcons.circleDot,
                iconColor: orderStatusColor(sheet, s['key'] as String),
                trailing: s['key'] == current ? Icon(LucideIcons.check, size: 20, color: sheet.c.brandDeep) : const SizedBox.shrink(),
                onTap: s['key'] == current ? null : () => Navigator.pop(sheet, s['key'] as String),
              ),
          ],
        ),
      ),
    );
    if (picked == null || !mounted) return;
    if (!await confirm(context, title: 'Перевести заказ №${widget.number}?', message: 'Клиент получит сообщение о смене статуса, если для этого настроены правила.', ok: 'Перевести')) return;
    setState(() => _busy = true);
    try {
      await api.post('/api/mobile/orders/${widget.orderId}/status', body: {'status': picked});
      HapticFeedback.mediumImpact();
      _changed = true;
      await _load();
    } on ApiException catch (e) {
      _toast(e.message);
    }
    if (mounted) setState(() => _busy = false);
  }

  @override
  Widget build(BuildContext context) {
    final c = context.c;
    final o = _o;
    return PopScope(
      canPop: false,
      onPopInvokedWithResult: (didPop, _) {
        if (!didPop) Navigator.of(context).pop(_changed);
      },
      child: Scaffold(
        backgroundColor: c.surface,
        appBar: AppBar(
          backgroundColor: c.bg,
          surfaceTintColor: Colors.transparent,
          scrolledUnderElevation: 0,
          leading: RoundIconButton(icon: LucideIcons.chevronLeft, iconSize: 28, color: c.brandDeep, onTap: () => Navigator.of(context).pop(_changed)),
          title: Text('Заказ №${widget.number}', style: AppText.headline(context)),
        ),
        body: o == null
            ? (_error != null
                  ? EmptyState(icon: LucideIcons.wifiOff, title: 'Не удалось открыть заказ', hint: _error, action: 'Повторить', onAction: _load)
                  : const Center(child: CircularProgressIndicator()))
            : ListView(
                padding: const EdgeInsets.fromLTRB(16, 8, 16, 40),
                children: [
                  _statusCard(context, o),
                  const SizedBox(height: 16),
                  _group(context, 'Получатель', [
                    _row(context, 'Имя', o['contact']['name'] as String),
                    if (o['contact']['phone'] != null)
                      _row(
                        context,
                        'Телефон',
                        o['contact']['phone'] as String,
                        onTap: o['contact']['masked'] == true ? null : () => launchUrl(Uri(scheme: 'tel', path: (o['contact']['phone'] as String).replaceAll(RegExp(r'[^0-9+]'), ''))),
                      ),
                    if (o['contact']['email'] != null) _row(context, 'E-mail', o['contact']['email'] as String),
                  ]),
                  if (o['delivery'] != null)
                    _group(context, 'Доставка', [
                      _row(context, 'Способ', o['delivery']['method'] as String),
                      _row(context, 'Адрес', (o['delivery']['address'] as String?) ?? '—'),
                      if (o['delivery']['quoted'] == true) _note(context, 'Стоимость доставки считается отдельно — в сумму не входит', c.warn, c.warnBg),
                      if (o['tracking'] != null)
                        _row(context, 'Трек-номер', o['tracking'] as String, onTap: () => Clipboard.setData(ClipboardData(text: o['tracking'] as String)).then((_) => _toast('Скопировано'))),
                    ]),
                  _group(context, 'Книга', [
                    _row(context, 'Название', (o['book']['title'] as String?) ?? '—'),
                    _row(context, 'Для кого', [o['book']['author'], o['book']['recipient']].where((e) => e != null && (e as String).isNotEmpty).join(' → ')),
                    _row(context, 'Тариф', '${o['planName']}${(o['quantity'] as num) > 1 ? ' × ${o['quantity']}' : ''}'),
                    _row(context, 'Сумма', o['amountLabel'] as String),
                    if ((o['addons'] as List).isNotEmpty) _row(context, 'Допы', (o['addons'] as List).join(', ')),
                  ]),
                  if (o['desiredDate'] != null || o['comment'] != null || o['giftNote'] != null || o['surprise'] == true)
                    _group(context, 'Пожелания', [
                      if (o['desiredDate'] != null) _row(context, 'Нужна к', (o['desiredDate'] as String).split('-').reversed.join('.'), accent: true),
                      if (o['surprise'] == true) _note(context, 'Сюрприз: не звонить получателю, связываться с заказчиком', c.violet, c.violetBg),
                      if (o['comment'] != null) _row(context, 'Комментарий', o['comment'] as String),
                      if (o['giftNote'] != null) _row(context, 'Открытка', '«${o['giftNote']}»'),
                    ]),
                  if ((o['events'] as List).isNotEmpty)
                    _group(context, 'Журнал', [
                      for (final e in (o['events'] as List).cast<Map<String, dynamic>>())
                        _row(context, _when(e['at'] as String), [if (e['status'] != null) e['status'], if (e['note'] != null) e['note']].join('. ')),
                    ]),
                ],
              ),
      ),
    );
  }

  static String _when(String iso) {
    final d = DateTime.parse(iso).toLocal();
    String two(int n) => n.toString().padLeft(2, '0');
    return '${two(d.day)}.${two(d.month)} ${two(d.hour)}:${two(d.minute)}';
  }

  Widget _statusCard(BuildContext context, Map<String, dynamic> o) {
    final c = context.c;
    final color = orderStatusColor(context, o['status'] as String);
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: c.surfaceRaised,
        borderRadius: BorderRadius.circular(Rd.lg),
        border: Border.all(color: c.border, width: 0.6),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                width: 12,
                height: 12,
                decoration: BoxDecoration(color: color, shape: BoxShape.circle),
              ),
              const SizedBox(width: 10),
              Expanded(child: Text(o['statusLabel'] as String, style: AppText.title(context))),
              Text(
                o['amountLabel'] as String,
                style: TextStyle(fontSize: 17, fontWeight: FontWeight.w700, color: c.text),
              ),
            ],
          ),
          if (o['claimed'] == true) ...[const SizedBox(height: 10), Tag('клиент сообщил об оплате', fg: c.warn, bg: c.warnBg, icon: LucideIcons.circleDollarSign)],
          if (o['canEdit'] == true) ...[const SizedBox(height: 14), PrimaryButton(label: 'Сменить статус', icon: LucideIcons.arrowRightLeft, busy: _busy, onPressed: _setStatus)],
        ],
      ),
    );
  }

  Widget _group(BuildContext context, String title, List<Widget> children) => GroupCard(title: title, padding: const EdgeInsets.only(bottom: 16), children: children);

  Widget _row(BuildContext context, String label, String value, {VoidCallback? onTap, bool accent = false}) {
    final c = context.c;
    return InkWell(
      onTap: onTap,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            SizedBox(width: 104, child: Text(label, style: AppText.sub(context))),
            Expanded(
              child: Text(
                value.isEmpty ? '—' : value,
                style: TextStyle(fontSize: 15.5, height: 1.3, color: accent ? c.brandDeep : c.text, fontWeight: accent ? FontWeight.w700 : FontWeight.w500),
              ),
            ),
            if (onTap != null) Icon(LucideIcons.chevronRight, size: 18, color: c.textFaint),
          ],
        ),
      ),
    );
  }

  Widget _note(BuildContext context, String text, Color fg, Color bg) => Container(
    margin: const EdgeInsets.fromLTRB(12, 6, 12, 6),
    padding: const EdgeInsets.all(12),
    decoration: BoxDecoration(color: bg, borderRadius: BorderRadius.circular(Rd.md)),
    child: Text(
      text,
      style: TextStyle(fontSize: 13.5, color: fg, fontWeight: FontWeight.w600, height: 1.3),
    ),
  );
}
