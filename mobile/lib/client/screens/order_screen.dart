import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_svg/flutter_svg.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:provider/provider.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../api/mybook_api.g.dart' as v1api;
import '../../core/api.dart';
import '../../ui/kit.dart';
import '../../ui/tokens.dart';
import '../data/session.dart';
import '../ui/book_chrome.dart';
import '../ui/cabinet.dart';
import 'review_screen.dart';
import '../ui/motion.dart';

/// Заказ — как на сайте (/orders/[id]): номер и статус, «что сейчас» засечками, этапы, трек-номер, оплата (Kaspi Pay —
/// счёт в приложение Kaspi по номеру или QR, перевод по реквизитам), детали и чек, отмена заказа.
class OrderScreen extends StatefulWidget {
  const OrderScreen({super.key, required this.orderId});
  final String orderId;

  @override
  State<OrderScreen> createState() => _OrderScreenState();
}

class _OrderScreenState extends State<OrderScreen> {
  late final ClientSession _session = context.read<ClientSession>();
  v1api.CabinetOrder? _order;
  v1api.ReviewView? _review;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final o = await _session.backend.order(widget.orderId);
      if (mounted) {
        setState(() {
          _order = o;
          _error = null;
        });
      }
      // Отзыв — как карточка в заказе сайта: только когда книга уже у клиента (canReview).
      try {
        final r = await _session.backend.call(() => _session.backend.contract.reviewGet(orderId: widget.orderId));
        if (mounted) setState(() => _review = r);
      } on ApiException catch (_) {}
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    }
  }

  Future<void> _cancel(v1api.CabinetOrderPaymentCancel t) async {
    if (!await confirm(context, title: t.title, message: t.text, ok: t.confirm, destructive: true)) return;
    try {
      await _session.backend.cancelOrder(widget.orderId);
      await _load();
    } on ApiException catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
    }
  }

  @override
  Widget build(BuildContext context) {
    final c = context.c;
    final o = _order;
    return Scaffold(
      backgroundColor: c.bg,
      appBar: AppBar(backgroundColor: c.bg, surfaceTintColor: Colors.transparent, leading: IconButton(icon: Icon(LucideIcons.chevronLeft, color: c.textMuted), onPressed: () => Navigator.of(context).maybePop())),
      body: o == null
          ? (_error == null ? const Center(child: CircularProgressIndicator()) : EmptyState(icon: LucideIcons.wifiOff, title: 'Заказ не открылся', hint: _error, action: 'Повторить', onAction: _load))
          : RefreshIndicator(
              color: c.brand,
              onRefresh: _load,
              child: ListView(
                physics: const AlwaysScrollableScrollPhysics(parent: BouncingScrollPhysics()),
                padding: const EdgeInsets.fromLTRB(16, 4, 16, 40),
                children: [
                  Wrap(crossAxisAlignment: WrapCrossAlignment.center, spacing: 12, runSpacing: 6, children: [
                    Text(o.title, style: AppText.serif(context, size: 36, weight: FontWeight.w500).copyWith(height: 1)),
                    StatusBadge(label: o.statusLabel, tone: o.tone),
                  ]),
                  const SizedBox(height: 6),
                  Text(o.created, style: TextStyle(fontSize: 14, color: c.textMuted)),
                  Text(o.bookTitle, style: AppText.serif(context, size: 18).copyWith(color: c.text.withValues(alpha: 0.8))),
                  const SizedBox(height: 20),
                  Enter(key: const ValueKey('now'), i: 0, child: _Now(o: o)),
                  if (o.payment != null) ...[const SizedBox(height: 20), Enter(key: const ValueKey('pay'), i: 1, child: _Payment(order: o, onChanged: _load, onCancel: () => _cancel(o.payment!.cancel)))],
                  if (_review != null && _review!.canReview) ...[
                    const SizedBox(height: 20),
                    ReviewCard(
                      v: _review!,
                      onOpen: () async {
                        final v = await Navigator.of(context).push<v1api.ReviewView>(CabinetRoute(builder: (_) => ReviewScreen(orderId: widget.orderId, view: _review!)));
                        if (v != null && mounted) setState(() => _review = v);
                      },
                    ),
                  ],
                  const SizedBox(height: 20),
                  _Details(o: o),
                ],
              ),
            ),
    );
  }
}

class _Now extends StatelessWidget {
  const _Now({required this.o});
  final v1api.CabinetOrder o;

  @override
  Widget build(BuildContext context) {
    final c = context.c;
    return Panel(
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(crossAxisAlignment: CrossAxisAlignment.baseline, textBaseline: TextBaseline.alphabetic, children: [
          Expanded(child: Text(o.nowTitle, style: AppText.serif(context, size: 30, weight: FontWeight.w500).copyWith(height: 1.1))),
          if (o.stepOf != null) Text(o.stepOf!, style: TextStyle(fontSize: 13.5, color: c.textMuted)),
        ]),
        const SizedBox(height: 8),
        Text(o.nowText, style: TextStyle(fontSize: 15.5, height: 1.55, color: c.text.withValues(alpha: 0.85))),
        if (o.steps.isNotEmpty) ...[const SizedBox(height: 22), _Track(steps: o.steps)],
        if (o.trackingNumber != null) ...[
          const SizedBox(height: 18),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
            decoration: BoxDecoration(color: c.surface, borderRadius: BorderRadius.circular(Cab.ctl)),
            child: Row(children: [
              Icon(LucideIcons.truck, size: 17, color: c.brand),
              const SizedBox(width: 10),
              Text(o.trackingLabel, style: TextStyle(fontSize: 14, color: c.textMuted)),
              const SizedBox(width: 8),
              Expanded(child: SelectableText(o.trackingNumber!, style: const TextStyle(fontSize: 14.5, fontWeight: FontWeight.w600, fontFamily: 'Menlo'))),
            ]),
          ),
        ],
      ]),
    );
  }
}

/// Линейка этапов (StatusTrack): пройденные — винные с галочкой, текущий — с кольцом, будущие — пустые.
class _Track extends StatelessWidget {
  const _Track({required this.steps});
  final List<v1api.CabinetOrderSteps> steps;

  @override
  Widget build(BuildContext context) {
    final c = context.c;
    return Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
      for (var i = 0; i < steps.length; i++)
        Expanded(
          child: Column(children: [
            Row(children: [
              Expanded(child: Container(height: 2, color: i == 0 ? Colors.transparent : (steps[i].state != 'todo' ? c.brand : c.border))),
              Container(
                width: 22,
                height: 22,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  color: steps[i].state == 'done' ? c.brand : c.surfaceRaised,
                  border: Border.all(color: steps[i].state == 'todo' ? c.wallpaperInk : c.brand, width: steps[i].state == 'current' ? 3 : 1.5),
                ),
                child: steps[i].state == 'done' ? const Icon(LucideIcons.check, size: 12, color: Colors.white) : null,
              ),
              Expanded(child: Container(height: 2, color: i == steps.length - 1 ? Colors.transparent : (steps[i + 1].state != 'todo' ? c.brand : c.border))),
            ]),
            const SizedBox(height: 6),
            Text(steps[i].label, textAlign: TextAlign.center, style: TextStyle(fontSize: 11.5, height: 1.2, fontWeight: steps[i].state == 'current' ? FontWeight.w600 : FontWeight.w400, color: steps[i].state == 'todo' ? c.textMuted : c.text)),
          ]),
        ),
    ]);
  }
}

/// Оплата: Kaspi Pay (счёт по номеру или QR, ждём подтверждения), перевод по реквизитам, отмена заказа.
class _Payment extends StatefulWidget {
  const _Payment({required this.order, required this.onChanged, required this.onCancel});
  final v1api.CabinetOrder order;
  final Future<void> Function() onChanged;
  final VoidCallback onCancel;

  @override
  State<_Payment> createState() => _PaymentState();
}

class _PaymentState extends State<_Payment> {
  late final ClientSession _session = context.read<ClientSession>();
  late final TextEditingController _phone = TextEditingController(text: widget.order.payment?.kaspi?.defaultPhone ?? '');
  late v1api.KaspiInvoice? _invoice = widget.order.payment?.kaspi?.current;
  bool _busy = false;
  String? _error;
  Timer? _poll;

  @override
  void initState() {
    super.initState();
    if (_invoice?.status == 'pending') _startPoll();
  }

  @override
  void dispose() {
    _poll?.cancel();
    _phone.dispose();
    super.dispose();
  }

  void _startPoll() {
    _poll?.cancel();
    _poll = Timer.periodic(const Duration(seconds: 4), (_) async {
      final inv = _invoice;
      if (inv == null) return;
      try {
        final next = await _session.backend.kaspiStatus(widget.order.id, inv.id);
        if (!mounted) return;
        setState(() => _invoice = next);
        if (next.status != 'pending') {
          _poll?.cancel();
          if (next.status == 'paid') Future<void>.delayed(const Duration(milliseconds: 1200), widget.onChanged);
        }
      } on ApiException catch (_) {}
    });
  }

  Future<void> _issue(String method) async {
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final inv = await _session.backend.kaspiPay(widget.order.id, method, _phone.text.trim());
      if (!mounted) return;
      setState(() => _invoice = inv);
      _startPoll();
      if (method == 'invoice' && inv.link != null) launchUrl(Uri.parse(inv.link!), mode: LaunchMode.externalApplication);
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _claim() async {
    try {
      await _session.backend.claimPayment(widget.order.id);
      await widget.onChanged();
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    }
  }

  @override
  Widget build(BuildContext context) {
    final c = context.c;
    final p = widget.order.payment!;
    final k = p.kaspi;
    final inv = _invoice;
    final closed = inv != null && inv.status != 'pending' && inv.status != 'paid'
        ? switch (inv.status) {
            'failed' => k?.failed,
            'cancelled' => k?.cancelled,
            _ => k?.expired,
          }
        : null;
    return Panel(
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(crossAxisAlignment: CrossAxisAlignment.baseline, textBaseline: TextBaseline.alphabetic, children: [
          Expanded(child: Text(p.title, style: AppText.serif(context, size: 26, weight: FontWeight.w500))),
          Text(p.amount, style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w600, fontFeatures: [FontFeature.tabularFigures()])),
        ]),
        const SizedBox(height: 14),
        if (k != null) ...[
          Row(children: [Icon(LucideIcons.smartphone, size: 18, color: c.brand), const SizedBox(width: 8), Text(k.title, style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w600))]),
          const SizedBox(height: 10),
          if (inv?.status == 'paid')
            _Banner(text: k.paid, tone: 'success')
          else if (inv?.status == 'pending') ...[
            if (inv!.method == 'qr' && inv.qrSvg != null) ...[
              Center(child: Container(padding: const EdgeInsets.all(10), decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(12), border: Border.all(color: c.border)), child: SvgPicture.string(inv.qrSvg!, width: 200, height: 200))),
              const SizedBox(height: 10),
              Text(k.scanQr, style: TextStyle(fontSize: 14.5, height: 1.5, color: c.text.withValues(alpha: 0.85))),
            ] else
              Text(k.sentSteps, style: TextStyle(fontSize: 14.5, height: 1.5, color: c.text.withValues(alpha: 0.85))),
            if (inv.link != null) ...[const SizedBox(height: 12), CabinetButton(label: k.openKaspi, icon: LucideIcons.externalLink, large: false, onPressed: () => launchUrl(Uri.parse(inv.link!), mode: LaunchMode.externalApplication))],
            const SizedBox(height: 10),
            Row(children: [const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2)), const SizedBox(width: 10), Text(k.waiting, style: TextStyle(fontSize: 14, color: c.textMuted))]),
          ] else ...[
            if (closed != null) Padding(padding: const EdgeInsets.only(bottom: 10), child: _Banner(text: closed, tone: 'warn')),
            Text(k.phoneLabel, style: const TextStyle(fontSize: 13.5, fontWeight: FontWeight.w500)),
            const SizedBox(height: 5),
            TextField(controller: _phone, keyboardType: TextInputType.phone, decoration: const InputDecoration(hintText: '+7 7XX XXX XX XX')),
            const SizedBox(height: 6),
            Text(k.invoiceNote, style: TextStyle(fontSize: 13, color: c.textMuted)),
            const SizedBox(height: 14),
            CabinetButton(label: closed != null ? k.again : k.sendInvoice, icon: LucideIcons.smartphone, busy: _busy, onPressed: () => _issue('invoice')),
            const SizedBox(height: 10),
            CabinetButton(label: k.payByQr, icon: LucideIcons.qrCode, kind: CabBtn.outline, onPressed: _busy ? null : () => _issue('qr')),
          ],
          if (_error != null) Padding(padding: const EdgeInsets.only(top: 10), child: Text(_error!, style: TextStyle(color: c.danger, fontSize: 14))),
        ],
        if (p.manual != null) ...[
          if (k != null) Divider(color: c.border, height: 32),
          Text(p.manual!.title, style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w600)),
          const SizedBox(height: 8),
          for (var i = 0; i < p.manual!.steps.length; i++)
            Padding(
              padding: const EdgeInsets.only(bottom: 6),
              child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text('${i + 1}.', style: TextStyle(fontSize: 14.5, color: c.textMuted)),
                const SizedBox(width: 8),
                Expanded(child: SelectableText(p.manual!.steps[i], style: const TextStyle(fontSize: 14.5, height: 1.45))),
              ]),
            ),
          const SizedBox(height: 8),
          if (p.manual!.claimed != null) _Banner(text: p.manual!.claimed!, tone: 'success') else CabinetButton(label: p.manual!.claim, kind: CabBtn.outline, large: false, onPressed: _claim),
        ],
        if (k == null && p.manual == null) Text(p.unavailable, style: TextStyle(fontSize: 14.5, color: c.text.withValues(alpha: 0.85))),
        Divider(color: c.border, height: 32),
        GestureDetector(onTap: widget.onCancel, child: Text(p.cancel.label, style: TextStyle(fontSize: 14, color: c.textMuted, decoration: TextDecoration.underline))),
      ]),
    );
  }
}

class _Banner extends StatelessWidget {
  const _Banner({required this.text, required this.tone});
  final String text;
  final String tone;

  @override
  Widget build(BuildContext context) {
    final c = context.c;
    final (bg, fg) = tone == 'success' ? (c.success.withValues(alpha: 0.12), c.success) : (c.warnBg, c.warn);
    return Container(width: double.infinity, padding: const EdgeInsets.all(12), decoration: BoxDecoration(color: bg, borderRadius: BorderRadius.circular(Cab.ctl)), child: Text(text, style: TextStyle(fontSize: 14.5, height: 1.4, color: fg)));
  }
}

class _Details extends StatelessWidget {
  const _Details({required this.o});
  final v1api.CabinetOrder o;

  @override
  Widget build(BuildContext context) {
    final c = context.c;
    return Panel(
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text(o.detailsTitle, style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w600)),
        const SizedBox(height: 12),
        for (final f in o.facts)
          Padding(
            padding: const EdgeInsets.only(bottom: 10),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(f.label, style: TextStyle(fontSize: 12.5, color: c.textMuted)),
              const SizedBox(height: 2),
              Text(f.value, style: const TextStyle(fontSize: 15, height: 1.4)),
            ]),
          ),
        Divider(color: c.border, height: 20),
        for (final l in o.lines)
          Padding(
            padding: const EdgeInsets.only(bottom: 6),
            child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Expanded(child: Text(l.label, style: TextStyle(fontSize: 14, color: l.tone == 'success' ? c.success : c.textMuted))),
              Text(l.value, style: TextStyle(fontSize: 14, color: l.tone == 'success' ? c.success : (l.tone == 'muted' ? c.textMuted : c.text))),
            ]),
          ),
        Divider(color: c.border, height: 18),
        Row(children: [
          Expanded(child: Text(o.totalLabel, style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w600))),
          Text(o.total, style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w600)),
        ]),
        if (o.quotedNote != null) Padding(padding: const EdgeInsets.only(top: 8), child: Text(o.quotedNote!, style: TextStyle(fontSize: 12.5, height: 1.45, color: c.textMuted))),
      ]),
    );
  }
}

/// «Мои заказы» — как на сайте (/orders): номер, книга, статус, сумма, «Перейти к оплате».
class OrdersScreen extends StatefulWidget {
  const OrdersScreen({super.key});

  @override
  State<OrdersScreen> createState() => _OrdersScreenState();
}

class _OrdersScreenState extends State<OrdersScreen> {
  late final ClientSession _session = context.read<ClientSession>();
  v1api.CabinetOrders? _list;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final l = await _session.backend.orders();
      if (mounted) {
        setState(() {
          _list = l;
          _error = null;
        });
      }
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    }
  }

  @override
  Widget build(BuildContext context) {
    final c = context.c;
    final l = _list;
    return Scaffold(
      backgroundColor: c.bg,
      appBar: const CabinetTopBar(title: 'Мои заказы'),
      body: l == null
          ? (_error == null ? const Center(child: CircularProgressIndicator()) : EmptyState(icon: LucideIcons.wifiOff, title: 'Не загрузилось', hint: _error, action: 'Повторить', onAction: _load))
          : RefreshIndicator(
              color: c.brand,
              onRefresh: _load,
              child: l.orders.isEmpty
                  ? ListView(children: [const SizedBox(height: 80), EmptyState(icon: LucideIcons.package, title: l.empty, hint: l.emptyText)])
                  : ListView(
                      physics: const AlwaysScrollableScrollPhysics(parent: BouncingScrollPhysics()),
                      padding: const EdgeInsets.fromLTRB(16, 20, 16, 32),
                      children: [
                        Text(l.lead, style: TextStyle(fontSize: 15, color: c.textMuted)),
                        const SizedBox(height: 16),
                        for (final o in l.orders)
                          Padding(
                            padding: const EdgeInsets.only(bottom: 12),
                            child: Material(
                              color: c.surfaceRaised,
                              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(Cab.panel), side: BorderSide(color: c.border)),
                              child: InkWell(
                                borderRadius: BorderRadius.circular(Cab.panel),
                                onTap: () async {
                                  await Navigator.of(context).push(CabinetRoute<void>(builder: (_) => OrderScreen(orderId: o.id)));
                                  _load();
                                },
                                child: Padding(
                                  padding: const EdgeInsets.all(16),
                                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                                    Row(children: [
                                      Expanded(child: Text(o.title, style: AppText.serif(context, size: 22, weight: FontWeight.w500))),
                                      StatusBadge(label: o.statusLabel, tone: o.tone),
                                    ]),
                                    const SizedBox(height: 4),
                                    Text(o.bookTitle, style: TextStyle(fontSize: 15, color: c.text.withValues(alpha: 0.85))),
                                    const SizedBox(height: 8),
                                    Row(children: [
                                      Text(o.created, style: TextStyle(fontSize: 13.5, color: c.textMuted)),
                                      const Spacer(),
                                      Text(o.amount, style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w600)),
                                    ]),
                                    if (o.pay != null) ...[
                                      const SizedBox(height: 10),
                                      Row(children: [Text(o.pay!, style: TextStyle(fontSize: 14.5, fontWeight: FontWeight.w500, color: c.brand)), Icon(LucideIcons.chevronRight, size: 16, color: c.brand)]),
                                    ],
                                  ]),
                                ),
                              ),
                            ),
                          ),
                      ],
                    ),
            ),
    );
  }
}
