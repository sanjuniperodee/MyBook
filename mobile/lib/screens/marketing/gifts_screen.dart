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

import '../../api/mybook_api.g.dart' as v1api;
import '../../core/api.dart';
import '../../core/auth.dart';
import '../../core/format.dart';
import '../../core/links.dart';
import '../../core/v1.dart';
import '../../ui/kit.dart';
import '../../ui/tokens.dart';
import '../money/money_widgets.dart';

/// Подарочные сертификаты (API v1 crmGifts): сверху ждут оплаты (сообщили об оплате — первыми) с «Оплачен» — только с
/// чеком перевода, код уйдёт покупателю и получателю; ниже выпущенные и отменённые — чек, переотправка, отмена.
class GiftsScreen extends StatefulWidget {
  const GiftsScreen({super.key});

  @override
  State<GiftsScreen> createState() => _GiftsScreenState();
}

class _GiftsScreenState extends State<GiftsScreen> {
  v1api.Gifts? _g;
  String? _error;
  bool _loading = false;
  final _busy = <String>{};

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
      final g = await v1(_api, (c) => c.crmGifts());
      if (mounted) setState(() => _g = g);
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  void _toast(String t) => ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(t)));

  Future<void> _act(String id, Future<v1api.Done> Function(v1api.MybookApi) call) async {
    if (_busy.contains(id)) return;
    setState(() => _busy.add(id));
    try {
      final r = await v1(_api, call);
      HapticFeedback.lightImpact();
      _toast(r.message ?? 'Готово');
      await _load();
    } on ApiException catch (e) {
      _toast(e.message);
    } finally {
      if (mounted) setState(() => _busy.remove(id));
    }
  }

  /// «Оплачен»: чек перевода — камера, скриншот или PDF; без чека код не выпускается.
  Future<void> _paid(v1api.GiftRow g) async {
    final from = await showAppSheet<String>(context, title: 'Чек перевода', builder: (sheet) {
      return ListView(shrinkWrap: true, padding: const EdgeInsets.fromLTRB(16, 4, 16, 24), children: [
        GroupCard(padding: EdgeInsets.zero, children: [
          GroupTile(title: 'Сфотографировать', icon: LucideIcons.camera, onTap: () => Navigator.pop(sheet, 'camera')),
          GroupTile(title: 'Скриншот из галереи', icon: LucideIcons.image, onTap: () => Navigator.pop(sheet, 'gallery')),
          GroupTile(title: 'PDF из файлов', icon: LucideIcons.fileText, onTap: () => Navigator.pop(sheet, 'file')),
        ]),
      ]);
    });
    if (from == null) return;
    String? path;
    if (from == 'file') {
      final r = await FilePicker.pickFiles(type: FileType.custom, allowedExtensions: const ['jpg', 'jpeg', 'png', 'webp', 'pdf']);
      path = r.isEmpty ? null : r.first.path;
    } else {
      path = (await ImagePicker().pickImage(source: from == 'camera' ? ImageSource.camera : ImageSource.gallery, imageQuality: 85))?.path;
    }
    if (path == null || !mounted) return;
    final name = path.split('/').last.startsWith('image_picker_') ? 'receipt.${path.split('.').last}' : path.split('/').last;
    final file = await http.MultipartFile.fromPath('file', path, filename: name, contentType: MediaType.parse(lookupMimeType(path) ?? 'image/jpeg'));
    if (File(path).lengthSync() > 12 * 1024 * 1024) return _toast('Чек больше 12 МБ — сожмите или сделайте скриншот');
    await _act(g.id, (c) => c.crmGiftPaid(id: g.id, files: [file]));
  }

  @override
  Widget build(BuildContext context) {
    final g = _g;
    return MoneyPage(
      title: 'Сертификаты',
      subtitle: 'Сертификат — промокод на книгу. Перевод подтверждайте только с чеком',
      period: null,
      onPeriod: null,
      onRefresh: _load,
      loading: _loading,
      error: _error,
      children: g == null
          ? const []
          : [
              StatGrid(tiles: [
                StatTile(label: 'Выпущено', value: '${g.totals.paid}', note: 'использовано ${g.totals.redeemed}'),
                StatTile(label: 'Выручка', value: money(g.totals.revenue)),
              ]),
              MoneySection(title: 'Ждут оплаты', hint: g.totals.claimed > 0 ? 'сообщили об оплате: ${g.totals.claimed}' : null),
              if (g.waiting.isEmpty) const MoneyEmpty('Неоплаченных нет') else GroupCard(padding: EdgeInsets.zero, children: [for (final x in g.waiting) _tile(context, x)]),
              MoneySection(title: 'Выпущенные и отменённые'),
              if (g.register.isEmpty) const MoneyEmpty('Сертификатов пока нет') else GroupCard(padding: EdgeInsets.zero, children: [for (final x in g.register) _tile(context, x)]),
            ],
    );
  }

  Widget _tile(BuildContext context, v1api.GiftRow g) {
    final c = context.c;
    final busy = _busy.contains(g.id);
    return Container(
      decoration: BoxDecoration(border: Border(bottom: BorderSide(color: c.border.withValues(alpha: 0.6), width: 0.5))),
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 12),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(children: [
          Expanded(child: Text('№${g.number} · ${g.buyer.isEmpty ? g.buyerContact : g.buyer}', style: TextStyle(fontSize: 15, fontWeight: FontWeight.w600, color: c.text))),
          Text(money(g.amount), style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700, color: c.text)),
        ]),
        const SizedBox(height: 3),
        Text('для ${g.recipient}, ${g.plan}, ${g.delivery} · ${g.createdLabel}', style: AppText.caption(context)),
        if (g.buyerContact.isNotEmpty && g.buyer.isNotEmpty) Text(g.buyerContact, style: AppText.caption(context)),
        Padding(
          padding: const EdgeInsets.only(top: 6),
          child: Wrap(spacing: 8, runSpacing: 6, crossAxisAlignment: WrapCrossAlignment.center, children: [
            Tag(g.statusLabel, fg: g.status == 'paid' ? c.success : g.status == 'pending_payment' ? c.warn : c.textMuted, bg: (g.status == 'paid' ? c.success : g.status == 'pending_payment' ? c.warn : c.textMuted).withValues(alpha: 0.12)),
            if (g.claimed) Tag('сообщил об оплате', fg: c.warn, bg: c.warnBg),
            if (g.code != null) Text('код ${g.code}${g.redeemed ? ' · использован' : ''}', style: AppText.caption(context).copyWith(fontFamily: 'monospace')),
          ]),
        ),
        Padding(
          padding: const EdgeInsets.only(top: 8),
          child: Wrap(spacing: 8, runSpacing: 6, children: [
            if (g.status == 'pending_payment') _chip(context, 'Оплачен — с чеком', LucideIcons.receipt, busy, () => _paid(g), primary: true),
            if (g.receiptUrl != null) _chip(context, 'Чек', LucideIcons.receipt, false, () => openFile(context, g.receiptUrl!, title: 'Чек')),
            if (g.status == 'paid' && g.canResend) _chip(context, 'Отправить ещё раз', LucideIcons.send, busy, () => _act(g.id, (c) => c.crmGiftResend(id: g.id))),
            if (g.status != 'cancelled')
              _chip(context, 'Отменить', LucideIcons.ban, busy, () async {
                if (await confirm(context, title: 'Отменить сертификат №${g.number}?', message: g.status == 'paid' ? 'Код перестанет действовать. Деньги верните покупателю сами.' : 'Сертификат не будет выпущен.', ok: 'Отменить', destructive: true)) {
                  await _act(g.id, (c) => c.crmGiftCancel(id: g.id));
                }
              }),
          ]),
        ),
      ]),
    );
  }

  Widget _chip(BuildContext context, String label, IconData icon, bool busy, VoidCallback onTap, {bool primary = false}) {
    final c = context.c;
    return Material(
      color: primary ? c.brand : c.bg,
      borderRadius: BorderRadius.circular(18),
      child: InkWell(
        borderRadius: BorderRadius.circular(18),
        onTap: busy ? null : onTap,
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 7),
          child: Row(mainAxisSize: MainAxisSize.min, children: [
            busy ? SizedBox(width: 14, height: 14, child: CircularProgressIndicator(strokeWidth: 2, color: primary ? c.onBrand : c.brand)) : Icon(icon, size: 15, color: primary ? c.onBrand : c.brand),
            const SizedBox(width: 6),
            Text(label, style: TextStyle(fontSize: 13.5, fontWeight: FontWeight.w600, color: primary ? c.onBrand : c.brand)),
          ]),
        ),
      ),
    );
  }
}
