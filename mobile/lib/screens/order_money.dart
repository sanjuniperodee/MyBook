import 'dart:io';

import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:http/http.dart' as http;
import 'package:http_parser/http_parser.dart';
import 'package:image_picker/image_picker.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:mime/mime.dart';
import 'package:provider/provider.dart';
import 'package:uuid/uuid.dart';

import '../api/mybook_api.g.dart' as v1api;
import '../core/api.dart';
import '../core/auth.dart';
import '../core/format.dart';
import '../core/v1.dart';
import '../ui/kit.dart';
import '../ui/tokens.dart';
import '../widgets/crm_form.dart';

/// Деньги заказа — как лист «Оплата» и «Тариф и цена» карточки заказа на сайте: к оплате, получено, платежи с чеками;
/// принять оплату с чеком, вернуть переплату, отменить ошибочный платёж, сверить оплату, постоплата, тариф и цена,
/// просьба руководителю о цене оплаченного. Данные — API v1 (crmOrderMoney и действия), правила — те же, что у сайта.
class OrderMoneySection extends StatefulWidget {
  const OrderMoneySection({super.key, required this.orderId, required this.onChanged});
  final String orderId;

  /// Деньги изменились: карточке заказа — перечитать статус и сумму.
  final VoidCallback onChanged;

  @override
  State<OrderMoneySection> createState() => OrderMoneySectionState();
}

class OrderMoneySectionState extends State<OrderMoneySection> {
  v1api.OrderMoney? _m;
  String? _error;

  ApiClient get _api => context.read<AuthState>().api;

  @override
  void initState() {
    super.initState();
    load();
  }

  Future<void> load() async {
    try {
      final m = await v1(_api, (c) => c.crmOrderMoney(orderId: widget.orderId));
      if (mounted) {
        setState(() {
          _m = m;
          _error = null;
        });
      }
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    }
  }

  void _toast(String text) {
    if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(text)));
  }

  /// Действие с текстом итога: успех — плашка и перечитать, отказ сервера — его текст.
  Future<void> _run(Future<v1api.Done> Function(v1api.MybookApi c) call) async {
    try {
      final r = await v1(_api, call);
      HapticFeedback.mediumImpact();
      _toast(r.message ?? 'Сохранено');
      await load();
      widget.onChanged();
    } on ApiException catch (e) {
      _toast(e.message);
    }
  }

  Future<void> _pay({required bool refund}) async {
    final m = _m!;
    final ok = await showAppSheet<bool>(
      context,
      title: refund ? 'Вернуть деньги' : 'Принять оплату',
      icon: refund ? LucideIcons.undo2 : LucideIcons.banknote,
      full: true,
      builder: (_) => _OrderPayForm(api: _api, money: m, refund: refund),
    );
    if (ok == true) {
      _toast(refund ? 'Возврат записан' : 'Оплата записана');
      await load();
      widget.onChanged();
    }
  }

  Future<void> _paymentMenu(v1api.OrderPayment p) async {
    final m = _m!;
    final canVoid = m.canVoid && !p.voided;
    final canReview = m.canReview && !p.voided && p.reviewed == null && p.kind == 'payment';
    if (!canVoid && !canReview) return;
    final r = await showAppSheet<String>(
      context,
      title: '${p.kind == 'refund' ? 'Возврат' : 'Оплата'} ${money(p.amount)}',
      builder: (sheet) {
        return GroupCard(
          padding: const EdgeInsets.fromLTRB(16, 4, 16, 24),
          children: [
            if (canReview) GroupTile(title: 'Сверено с выпиской', subtitle: 'деньги пришли на счёт', icon: LucideIcons.badgeCheck, onTap: () => Navigator.pop(sheet, 'review')),
            if (canVoid)
              GroupTile(
                title: 'Отменить платёж',
                subtitle: 'ошибочная запись: из «получено» уйдёт, в журнале останется',
                icon: LucideIcons.ban,
                destructive: true,
                onTap: () => Navigator.pop(sheet, 'void'),
              ),
          ],
        );
      },
    );
    if (!mounted) return;
    if (r == 'review') return _run((c) => c.crmOrderPaymentReview(paymentId: p.id));
    if (r == 'void') {
      final why = await promptText(context, title: 'Причина отмены платежа', hint: 'например: не тот заказ', ok: 'Отменить платёж');
      if (why != null && why.length >= 3)
        await _run(
          (c) => c.crmOrderPaymentVoid(
            paymentId: p.id,
            body: v1api.ReasonBody(reason: why),
          ),
        );
    }
  }

  Future<void> _postpay() async {
    final why = await promptText(context, title: 'В печать с постоплатой', hint: 'о чём договорились с клиентом', ok: 'В печать');
    if (why == null) return;
    if (why.length < 3) return _toast('Укажите, о чём договорились с клиентом');
    await _run(
      (c) => c.crmOrderPostpay(
        orderId: widget.orderId,
        body: v1api.ReasonBody(reason: why),
      ),
    );
  }

  Future<void> _terms() async {
    final m = _m!;
    final r = await showAppSheet<bool>(
      context,
      title: 'Тариф и цена',
      icon: LucideIcons.tag,
      full: true,
      builder: (_) => _TermsForm(api: _api, money: m),
    );
    if (r == true) {
      await load();
      widget.onChanged();
    }
  }

  Future<void> _repriceRequest() async {
    final price = await promptText(context, title: 'Договорённая цена, ₸', hint: 'например 25000', ok: 'Дальше');
    final n = int.tryParse((price ?? '').replaceAll(RegExp(r'\D'), ''));
    if (n == null || n <= 0 || !mounted) return;
    final why = await promptText(context, title: 'О чём договорились', hint: 'руководитель увидит это в уведомлении', ok: 'Отправить', lines: 3);
    if (why == null) return;
    await _run(
      (c) => c.crmOrderRepriceRequest(
        orderId: widget.orderId,
        body: v1api.RepriceRequestBody(price: n, reason: why),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final c = context.c;
    final m = _m;
    if (m == null) {
      return _error == null
          ? const Padding(
              padding: EdgeInsets.symmetric(vertical: 24),
              child: Center(child: CircularProgressIndicator()),
            )
          : GroupCard(
              title: 'Оплата',
              padding: const EdgeInsets.only(bottom: 16),
              children: [GroupTile(title: 'Не удалось загрузить оплату', subtitle: _error, icon: LucideIcons.wifiOff, onTap: load)],
            );
    }
    final outstanding = m.amount - m.received;
    final paidInFull = m.amount > 0 && m.received >= m.amount;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        GroupCard(
          title: 'Оплата',
          padding: const EdgeInsets.only(bottom: 16),
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(14, 14, 14, 10),
              child: Row(
                children: [
                  _figure(context, 'К оплате', money(m.amount)),
                  _figure(context, 'Получено', money(m.received), color: paidInFull ? c.success : null),
                  if (outstanding > 0 && !m.cancelled) _figure(context, 'Осталось', money(outstanding), color: c.warn),
                  if (m.refundable > 0) _figure(context, m.cancelled ? 'Вернуть' : 'Переплата', money(m.refundable), color: c.danger),
                ],
              ),
            ),
            if (m.postpay) _note(context, 'В печати с постоплатой — клиент заплатит после', c.violet, c.violetBg),
            for (final p in m.payments) _payment(context, p, m),
            if (m.canEdit && !m.cancelled) GroupTile(title: 'Принять оплату', subtitle: 'с чеком и формой оплаты', icon: LucideIcons.banknote, onTap: () => _pay(refund: false)),
            if (m.canEdit && m.refundable > 0)
              GroupTile(
                title: 'Вернуть ${money(m.refundable)}',
                subtitle: m.cancelled ? 'заказ отменён — можно вернуть всё полученное' : 'переплата',
                icon: LucideIcons.undo2,
                onTap: () => _pay(refund: true),
              ),
            if (m.canEdit && !m.settled && !m.postpay && !m.cancelled && m.printed)
              GroupTile(title: 'В печать с постоплатой', subtitle: 'договорились, что клиент заплатит после', icon: LucideIcons.printer, onTap: _postpay),
          ],
        ),
        if (m.canTerms || m.canRequestReprice)
          GroupCard(
            title: 'Тариф и цена',
            padding: const EdgeInsets.only(bottom: 16),
            children: [
              GroupTile(
                title: m.plans.where((p) => p.id == m.plan).map((p) => p.label).firstOrNull ?? m.plan,
                subtitle: m.agreed == null ? 'по прайсу' : 'договорённая цена ${money(m.agreed!)}',
                icon: LucideIcons.tag,
                onTap: m.canTerms ? _terms : null,
              ),
              if (m.canRequestReprice)
                GroupTile(title: 'Попросить руководителя изменить цену', subtitle: 'заказ оплачен — цену меняет руководитель', icon: LucideIcons.messageSquareWarning, onTap: _repriceRequest),
            ],
          ),
      ],
    );
  }

  Widget _figure(BuildContext context, String label, String value, {Color? color}) => Expanded(
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(label, style: AppText.caption(context)),
        const SizedBox(height: 2),
        Text(
          value,
          style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700, color: color ?? context.c.text, fontFeatures: const [FontFeature.tabularFigures()]),
        ),
      ],
    ),
  );

  Widget _payment(BuildContext context, v1api.OrderPayment p, v1api.OrderMoney m) {
    final c = context.c;
    final d = DateTime.tryParse(p.at)?.toLocal();
    final refund = p.kind == 'refund';
    final parts = [if (d != null) '${two(d.day)}.${two(d.month)}.${d.year}', p.method, ?p.payForm, if (p.receipt) 'чек', ?p.by];
    final actionable = (m.canVoid && !p.voided) || (m.canReview && !p.voided && p.reviewed == null && !refund);
    return InkWell(
      onTap: actionable ? () => _paymentMenu(p) : null,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 11),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Icon(refund ? LucideIcons.undo2 : LucideIcons.circleArrowDown, size: 19, color: p.voided ? c.textFaint : (refund ? c.danger : c.success)),
            const SizedBox(width: 10),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    '${refund ? '−' : ''}${money(p.amount)}',
                    style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700, color: p.voided ? c.textFaint : c.text, decoration: p.voided ? TextDecoration.lineThrough : null),
                  ),
                  Text(parts.join(' · '), style: AppText.caption(context)),
                  if (p.note != null) Text(p.note!, style: AppText.caption(context).copyWith(color: c.text)),
                  if (p.voided) Text('отменён: ${p.voidReason ?? ''}', style: AppText.caption(context).copyWith(color: c.danger)),
                  if (p.reviewed != null) Text('сверено: ${p.reviewed}', style: AppText.caption(context).copyWith(color: c.success)),
                ],
              ),
            ),
            if (actionable) Icon(LucideIcons.ellipsis, size: 18, color: c.textFaint),
          ],
        ),
      ),
    );
  }

  Widget _note(BuildContext context, String text, Color fg, Color bg) => Container(
    margin: const EdgeInsets.fromLTRB(12, 0, 12, 8),
    padding: const EdgeInsets.all(10),
    decoration: BoxDecoration(color: bg, borderRadius: BorderRadius.circular(Rd.md)),
    child: Text(
      text,
      style: TextStyle(fontSize: 13.5, color: fg, fontWeight: FontWeight.w600),
    ),
  );
}

/// Оплата или возврат по заказу: сумма, форма оплаты, чек (для оплаты — обязательно), примечание / причина.
class _OrderPayForm extends StatefulWidget {
  const _OrderPayForm({required this.api, required this.money, required this.refund});
  final ApiClient api;
  final v1api.OrderMoney money;
  final bool refund;

  @override
  State<_OrderPayForm> createState() => _OrderPayFormState();
}

class _OrderPayFormState extends State<_OrderPayForm> {
  late final _amount = TextEditingController(
    text: () {
      final m = widget.money;
      final v = widget.refund ? m.refundable : m.amount - m.received;
      return v > 0 ? '$v' : '';
    }(),
  );
  final _note = TextEditingController();
  String? _payForm;
  File? _receipt;
  String? _error;
  bool _busy = false;
  // Один ключ на форму: повтор после сбоя сети не запишет второй платёж.
  final _requestKey = const Uuid().v4();

  Future<void> _pick(String from) async {
    File? f;
    if (from == 'file') {
      final r = await FilePicker.pickFiles(type: FileType.custom, allowedExtensions: const ['jpg', 'jpeg', 'png', 'heic', 'webp', 'pdf']);
      final path = r.isEmpty ? null : r.first.path;
      if (path != null) f = File(path);
    } else {
      final x = await ImagePicker().pickImage(source: from == 'camera' ? ImageSource.camera : ImageSource.gallery, imageQuality: 85);
      if (x != null) f = File(x.path);
    }
    if (f != null && mounted) setState(() => _receipt = f);
  }

  Future<void> _submit() async {
    final amount = int.tryParse(_amount.text.replaceAll(RegExp(r'\D'), '')) ?? 0;
    if (amount <= 0) return setState(() => _error = 'Укажите сумму');
    if (!widget.refund && _receipt == null) return setState(() => _error = 'Приложите чек: фото, скриншот или PDF');
    if (widget.refund && _note.text.trim().length < 3) return setState(() => _error = 'Напишите причину возврата');
    setState(() {
      _busy = true;
      _error = null;
    });
    final files = <http.MultipartFile>[
      if (_receipt != null)
        await http.MultipartFile.fromPath(
          'file',
          _receipt!.path,
          filename: _receipt!.uri.pathSegments.last,
          contentType: MediaType.parse(lookupMimeType(_receipt!.path) ?? 'application/octet-stream'),
        ),
    ];
    final now = DateTime.now();
    final note = _note.text.trim();
    try {
      await v1(
        widget.api,
        (c) => widget.refund
            ? c.crmOrderRefund(orderId: widget.money.id, amount: '$amount', note: note, requestKey: _requestKey, files: files)
            : c.crmOrderPay(
                orderId: widget.money.id,
                amount: '$amount',
                paidAt: '${now.year}-${two(now.month)}-${two(now.day)}',
                note: note.isEmpty ? null : note,
                payForm: _payForm,
                requestKey: _requestKey,
                files: files,
              ),
      );
      HapticFeedback.mediumImpact();
      if (mounted) Navigator.pop(context, true);
    } on ApiException catch (e) {
      if (mounted) {
        setState(() {
          _busy = false;
          _error = e.message;
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final c = context.c;
    return SafeArea(
      child: SingleChildScrollView(
        padding: EdgeInsets.fromLTRB(20, 4, 20, 20 + MediaQuery.of(context).viewInsets.bottom),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text('Заказ №${widget.money.number} · к оплате ${money(widget.money.amount)}, получено ${money(widget.money.received)}', style: AppText.sub(context)),
            const SizedBox(height: 14),
            TextField(
              controller: _amount,
              keyboardType: TextInputType.number,
              inputFormatters: [FilteringTextInputFormatter.digitsOnly],
              style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w700),
              decoration: const InputDecoration(labelText: 'Сумма, ₸'),
            ),
            if (!widget.refund && widget.money.payForms.isNotEmpty) ...[
              const SizedBox(height: 16),
              Text('ФОРМА ОПЛАТЫ', style: AppText.label(context)),
              const SizedBox(height: 8),
              Wrap(
                spacing: 8,
                runSpacing: 8,
                children: [for (final f in widget.money.payForms) FilterPill(label: f, selected: _payForm == f, onTap: () => setState(() => _payForm = _payForm == f ? null : f))],
              ),
            ],
            const SizedBox(height: 16),
            Text(widget.refund ? 'ЧЕК ВОЗВРАТА (ПО ЖЕЛАНИЮ)' : 'ЧЕК', style: AppText.label(context)),
            const SizedBox(height: 8),
            if (_receipt != null)
              GroupCard(
                padding: EdgeInsets.zero,
                children: [
                  GroupTile(
                    title: _receipt!.uri.pathSegments.last,
                    icon: _receipt!.path.toLowerCase().endsWith('.pdf') ? LucideIcons.fileText : LucideIcons.image,
                    trailing: Icon(LucideIcons.x, size: 18, color: c.textFaint),
                    onTap: () => setState(() => _receipt = null),
                  ),
                ],
              )
            else
              Row(
                children: [
                  for (final (key, icon, label) in [('camera', LucideIcons.camera, 'Камера'), ('gallery', LucideIcons.image, 'Скриншот'), ('file', LucideIcons.fileText, 'PDF')]) ...[
                    if (key != 'camera') const SizedBox(width: 8),
                    Expanded(
                      child: OutlinedButton.icon(
                        onPressed: () => _pick(key),
                        icon: Icon(icon, size: 18),
                        label: Text(label, maxLines: 1, softWrap: false, overflow: TextOverflow.fade),
                        style: OutlinedButton.styleFrom(
                          foregroundColor: c.text,
                          side: BorderSide(color: c.border),
                          minimumSize: const Size(0, 46), padding: const EdgeInsets.symmetric(horizontal: 8),
                          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(Rd.sm)),
                        ),
                      ),
                    ),
                  ],
                ],
              ),
            const SizedBox(height: 16),
            TextField(
              controller: _note,
              minLines: 1,
              maxLines: 3,
              decoration: InputDecoration(labelText: widget.refund ? 'Причина возврата' : 'Комментарий (необязательно)'),
            ),
            if (_error != null)
              Padding(
                padding: const EdgeInsets.only(top: 12),
                child: Text(_error!, style: TextStyle(color: c.danger, fontSize: 14.5)),
              ),
            const SizedBox(height: 18),
            PrimaryButton(
              label: _busy ? 'Сохраняем…' : (widget.refund ? 'Оформить возврат' : 'Принять оплату'),
              icon: widget.refund ? LucideIcons.undo2 : LucideIcons.check,
              onPressed: _busy ? null : _submit,
            ),
          ],
        ),
      ),
    );
  }
}

/// Тариф и договорённая цена: неоплаченный — в пределах лимита скидки, оплаченный — с правом и причиной (как на сайте).
class _TermsForm extends StatefulWidget {
  const _TermsForm({required this.api, required this.money});
  final ApiClient api;
  final v1api.OrderMoney money;

  @override
  State<_TermsForm> createState() => _TermsFormState();
}

class _TermsFormState extends State<_TermsForm> {
  late String _plan = widget.money.plan;
  late final _price = TextEditingController(text: widget.money.agreed?.toString() ?? '');
  final _reason = TextEditingController();
  String? _error;
  bool _busy = false;

  Future<void> _save() async {
    final raw = _price.text.replaceAll(RegExp(r'\D'), '');
    final agreed = raw.isEmpty ? null : int.tryParse(raw);
    if (widget.money.settled && _reason.text.trim().length < 3) return setState(() => _error = 'Заказ оплачен — укажите причину изменения');
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final r = await v1(
        widget.api,
        (c) => c.crmOrderTerms(
          orderId: widget.money.id,
          body: v1api.OrderTermsBody(plan: _plan, agreedTotal: agreed, reason: _reason.text.trim().isEmpty ? null : _reason.text.trim()),
        ),
      );
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(r.message ?? 'Сохранено')));
      Navigator.pop(context, true);
    } on ApiException catch (e) {
      if (mounted) {
        setState(() {
          _busy = false;
          _error = e.message;
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final m = widget.money;
    final list = m.plans.where((p) => p.id == _plan).map((p) => p.price).firstOrNull;
    return SafeArea(
      child: SingleChildScrollView(
        padding: EdgeInsets.fromLTRB(20, 4, 20, 20 + MediaQuery.of(context).viewInsets.bottom),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            GroupCard(
              padding: EdgeInsets.zero,
              children: [
                ChoiceRow(
                  label: 'Тариф',
                  value: m.plans.where((p) => p.id == _plan).map((p) => p.label).firstOrNull ?? _plan,
                  onTap: m.settled
                      ? null
                      : () async {
                          final v = await pickChoice(context, title: 'Тариф', options: [for (final p in m.plans) (p.id, '${p.label} — ${money(p.price)}')], current: _plan);
                          if (v != null && v.isNotEmpty) setState(() => _plan = v);
                        },
                ),
              ],
            ),
            const SizedBox(height: 16),
            LabeledField(
              label: 'Договорённая цена книги, ₸',
              controller: _price,
              keyboard: TextInputType.number,
              hint: list == null ? null : 'пусто — по прайсу ${money(list)}',
              note: m.maxDiscountPercent == null ? null : 'Ваш лимит скидки — ${m.maxDiscountPercent!.round()}% от прайса',
            ),
            if (m.settled) LabeledField(label: 'Причина (заказ оплачен)', controller: _reason, lines: 2, note: 'Переплата — задача «возврат или зачёт», нехватка — заказ снова ждёт доплату'),
            if (_error != null)
              Padding(
                padding: const EdgeInsets.only(bottom: 12),
                child: Text(_error!, style: TextStyle(color: context.c.danger, fontSize: 14.5)),
              ),
            PrimaryButton(label: 'Сохранить', busy: _busy, onPressed: _save),
          ],
        ),
      ),
    );
  }
}
