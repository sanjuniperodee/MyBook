import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:provider/provider.dart';
import 'package:url_launcher/url_launcher.dart';

import '../api/mybook_api.g.dart' as v1api;
import '../core/api.dart';
import '../core/auth.dart';
import '../core/v1.dart';
import '../ui/kit.dart';
import '../ui/tokens.dart';
import 'chat_screen.dart';
import 'client_screen.dart';
import 'crm_web_screen.dart';
import 'deal_screen.dart';
import 'order_details_screen.dart';
import 'order_files.dart';
import 'order_money.dart';
import 'orders_screen.dart' show orderStatusColor;

/// Заказ: статус и его смена одной кнопкой, деньги (оплата с чеком, возврат, отмена и сверка платежа, постоплата, тариф и
/// цена — API v1), получатель с кнопкой «позвонить», доставка и трек (правка — API v1), книга, пожелания и журнал.
/// Контакты и доставка — экран правки (API v1), файлы типографии с пересборкой — блок «Книга и файлы».
class OrderScreen extends StatefulWidget {
  const OrderScreen({super.key, required this.orderId, this.number = 0});
  final String orderId;

  /// Номер заказа для шапки; 0 — неизвестен (открыт из уведомления), берётся из ответа сервера.
  final int number;

  @override
  State<OrderScreen> createState() => _OrderScreenState();
}

class _OrderScreenState extends State<OrderScreen> {
  v1api.CrmOrder? _o;
  String? _error;
  bool _changed = false;
  bool _busy = false;
  v1api.OrderLinks? _links;

  int get _number => widget.number != 0 ? widget.number : (_o?.number ?? 0);

  @override
  void initState() {
    super.initState();
    _load();
    _loadLinks();
  }

  Future<void> _load() async {
    try {
      final r = await v1(context.read<AuthState>().api, (c) => c.crmOrder(orderId: widget.orderId));
      if (mounted) {
        setState(() {
          _o = r;
          _error = null;
        });
      }
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    }
  }

  Future<void> _loadLinks() async {
    try {
      final l = await v1(context.read<AuthState>().api, (c) => c.crmOrderLinks(orderId: widget.orderId));
      if (mounted) setState(() => _links = l);
    } on ApiException {
      // без связей карточка работает
    }
  }

  Future<void> _more() async {
    final l = _links!;
    final pick = await showAppSheet<String>(context, title: _number == 0 ? 'Заказ' : 'Заказ №$_number', builder: (sheet) {
      return ListView(shrinkWrap: true, padding: const EdgeInsets.fromLTRB(16, 4, 16, 24), children: [
        GroupCard(padding: EdgeInsets.zero, children: [
          if (l.clientId != null) GroupTile(title: 'Карточка клиента', icon: LucideIcons.user, onTap: () => Navigator.pop(sheet, 'client')),
          if (l.dealId != null) GroupTile(title: 'Сделка Д${l.dealNumber}', icon: LucideIcons.handshake, onTap: () => Navigator.pop(sheet, 'deal')),
          if (l.chatId != null) GroupTile(title: 'Чат с клиентом', icon: LucideIcons.messageCircle, onTap: () => Navigator.pop(sheet, 'chat')),
          GroupTile(title: 'Предпросмотр книги', icon: LucideIcons.eye, onTap: () => Navigator.pop(sheet, 'preview')),
          if (l.printUrl != null) GroupTile(title: 'Упаковочный лист', icon: LucideIcons.clipboardList, onTap: () => Navigator.pop(sheet, 'print')),
        ]),
      ]);
    });
    if (!mounted || pick == null) return;
    final nav = Navigator.of(context);
    switch (pick) {
      case 'client':
        await nav.push(MaterialPageRoute<void>(builder: (_) => ClientScreen(clientId: l.clientId!)));
      case 'deal':
        await nav.push(MaterialPageRoute<void>(builder: (_) => DealScreen(dealId: l.dealId!)));
      case 'chat':
        await nav.push(MaterialPageRoute<void>(builder: (_) => ChatScreen(chatId: l.chatId!)));
      case 'preview':
        await openCrm(context, '/books/${l.bookId}/preview', title: 'Предпросмотр книги');
      case 'print':
        await openCrm(context, l.printUrl!, title: 'Упаковочный лист');
    }
  }

  Future<void> _editNote() async {
    final l = _links!;
    final v = await promptText(context, title: 'Заметка к заказу', hint: 'видят только сотрудники', initial: l.adminNote, lines: 4);
    if (v == null || !mounted) return;
    try {
      final r = await v1(context.read<AuthState>().api, (c) => c.crmOrderNote(orderId: widget.orderId, body: v1api.OrderNoteBody(note: v.trim())));
      _toast(r.message ?? 'Сохранено');
      _loadLinks();
    } on ApiException catch (e) {
      _toast(e.message);
    }
  }

  void _toast(String text) => ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(text)));

  Future<void> _setStatus() async {
    final api = context.read<AuthState>().api;
    List<v1api.CrmOrderStatus> statuses;
    try {
      statuses = (await v1(api, (c) => c.crmOrdersList())).statuses;
    } on ApiException catch (e) {
      return _toast(e.message);
    }
    if (!mounted) return;
    final current = _o!.status;
    final picked = await showAppSheet<String>(
      context,
      title: 'Перевести заказ',
      icon: LucideIcons.arrowRightLeft,
      builder: (sheet) => SingleChildScrollView(
        child: GroupCard(
          padding: const EdgeInsets.fromLTRB(16, 4, 16, 24),
          children: [
            // «Оплачен» без записи платежа — только в CRM (приём денег с чеком); отменённый не возвращается в «ждёт оплаты».
            for (final s in statuses.where((s) => !(current == 'pending_payment' && s.key == 'paid') && !(current == 'cancelled' && s.key == 'pending_payment')))
              GroupTile(
                title: s.label,
                subtitle: s.key == current ? 'сейчас' : null,
                icon: LucideIcons.circleDot,
                iconColor: orderStatusColor(sheet, s.key),
                trailing: s.key == current ? Icon(LucideIcons.check, size: 20, color: sheet.c.brandDeep) : const SizedBox.shrink(),
                onTap: s.key == current ? null : () => Navigator.pop(sheet, s.key),
              ),
          ],
        ),
      ),
    );
    if (picked == null || !mounted) return;
    if (!await confirm(context, title: 'Перевести заказ №$_number?', message: 'Клиент получит сообщение о смене статуса, если для этого настроены правила.', ok: 'Перевести')) return;
    setState(() => _busy = true);
    try {
      await v1(api, (c) => c.crmOrderStatus(orderId: widget.orderId, body: v1api.CrmOrderStatusBody(status: picked)));
      HapticFeedback.mediumImpact();
      _changed = true;
      await _load();
    } on ApiException catch (e) {
      _toast(e.message);
    }
    if (mounted) setState(() => _busy = false);
  }

  Future<void> _editDetails() async {
    final saved = await Navigator.of(context).push<bool>(MaterialPageRoute(builder: (_) => OrderDetailsScreen(orderId: widget.orderId, number: _number)));
    if (saved == true) {
      _changed = true;
      _load();
    }
  }

  /// Трек-номер — тем же действием, что форма «Доставка» на сайте (статус не меняется; клиенту — по правилам заказа).
  Future<void> _setTracking() async {
    final track = await promptText(context, title: 'Трек-номер', hint: 'например KZ123456789', initial: _o!.tracking ?? '');
    if (track == null || !mounted) return;
    try {
      final r = await v1(context.read<AuthState>().api, (c) => c.crmOrderDelivery(orderId: widget.orderId, body: v1api.OrderDeliveryBody(status: _o!.status, trackingNumber: track)));
      _toast(r.message ?? 'Сохранено');
      _changed = true;
      await _load();
    } on ApiException catch (e) {
      _toast(e.message);
    }
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
          title: Text(_number == 0 ? 'Заказ' : 'Заказ №$_number', style: AppText.headline(context)),
          actions: [
            // Клиент, сделка, чат, предпросмотр книги и упаковочный лист — как меню «Ещё» карточки заказа (API v1 crmOrderLinks).
            if (_links != null) RoundIconButton(icon: LucideIcons.ellipsis, size: 44, iconSize: 22, color: c.text, tooltip: 'Ещё', onTap: _more),
          ],
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
                  OrderMoneySection(
                    orderId: widget.orderId,
                    onChanged: () {
                      _changed = true;
                      _load();
                    },
                  ),
                  _group(context, 'Получатель', [
                    _row(context, 'Имя', o.contact.name),
                    if (o.contact.phone != null)
                      _row(
                        context,
                        'Телефон',
                        o.contact.phone!,
                        onTap: o.contact.masked ? null : () => launchUrl(Uri(scheme: 'tel', path: o.contact.phone!.replaceAll(RegExp(r'[^0-9+]'), ''))),
                      ),
                    if (o.contact.email != null) _row(context, 'E-mail', o.contact.email!),
                    if (o.canEdit && !o.contact.masked)
                      GroupTile(title: 'Изменить контакты и доставку', subtitle: 'получатель, адрес, дата, открытка', icon: LucideIcons.pencil, onTap: _editDetails),
                  ]),
                  if (o.delivery != null)
                    _group(context, 'Доставка', [
                      _row(context, 'Способ', o.delivery!.method),
                      _row(context, 'Адрес', o.delivery!.address ?? '—'),
                      if (o.delivery!.quoted) _note(context, 'Стоимость доставки считается отдельно — в сумму не входит', c.warn, c.warnBg),
                      if (o.tracking != null)
                        _row(context, 'Трек-номер', o.tracking!, onTap: () => Clipboard.setData(ClipboardData(text: o.tracking!)).then((_) => _toast('Скопировано'))),
                      if (o.canEdit)
                        GroupTile(title: o.tracking == null ? 'Указать трек-номер' : 'Изменить трек-номер', subtitle: 'клиент получит его в сообщении о доставке', icon: LucideIcons.truck, onTap: _setTracking),
                    ]),
                  _group(context, 'Книга', [
                    _row(context, 'Название', o.book.title.isEmpty ? '—' : o.book.title),
                    _row(context, 'Для кого', [o.book.author, o.book.recipient].where((e) => e.isNotEmpty).join(' → ')),
                    _row(context, 'Тариф', '${o.planName}${o.quantity > 1 ? ' × ${o.quantity}' : ''}'),
                    _row(context, 'Сумма', o.amountLabel),
                    if (o.addons.isNotEmpty) _row(context, 'Допы', o.addons.join(', ')),
                  ]),
                  if (o.desiredDate != null || o.comment != null || o.giftNote != null || o.surprise)
                    _group(context, 'Пожелания', [
                      if (o.desiredDate != null) _row(context, 'Нужна к', o.desiredDate!.split('-').reversed.join('.'), accent: true),
                      if (o.surprise) _note(context, 'Сюрприз: не звонить получателю, связываться с заказчиком', c.violet, c.violetBg),
                      if (o.comment != null) _row(context, 'Комментарий', o.comment!),
                      if (o.giftNote != null) _row(context, 'Открытка', '«${o.giftNote}»'),
                    ]),
                  OrderFilesSection(orderId: widget.orderId, number: _number),
                  if (_links != null && (_links!.adminNote.isNotEmpty || _links!.canNote))
                    _group(context, 'Заметка', [
                      GroupTile(
                        title: _links!.adminNote.isEmpty ? 'Добавить заметку' : _links!.adminNote,
                        subtitle: 'видят только сотрудники',
                        icon: LucideIcons.stickyNote,
                        onTap: _links!.canNote ? _editNote : null,
                      ),
                    ]),
                  if (o.events.isNotEmpty)
                    _group(context, 'Журнал', [
                      for (final e in o.events)
                        _row(context, _when(e.at), [if (e.status != null) e.status!, if (e.note != null) e.note!].join('. ')),
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

  Widget _statusCard(BuildContext context, v1api.CrmOrder o) {
    final c = context.c;
    final color = orderStatusColor(context, o.status);
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
              Expanded(child: Text(o.statusLabel, style: AppText.title(context))),
              Text(
                o.amountLabel,
                style: TextStyle(fontSize: 17, fontWeight: FontWeight.w700, color: c.text),
              ),
            ],
          ),
          if (o.claimed) ...[const SizedBox(height: 10), Tag('клиент сообщил об оплате', fg: c.warn, bg: c.warnBg, icon: LucideIcons.circleDollarSign)],
          if (o.canEdit) ...[const SizedBox(height: 14), PrimaryButton(label: 'Сменить статус', icon: LucideIcons.arrowRightLeft, busy: _busy, onPressed: _setStatus)],
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
