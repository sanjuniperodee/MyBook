import 'dart:async';

import 'package:flutter/material.dart';
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
import '../ui/motion.dart';
import 'book_stages.dart';
import 'order_screen.dart';

/// Оформление заказа — как на сайте (CheckoutForm на телефоне): шаги «Тариф» → «Доставка» (или «Контакты» у электронной)
/// → «Оплата»; итог считает сервер теми же правилами цены (cabinetCheckoutQuote), заказ создаётся теми же проверками.
class CheckoutScreen extends StatefulWidget {
  const CheckoutScreen({super.key, required this.bookId, required this.bookTitle});
  final String bookId;
  final String bookTitle;

  @override
  State<CheckoutScreen> createState() => _CheckoutScreenState();
}

class _CheckoutScreenState extends State<CheckoutScreen> {
  late final ClientSession _session = context.read<ClientSession>();
  v1api.CabinetCheckout? _model;
  v1api.CheckoutQuote? _quote;
  String? _error;
  int _step = 0;
  bool _busy = false;
  String? _submitError;
  Timer? _quoteTimer;

  // Выбор.
  String _plan = '';
  int _qty = 1;
  String _delivery = 'courier';
  final Set<String> _addons = {};
  String? _mode;
  String? _promo;
  bool _surprise = false;
  bool _consent = false;
  String _desiredDate = '';
  final _name = TextEditingController();
  final _phone = TextEditingController();
  final _email = TextEditingController();
  final _country = TextEditingController();
  final _city = TextEditingController();
  final _address = TextEditingController();
  final _postal = TextEditingController();
  final _comment = TextEditingController();
  final _giftNote = TextEditingController();
  final _promoField = TextEditingController();

  v1api.CheckoutPlan? get _planObj => _model?.plans?.where((p) => p.id == _plan).firstOrNull;
  bool get _printed => _planObj?.printed ?? true;
  v1api.CheckoutDelivery? get _deliveryObj => _model?.deliveries?.where((d) => d.id == _delivery).firstOrNull;

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _quoteTimer?.cancel();
    for (final c in [_name, _phone, _email, _country, _city, _address, _postal, _comment, _giftNote, _promoField]) {
      c.dispose();
    }
    super.dispose();
  }

  Future<void> _load() async {
    try {
      final m = await _session.backend.checkout(widget.bookId);
      if (!mounted) return;
      if (m.closed) {
        // Книгу уже заказали — сразу к заказу.
        if (m.orderId != null) {
          Navigator.of(context).pushReplacement(CabinetRoute<void>(builder: (_) => OrderScreen(orderId: m.orderId!)));
        } else {
          Navigator.of(context).maybePop();
        }
        return;
      }
      final plans = m.plans ?? const [];
      setState(() {
        _model = m;
        _plan = plans.where((p) => p.id == 'hardcover').firstOrNull?.id ?? (plans.isEmpty ? '' : plans.first.id);
        _mode = m.agreement == null ? null : 'agreed';
        _name.text = m.defaults?.name ?? '';
        _phone.text = m.defaults?.phone ?? '';
        _email.text = m.defaults?.email ?? '';
        _desiredDate = m.defaults?.desiredDate ?? '';
      });
      _requote();
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    }
  }

  void _requote() {
    _quoteTimer?.cancel();
    _quoteTimer = Timer(const Duration(milliseconds: 150), () async {
      try {
        final q = await _session.backend.quote(
          widget.bookId,
          v1api.CheckoutQuoteBody(plan: _plan, quantity: _qty, delivery: _printed ? _delivery : null, addons: _addons.toList(), promoCode: _promo, mode: _mode),
        );
        if (mounted) setState(() => _quote = q);
      } on ApiException catch (_) {}
    });
  }

  void _setPlan(String id) {
    setState(() {
      _plan = id;
      _addons.removeWhere((a) => !(_planObj?.addons.any((x) => x.id == a) ?? false));
    });
    _requote();
  }

  String? _stepError() {
    if (_step == 1) {
      if (_printed && _delivery != 'pickup') {
        if ((_deliveryObj?.abroad ?? false) && _country.text.trim().length < 2) return 'Укажите страну';
        if (_city.text.trim().isEmpty) return 'Укажите город';
        if (_address.text.trim().length < 5) return 'Укажите адрес';
      }
      if (_name.text.trim().length < 2) return 'Укажите имя';
      if (!RegExp(r'^[+\d][\d\s()-]{9,20}$').hasMatch(_phone.text.trim())) return 'Проверьте номер телефона';
      if (!RegExp(r'^[^@\s]+@[^@\s]+\.[^@\s]+$').hasMatch(_email.text.trim())) return 'Проверьте e-mail';
    }
    return null;
  }

  void _next() {
    final e = _stepError();
    setState(() => _submitError = e);
    if (e == null) setState(() => _step++);
  }

  Future<void> _submit() async {
    if (!_consent) {
      setState(() => _submitError = 'Подтвердите, что проверили макет и принимаете условия');
      return;
    }
    setState(() {
      _busy = true;
      _submitError = null;
    });
    try {
      final id = await _session.backend.placeOrder(
        widget.bookId,
        v1api.OrderPlaceBody(
          plan: _plan,
          quantity: _qty,
          delivery: _printed ? _delivery : null,
          addons: _addons.toList(),
          promoCode: _promo,
          mode: _mode,
          contactName: _name.text.trim(),
          contactPhone: _phone.text.trim(),
          contactEmail: _email.text.trim(),
          country: _country.text.trim(),
          city: _city.text.trim(),
          address: _address.text.trim(),
          postalCode: _postal.text.trim(),
          comment: _comment.text.trim(),
          giftNote: _giftNote.text.trim(),
          desiredDate: _desiredDate,
          surprise: _surprise,
          consent: _consent,
        ),
      );
      if (!mounted) return;
      Navigator.of(context).pushReplacement(CabinetRoute<void>(builder: (_) => OrderScreen(orderId: id)));
    } on ApiException catch (e) {
      if (mounted) setState(() => _submitError = e.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final c = context.c;
    final m = _model;
    final steps = ['Тариф', _printed ? 'Доставка' : 'Контакты', 'Оплата'];
    final hub = context.read<ClientSession>().hubs[widget.bookId];
    void back() => _step > 0 ? setState(() => _step--) : Navigator.of(context).maybePop();
    return Scaffold(
      backgroundColor: c.bg,
      // Шапка и лента книги — общие для всех этапов; «назад» — шаг назад внутри оформления.
      appBar: hub != null
          ? BookHeader(bookId: hub.id, title: hub.title, kind: hub.kind, coverUrl: hub.coverThumbUrl, onBack: back)
          : AppBar(
              backgroundColor: c.bg,
              surfaceTintColor: Colors.transparent,
              leading: IconButton(icon: Icon(LucideIcons.chevronLeft, color: c.textMuted), onPressed: back),
              title: Text(m?.title ?? 'Оформление', style: AppText.serif(context, size: 24, weight: FontWeight.w500)),
            ),
      body: m == null
          ? (_error == null ? const Center(child: CircularProgressIndicator()) : EmptyState(icon: LucideIcons.wifiOff, title: 'Не открылось', hint: _error, action: 'Повторить', onAction: _load))
          : Column(children: [
              if (hub != null) BookStageTabs(hub: hub, active: 'order'),
              _Stepper(steps: steps, current: _step, onGo: (i) => i < _step ? setState(() => _step = i) : null),
              Expanded(
                child: ListView(
                  padding: const EdgeInsets.fromLTRB(16, 16, 16, 24),
                  keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
                  children: [
                    if (_step == 0) ..._planStep(m),
                    if (_step == 1) ..._deliveryStep(m),
                    if (_step == 2) ..._payStep(m),
                  ],
                ),
              ),
              _Footer(
                quote: _quote,
                error: _submitError,
                busy: _busy,
                label: _step < 2 ? 'Далее' : 'Оформить заказ',
                disabled: _step == 2 && (m.blocked ?? false),
                onPressed: _step < 2 ? _next : _submit,
              ),
            ]),
    );
  }

  // ── Шаг 1: тариф, экземпляры, допы, договорённость. ──
  List<Widget> _planStep(v1api.CabinetCheckout m) {
    final c = context.c;
    final plan = _planObj;
    return [
      Text(m.summary ?? '', style: TextStyle(fontSize: 14, color: c.textMuted)),
      const SizedBox(height: 4),
      Text((m.design ?? const []).join(' · '), style: TextStyle(fontSize: 13.5, color: c.textMuted)),
      const SizedBox(height: 18),
      if (m.agreement != null) ...[_Agreement(a: m.agreement!, mode: _mode ?? 'agreed', onMode: (v) {
        setState(() => _mode = v);
        _requote();
      }), const SizedBox(height: 18)],
      _GroupTitle('Тариф'),
      if (m.lockedPlan != null) Padding(padding: const EdgeInsets.only(bottom: 10), child: _Note(text: m.lockedPlan!, tone: 'success')),
      for (final p in m.plans ?? const <v1api.CheckoutPlan>[])
        _Choice(
          selected: _plan == p.id,
          onTap: m.lockedPlan != null ? null : () => _setPlan(p.id),
          title: p.name,
          trailing: Text(p.priceLabel, style: AppText.serif(context, size: 22, weight: FontWeight.w500)),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            for (final f in p.features)
              Padding(
                padding: const EdgeInsets.only(top: 4),
                child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Padding(padding: const EdgeInsets.only(top: 2), child: Icon(LucideIcons.check, size: 14, color: c.success)),
                  const SizedBox(width: 6),
                  Expanded(child: Text(f, style: TextStyle(fontSize: 13.5, height: 1.35, color: c.textMuted))),
                ]),
              ),
          ]),
        ),
      if (plan != null && plan.printed) ...[
        const SizedBox(height: 14),
        _GroupTitle('Экземпляров', hint: plan.extraCopy),
        Row(children: [
          _QtyButton(icon: LucideIcons.minus, onTap: _qty > 1 ? () {
            setState(() => _qty--);
            _requote();
          } : null),
          SizedBox(width: 44, child: Text('$_qty', textAlign: TextAlign.center, style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w500))),
          _QtyButton(icon: LucideIcons.plus, onTap: _qty < 20 ? () {
            setState(() => _qty++);
            _requote();
          } : null),
        ]),
      ],
      if (plan != null && plan.addons.isNotEmpty) ...[
        const SizedBox(height: 18),
        for (final a in plan.addons)
          _Choice(
            check: true,
            selected: _addons.contains(a.id),
            onTap: () {
              setState(() => _addons.contains(a.id) ? _addons.remove(a.id) : _addons.add(a.id));
              _requote();
            },
            title: a.name,
            trailing: Text(a.priceLabel, style: TextStyle(fontSize: 14, color: c.text.withValues(alpha: 0.8))),
            child: Text(a.description, style: TextStyle(fontSize: 13, color: c.textMuted)),
          ),
      ],
    ];
  }

  // ── Шаг 2: доставка и адрес (печатная), получатель, подарок. ──
  List<Widget> _deliveryStep(v1api.CabinetCheckout m) {
    final c = context.c;
    final d = _deliveryObj;
    return [
      if (_printed) ...[
        _GroupTitle('Доставка'),
        for (final o in m.deliveries ?? const <v1api.CheckoutDelivery>[])
          _Choice(
            selected: _delivery == o.id,
            onTap: () {
              setState(() => _delivery = o.id);
              _requote();
            },
            title: o.name,
            trailing: Text(o.priceLabel, textAlign: TextAlign.right, style: TextStyle(fontSize: 13, color: o.quoted ? c.textMuted : c.text)),
            child: Text(o.description, style: TextStyle(fontSize: 13, color: c.textMuted)),
          ),
        if (d?.quoted ?? false) Padding(padding: const EdgeInsets.only(top: 4, bottom: 8), child: _Note(text: m.quotedNote ?? '', tone: 'warn')),
        if (_delivery != 'pickup') ...[
          const SizedBox(height: 10),
          if (d?.abroad ?? false) _Field(label: 'Страна', controller: _country),
          _Field(label: 'Город', controller: _city),
          _Field(label: 'Адрес', controller: _address, hint: 'Улица, дом, квартира'),
          _Field(label: 'Индекс', controller: _postal, keyboard: TextInputType.number),
        ],
        const SizedBox(height: 14),
      ],
      _GroupTitle(_printed ? 'Получатель' : 'Контакты'),
      _Field(label: _printed ? 'Имя получателя' : 'Ваше имя', controller: _name),
      _Field(label: 'Телефон', controller: _phone, keyboard: TextInputType.phone, hint: '+7 7__ ___ __ __'),
      _Field(label: 'E-mail', controller: _email, keyboard: TextInputType.emailAddress),
      _Field(label: 'Комментарий', controller: _comment, lines: 2),
      const SizedBox(height: 14),
      _GroupTitle('Подарок', hint: 'по желанию'),
      if (m.giftNote ?? false) _Field(label: 'Открытка', controller: _giftNote, lines: 3, hint: 'Текст открытки к книге'),
      InkWell(
        onTap: () async {
          final now = DateTime.now();
          final picked = await showDatePicker(context: context, firstDate: now, lastDate: now.add(const Duration(days: 365)), initialDate: DateTime.tryParse(_desiredDate) ?? now.add(const Duration(days: 14)));
          if (picked != null) setState(() => _desiredDate = '${picked.year}-${picked.month.toString().padLeft(2, '0')}-${picked.day.toString().padLeft(2, '0')}');
        },
        child: Padding(
          padding: const EdgeInsets.symmetric(vertical: 10),
          child: Row(children: [
            Icon(LucideIcons.calendarHeart, size: 18, color: c.brand),
            const SizedBox(width: 10),
            Expanded(child: Text(_desiredDate.isEmpty ? 'К какой дате нужна книга' : 'Нужна к $_desiredDate${m.occasionLabel != null ? ' (${m.occasionLabel})' : ''}', style: const TextStyle(fontSize: 15))),
            Icon(LucideIcons.chevronRight, size: 16, color: c.textFaint),
          ]),
        ),
      ),
      CheckboxListTile(
        contentPadding: EdgeInsets.zero,
        controlAffinity: ListTileControlAffinity.leading,
        value: _surprise,
        onChanged: (v) => setState(() => _surprise = v ?? false),
        title: const Text('Это сюрприз — не звонить получателю', style: TextStyle(fontSize: 14.5)),
      ),
    ];
  }

  // ── Шаг 3: проверка макета, промокод, согласие. ──
  List<Widget> _payStep(v1api.CabinetCheckout m) {
    final c = context.c;
    final base = context.read<ClientSession>().backend.url('');
    return [
      Panel(
        padding: const EdgeInsets.all(16),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(m.checkPreview ?? '', style: TextStyle(fontSize: 14.5, height: 1.5, color: c.text.withValues(alpha: 0.85))),
          for (final i in m.issues ?? const <v1api.CheckoutIssue>[])
            Padding(
              padding: const EdgeInsets.only(top: 10),
              child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Icon(i.level == 'error' ? LucideIcons.circleAlert : LucideIcons.triangleAlert, size: 16, color: i.level == 'error' ? c.danger : c.warn),
                const SizedBox(width: 8),
                Expanded(child: Text(i.text, style: TextStyle(fontSize: 14, color: i.level == 'error' ? c.danger : c.warn))),
              ]),
            ),
        ]),
      ),
      const SizedBox(height: 18),
      _GroupTitle('Промокод или сертификат'),
      Row(children: [
        Expanded(child: TextField(controller: _promoField, textCapitalization: TextCapitalization.characters, decoration: const InputDecoration(hintText: 'Код'))),
        const SizedBox(width: 10),
        SizedBox(
          width: 120,
          child: CabinetButton(
            label: 'Применить',
            kind: CabBtn.outline,
            large: false,
            onPressed: () {
              setState(() => _promo = _promoField.text.trim().isEmpty ? null : _promoField.text.trim());
              _requote();
            },
          ),
        ),
      ]),
      if (_quote?.promo != null) Padding(padding: const EdgeInsets.only(top: 6), child: Text(_quote!.promo!.text, style: TextStyle(fontSize: 13.5, color: _quote!.promo!.ok ? c.success : c.danger))),
      const SizedBox(height: 18),
      if (_quote != null) _Summary(q: _quote!),
      const SizedBox(height: 14),
      Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Checkbox(value: _consent, onChanged: (v) => setState(() => _consent = v ?? false)),
        Expanded(
          child: Padding(
            padding: const EdgeInsets.only(top: 12),
            child: Text.rich(TextSpan(children: [
              const TextSpan(text: 'Я проверил(а) макет книги и принимаю '),
              WidgetSpan(child: GestureDetector(onTap: () => launchUrl(Uri.parse('$base${m.offerUrl ?? '/offer'}')), child: Text('условия оферты', style: TextStyle(color: c.brand, decoration: TextDecoration.underline, fontSize: 14)))),
              const TextSpan(text: ' и '),
              WidgetSpan(child: GestureDetector(onTap: () => launchUrl(Uri.parse('$base${m.privacyUrl ?? '/privacy'}')), child: Text('политику конфиденциальности', style: TextStyle(color: c.brand, decoration: TextDecoration.underline, fontSize: 14)))),
            ]), style: const TextStyle(fontSize: 14, height: 1.45)),
          ),
        ),
      ]),
    ];
  }
}

class _Stepper extends StatelessWidget {
  const _Stepper({required this.steps, required this.current, required this.onGo});
  final List<String> steps;
  final int current;
  final ValueChanged<int> onGo;

  @override
  Widget build(BuildContext context) {
    final c = context.c;
    return Container(
      padding: const EdgeInsets.fromLTRB(16, 4, 16, 12),
      decoration: BoxDecoration(border: Border(bottom: BorderSide(color: c.border))),
      child: Row(children: [
        for (var i = 0; i < steps.length; i++) ...[
          if (i > 0) Expanded(child: Container(height: 1, color: i <= current ? c.brand : c.border)),
          GestureDetector(
            onTap: () => onGo(i),
            child: Row(children: [
              Container(
                width: 24,
                height: 24,
                alignment: Alignment.center,
                decoration: BoxDecoration(shape: BoxShape.circle, color: i < current ? c.brand : Colors.transparent, border: Border.all(color: i <= current ? c.brand : c.wallpaperInk)),
                child: i < current ? const Icon(LucideIcons.check, size: 13, color: Colors.white) : Text('${i + 1}', style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: i == current ? c.brand : c.textMuted)),
              ),
              const SizedBox(width: 6),
              Text(steps[i], style: TextStyle(fontSize: 14, fontWeight: i == current ? FontWeight.w600 : FontWeight.w400, color: i <= current ? c.text : c.textMuted)),
            ]),
          ),
        ],
      ]),
    );
  }
}

class _GroupTitle extends StatelessWidget {
  const _GroupTitle(this.title, {this.hint});
  final String title;
  final String? hint;

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.only(bottom: 10),
        child: Row(crossAxisAlignment: CrossAxisAlignment.baseline, textBaseline: TextBaseline.alphabetic, children: [
          Text(title, style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w600)),
          if (hint != null) ...[const SizedBox(width: 8), Flexible(child: Text(hint!, style: TextStyle(fontSize: 13, color: context.c.textMuted)))],
        ]),
      );
}

/// Строка выбора (.option сайта): точка или галочка, заголовок, пояснение, цена справа.
class _Choice extends StatelessWidget {
  const _Choice({required this.selected, required this.onTap, required this.title, required this.child, this.trailing, this.check = false});
  final bool selected;
  final VoidCallback? onTap;
  final String title;
  final Widget child;
  final Widget? trailing;
  final bool check;

  @override
  Widget build(BuildContext context) {
    final c = context.c;
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Material(
        color: selected ? c.bubbleOut.withValues(alpha: 0.45) : c.surfaceRaised,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(Cab.ctl), side: BorderSide(color: selected ? c.brand.withValues(alpha: 0.55) : c.wallpaperInk.withValues(alpha: 0.7), width: selected ? 1.4 : 1)),
        child: InkWell(
          borderRadius: BorderRadius.circular(Cab.ctl),
          onTap: onTap,
          child: Padding(
            padding: const EdgeInsets.all(14),
            child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Icon(check ? (selected ? LucideIcons.squareCheck : LucideIcons.square) : (selected ? LucideIcons.circleDot : LucideIcons.circle), size: 19, color: selected ? c.brand : c.textFaint),
              const SizedBox(width: 12),
              Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [Text(title, style: const TextStyle(fontSize: 15.5, fontWeight: FontWeight.w600)), const SizedBox(height: 2), child])),
              if (trailing != null) ...[const SizedBox(width: 10), ConstrainedBox(constraints: const BoxConstraints(maxWidth: 130), child: trailing!)],
            ]),
          ),
        ),
      ),
    );
  }
}

class _QtyButton extends StatelessWidget {
  const _QtyButton({required this.icon, required this.onTap});
  final IconData icon;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final c = context.c;
    return Material(
      color: c.surfaceRaised,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(Cab.ctl), side: BorderSide(color: c.wallpaperInk)),
      child: InkWell(borderRadius: BorderRadius.circular(Cab.ctl), onTap: onTap, child: SizedBox(width: 44, height: 44, child: Icon(icon, size: 17, color: onTap == null ? c.textFaint : c.text))),
    );
  }
}

class _Field extends StatelessWidget {
  const _Field({required this.label, required this.controller, this.hint, this.keyboard, this.lines = 1});
  final String label;
  final TextEditingController controller;
  final String? hint;
  final TextInputType? keyboard;
  final int lines;

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.only(bottom: 12),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(label, style: TextStyle(fontSize: 13.5, fontWeight: FontWeight.w500, color: context.c.text)),
          const SizedBox(height: 5),
          TextField(controller: controller, keyboardType: keyboard, minLines: lines, maxLines: lines, decoration: InputDecoration(hintText: hint)),
        ]),
      );
}

class _Note extends StatelessWidget {
  const _Note({required this.text, required this.tone});
  final String text;
  final String tone;

  @override
  Widget build(BuildContext context) {
    final c = context.c;
    final (bg, fg) = tone == 'success' ? (c.success.withValues(alpha: 0.12), c.success) : (c.warnBg, c.warn);
    return Container(width: double.infinity, padding: const EdgeInsets.all(12), decoration: BoxDecoration(color: bg, borderRadius: BorderRadius.circular(Cab.ctl)), child: Text(text, style: TextStyle(fontSize: 14, height: 1.4, color: fg)));
  }
}

class _Agreement extends StatelessWidget {
  const _Agreement({required this.a, required this.mode, required this.onMode});
  final v1api.CheckoutAgreement a;
  final String mode;
  final ValueChanged<String> onMode;

  @override
  Widget build(BuildContext context) {
    final c = context.c;
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(color: c.success.withValues(alpha: 0.1), borderRadius: BorderRadius.circular(Cab.panel), border: Border.all(color: c.success.withValues(alpha: 0.25))),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text(a.title, style: const TextStyle(fontSize: 15.5, fontWeight: FontWeight.w600)),
        const SizedBox(height: 4),
        Text(a.summary, style: TextStyle(fontSize: 14, color: c.text.withValues(alpha: 0.85))),
        if (a.batch != null) Text(a.batch!, style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w500)),
        if (a.gifts != null) Text(a.gifts!, style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w500)),
        const SizedBox(height: 12),
        for (final o in a.modes) _Choice(selected: mode == o.id, onTap: () => onMode(o.id), title: o.title, child: Text(o.hint, style: TextStyle(fontSize: 12.5, color: c.textMuted))),
        GestureDetector(onTap: () => launchUrl(Uri.parse(a.whatsapp), mode: LaunchMode.externalApplication), child: Text(a.refund, style: TextStyle(fontSize: 12.5, color: c.text.withValues(alpha: 0.8), decoration: TextDecoration.underline))),
      ]),
    );
  }
}

/// Итог: строки чека и «К оплате» засечками.
class _Summary extends StatelessWidget {
  const _Summary({required this.q});
  final v1api.CheckoutQuote q;

  @override
  Widget build(BuildContext context) {
    final c = context.c;
    return Panel(
      padding: const EdgeInsets.all(16),
      child: Column(children: [
        for (final l in q.lines)
          Padding(
            padding: const EdgeInsets.only(bottom: 6),
            child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Expanded(child: Text(l.label, style: TextStyle(fontSize: 14, color: l.tone == 'success' ? c.success : c.textMuted))),
              const SizedBox(width: 10),
              Text(l.value, style: TextStyle(fontSize: 14, color: l.tone == 'success' ? c.success : (l.tone == 'muted' ? c.textMuted : c.text), fontFeatures: const [FontFeature.tabularFigures()])),
            ]),
          ),
        Divider(color: c.border, height: 18),
        Row(crossAxisAlignment: CrossAxisAlignment.baseline, textBaseline: TextBaseline.alphabetic, children: [
          Expanded(child: Text(q.totalLabel, style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w500))),
          Text(q.total, style: AppText.serif(context, size: 28, weight: FontWeight.w500)),
        ]),
        if (q.quotedTotal != null) Align(alignment: Alignment.centerRight, child: Text(q.quotedTotal!, style: TextStyle(fontSize: 12, color: c.textMuted))),
      ]),
    );
  }
}

/// Нижняя панель: итог одной строкой и кнопка шага.
class _Footer extends StatelessWidget {
  const _Footer({required this.quote, required this.error, required this.busy, required this.label, required this.onPressed, this.disabled = false});
  final v1api.CheckoutQuote? quote;
  final String? error;
  final bool busy;
  final String label;
  final VoidCallback onPressed;
  final bool disabled;

  @override
  Widget build(BuildContext context) {
    final c = context.c;
    return Container(
      padding: const EdgeInsets.fromLTRB(16, 10, 16, 10),
      decoration: BoxDecoration(color: c.bg, border: Border(top: BorderSide(color: c.border))),
      child: SafeArea(
        top: false,
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          if (error != null) Padding(padding: const EdgeInsets.only(bottom: 8), child: Text(error!, style: TextStyle(fontSize: 14, color: c.danger))),
          Row(children: [
            if (quote != null)
              Padding(
                padding: const EdgeInsets.only(right: 14),
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, mainAxisSize: MainAxisSize.min, children: [
                  Text(quote!.totalLabel, style: TextStyle(fontSize: 12, color: c.textMuted)),
                  Text(quote!.total, style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w600, fontFeatures: [FontFeature.tabularFigures()])),
                ]),
              ),
            Expanded(child: CabinetButton(label: label, busy: busy, onPressed: disabled ? null : onPressed, large: false)),
          ]),
        ]),
      ),
    );
  }
}
