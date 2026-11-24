import 'dart:io';

import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:image_picker/image_picker.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:mime/mime.dart';
import 'package:uuid/uuid.dart';

import '../core/api.dart';
import '../core/format.dart';
import '../models/chat.dart';
import '../ui/kit.dart';
import '../ui/tokens.dart';

/// Приём денег по сделке, как в CRM: сумма, форма оплаты (из поля сделки «Форма оплаты»), чек (фото, скриншот или PDF —
/// обязательно) и комментарий. По сделке с заказом — только возврат лишнего. Сервер проверяет всё сам: открытый счёт или
/// недавняя онлайн-оплата — спросим, не она ли это; повтор отправки после сбоя — тот же платёж (requestKey).
Future<bool> showPaymentSheet(
  BuildContext context, {
  required ApiClient api,
  required String dealId,
  required int suggested,
  required List<String> payForms,
  required bool refundOnly,
  required List<InvoiceBrief> invoices,
  required List<String> paymentIds,
}) async {
  final ok = await showAppSheet<bool>(
    context,
    title: refundOnly ? 'Возврат по сделке' : 'Принять оплату',
    icon: refundOnly ? LucideIcons.undo2 : LucideIcons.banknote,
    full: true,
    builder: (_) => _PaymentForm(api: api, dealId: dealId, suggested: suggested, payForms: payForms, refundOnly: refundOnly, invoices: invoices, paymentIds: paymentIds),
  );
  return ok == true;
}

class _PaymentForm extends StatefulWidget {
  const _PaymentForm({required this.api, required this.dealId, required this.suggested, required this.payForms, required this.refundOnly, required this.invoices, required this.paymentIds});
  final ApiClient api;
  final String dealId;
  final int suggested;
  final List<String> payForms;
  final bool refundOnly;
  final List<InvoiceBrief> invoices;
  final List<String> paymentIds;

  @override
  State<_PaymentForm> createState() => _PaymentFormState();
}

class _PaymentFormState extends State<_PaymentForm> {
  late final _amount = TextEditingController(text: widget.suggested > 0 && !widget.refundOnly ? '${widget.suggested}' : '');
  final _note = TextEditingController();
  late bool _refund = widget.refundOnly;
  String? _payForm;
  File? _receipt;
  String? _error;
  bool _busy = false;

  /// Один ключ на форму: повтор после сбоя сети не запишет второй платёж.
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

  Future<void> _submit({String? invoiceId, bool other = false}) async {
    final amount = int.tryParse(_amount.text.replaceAll(RegExp(r'\D'), '')) ?? 0;
    if (amount <= 0) return setState(() => _error = 'Укажите сумму');
    if (_receipt == null) return setState(() => _error = 'Приложите чек: фото, скриншот или PDF');
    if (_refund && _note.text.trim().length < 3) return setState(() => _error = 'Напишите причину возврата');
    setState(() {
      _busy = true;
      _error = null;
    });
    final f = _receipt!;
    final now = DateTime.now();
    try {
      await widget.api.upload(
        '/api/admin/deals/${widget.dealId}/payments',
        field: 'file',
        file: f,
        filename: f.uri.pathSegments.last,
        contentType: lookupMimeType(f.path) ?? 'application/octet-stream',
        fields: {
          'kind': _refund ? 'refund' : 'payment',
          'amount': '$amount',
          'paidAt': '${now.year}-${two(now.month)}-${two(now.day)}',
          'note': _note.text.trim(),
          'requestKey': _requestKey,
          'payForm': ?_payForm,
          'invoiceId': ?invoiceId,
          // «Это другая оплата»: открытые счета и недавние онлайн-оплаты, которые менеджер видел.
          if (other) 'seen': [...widget.invoices.map((i) => i.id), ...widget.paymentIds].join(','),
        },
      );
      HapticFeedback.mediumImpact();
      if (mounted) Navigator.pop(context, true);
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() => _busy = false);
      if (e.code == 'invoiceChoice') return _askInvoice(e.message, amount);
      setState(() => _error = e.message);
    }
  }

  /// По сделке открыт счёт или недавно пришла онлайн-оплата: это она или другие деньги?
  Future<void> _askInvoice(String why, int amount) async {
    final open = widget.invoices.where((i) => i.status == 'pending_payment').toList();
    final pick = await showAppSheet<String>(
      context,
      title: 'Какая это оплата?',
      icon: LucideIcons.receipt,
      builder: (sheet) => SafeArea(
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          Padding(padding: const EdgeInsets.fromLTRB(20, 0, 20, 12), child: Text(why, style: AppText.sub(sheet))),
          GroupCard(padding: const EdgeInsets.fromLTRB(16, 0, 16, 24), children: [
            for (final i in open)
              GroupTile(
                title: 'По счёту ${i.label} · ${money(i.amount)}',
                subtitle: i.amount == amount ? null : 'сумма счёта другая — примите как «другую оплату»',
                icon: LucideIcons.receipt,
                onTap: i.amount == amount ? () => Navigator.pop(sheet, i.id) : null,
              ),
            GroupTile(title: 'Это другая оплата', icon: LucideIcons.banknote, onTap: () => Navigator.pop(sheet, '')),
          ]),
        ]),
      ),
    );
    if (pick == null) return;
    await _submit(invoiceId: pick.isEmpty ? null : pick, other: pick.isEmpty);
  }

  @override
  Widget build(BuildContext context) {
    final c = context.c;
    return SafeArea(
      child: SingleChildScrollView(
        padding: EdgeInsets.fromLTRB(20, 4, 20, 20 + MediaQuery.of(context).viewInsets.bottom),
        child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          if (widget.refundOnly)
            Padding(
              padding: const EdgeInsets.only(bottom: 12),
              child: Text('По сделке оформлен заказ — оплату принимают в заказе (CRM на сайте). Здесь — только возврат лишнего.', style: AppText.sub(context)),
            )
          else
            Padding(
              padding: const EdgeInsets.only(bottom: 14),
              child: SegmentedButton<bool>(
                segments: const [ButtonSegment(value: false, label: Text('Оплата')), ButtonSegment(value: true, label: Text('Возврат'))],
                selected: {_refund},
                showSelectedIcon: false,
                onSelectionChanged: (v) => setState(() => _refund = v.first),
              ),
            ),
          TextField(
            controller: _amount,
            keyboardType: TextInputType.number,
            inputFormatters: [FilteringTextInputFormatter.digitsOnly],
            style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w700),
            decoration: const InputDecoration(labelText: 'Сумма, ₸'),
          ),
          if (!_refund && widget.payForms.isNotEmpty) ...[
            const SizedBox(height: 16),
            Text('ФОРМА ОПЛАТЫ', style: AppText.label(context)),
            const SizedBox(height: 8),
            Wrap(spacing: 8, runSpacing: 8, children: [
              for (final f in widget.payForms) FilterPill(label: f, selected: _payForm == f, onTap: () => setState(() => _payForm = _payForm == f ? null : f)),
            ]),
          ],
          const SizedBox(height: 16),
          Text('ЧЕК', style: AppText.label(context)),
          const SizedBox(height: 8),
          if (_receipt != null)
            GroupCard(padding: EdgeInsets.zero, children: [
              GroupTile(
                title: _receipt!.uri.pathSegments.last,
                icon: _receipt!.path.toLowerCase().endsWith('.pdf') ? LucideIcons.fileText : LucideIcons.image,
                trailing: Icon(LucideIcons.x, size: 18, color: c.textFaint),
                onTap: () => setState(() => _receipt = null),
              ),
            ])
          else
            Row(children: [
              for (final (key, icon, label) in [('camera', LucideIcons.camera, 'Камера'), ('gallery', LucideIcons.image, 'Скриншот'), ('file', LucideIcons.fileText, 'PDF')]) ...[
                if (key != 'camera') const SizedBox(width: 8),
                Expanded(
                  child: OutlinedButton.icon(
                    onPressed: () => _pick(key),
                    icon: Icon(icon, size: 18),
                    label: Text(label),
                    style: OutlinedButton.styleFrom(foregroundColor: c.text, side: BorderSide(color: c.border), minimumSize: const Size(0, 46), shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(Rd.sm))),
                  ),
                ),
              ],
            ]),
          const SizedBox(height: 16),
          TextField(controller: _note, minLines: 1, maxLines: 3, decoration: InputDecoration(labelText: _refund ? 'Причина возврата' : 'Комментарий (необязательно)')),
          if (_error != null) Padding(padding: const EdgeInsets.only(top: 12), child: Text(_error!, style: TextStyle(color: c.danger, fontSize: 14.5))),
          const SizedBox(height: 18),
          PrimaryButton(label: _busy ? 'Сохраняем…' : (_refund ? 'Оформить возврат' : 'Принять оплату'), icon: _refund ? LucideIcons.undo2 : LucideIcons.check, onPressed: _busy ? null : () => _submit()),
        ]),
      ),
    );
  }
}
