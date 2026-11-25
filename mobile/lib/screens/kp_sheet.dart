import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:provider/provider.dart';

import '../api/mybook_api.g.dart' as v1api;
import '../core/api.dart';
import '../core/auth.dart';
import '../core/v1.dart';
import '../ui/kit.dart';
import '../ui/tokens.dart';

/// Открыть нативный лист «Коммерческое предложение (КП)» для диалога:
/// ссылка на оплату заказа, ссылка на книгу в работе, персональная скидка с одноразовым промокодом.
/// Возвращает true, если предложение отправлено клиенту.
Future<bool> showKpSheet(
  BuildContext context, {
  required String chatId,
  v1api.ChatOffers? initialOffers,
  Future<v1api.Done> Function(v1api.ChatOfferBody body)? onSend,
}) async {
  v1api.ChatOffers offers;
  if (initialOffers != null) {
    offers = initialOffers;
  } else {
    final api = context.read<AuthState>().api;
    try {
      offers = await v1(api, (c) => c.crmChatOffers(chatId: chatId));
    } on ApiException catch (e) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
      }
      return false;
    }
  }
  if (!context.mounted) return false;
  final sent = await showAppSheet<bool>(
    context,
    title: 'Коммерческое предложение',
    icon: LucideIcons.gift,
    builder: (sheet) => KpSheet(
      chatId: chatId,
      offers: offers,
      onSend: onSend,
      onSent: (msg) {
        Navigator.pop(sheet, true);
        if (context.mounted && msg.isNotEmpty) {
          ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(msg)));
        }
      },
    ),
  );
  return sent == true;
}

/// Нативный лист КП («Оплата и скидка»): один в один с панелью предложений в веб-чате CRM.
class KpSheet extends StatefulWidget {
  const KpSheet({
    super.key,
    required this.chatId,
    required this.offers,
    this.onSend,
    this.onSent,
  });

  final String chatId;
  final v1api.ChatOffers offers;
  final Future<v1api.Done> Function(v1api.ChatOfferBody body)? onSend;
  final void Function(String message)? onSent;

  @override
  State<KpSheet> createState() => _KpSheetState();
}

class _KpSheetState extends State<KpSheet> {
  late int _percent;
  late int _hours;
  String? _sendingKind;
  String? _error;

  @override
  void initState() {
    super.initState();
    final percents = widget.offers.percents;
    _percent = percents.isNotEmpty ? percents.first : (widget.offers.maxDiscount > 0 ? widget.offers.maxDiscount : 5);
    final opts = widget.offers.hourOptions;
    _hours = opts.isNotEmpty ? opts.first.hours : (widget.offers.hours.isNotEmpty ? widget.offers.hours.first : 24);
  }

  Future<void> _send(v1api.ChatOfferBody body) async {
    if (_sendingKind != null) return;
    setState(() {
      _sendingKind = body.kind;
      _error = null;
    });
    try {
      final res = widget.onSend != null
          ? await widget.onSend!(body)
          : await v1(context.read<AuthState>().api, (c) => c.crmChatOfferSend(chatId: widget.chatId, body: body));
      HapticFeedback.lightImpact();
      if (!mounted) return;
      widget.onSent?.call(res.message ?? 'Отправлено');
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _sendingKind = null);
    }
  }

  @override
  Widget build(BuildContext context) {
    final o = widget.offers;
    final c = context.c;
    final busy = _sendingKind != null;
    final canSend = o.canSend;
    final percents = o.percents;
    final hourOptions = o.hourOptions;

    return SingleChildScrollView(
      padding: const EdgeInsets.fromLTRB(16, 4, 16, 28),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          if (!canSend)
            Container(
              margin: const EdgeInsets.only(bottom: 12),
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(color: c.warnBg, borderRadius: BorderRadius.circular(12)),
              child: Row(
                children: [
                  Icon(LucideIcons.info, size: 16, color: c.warn),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      'Отправлять предложения в этот диалог может только ответственный менеджер.',
                      style: TextStyle(fontSize: 13, color: c.warn, fontWeight: FontWeight.w500),
                    ),
                  ),
                ],
              ),
            ),
          if (_error != null)
            Container(
              margin: const EdgeInsets.only(bottom: 12),
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(color: c.dangerBg, borderRadius: BorderRadius.circular(12)),
              child: Row(
                children: [
                  Icon(LucideIcons.circleAlert, size: 16, color: c.danger),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text(_error!, style: TextStyle(fontSize: 13.5, color: c.danger)),
                  ),
                ],
              ),
            ),
          GroupCard(
            padding: const EdgeInsets.only(bottom: 14),
            children: [
              GroupTile(
                icon: LucideIcons.receipt,
                iconColor: o.order != null ? c.brand : c.textFaint,
                title: o.order != null ? 'Ссылка на оплату заказа №${o.order!.number}' : 'Неоплаченного заказа нет',
                subtitle: o.order != null ? 'Отправит клиенту ссылку на оплату и статус заказа' : 'У клиента нет заказа, ожидающего оплаты',
                trailing: _sendingKind == 'order'
                    ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2))
                    : o.order != null && canSend
                        ? Icon(LucideIcons.send, size: 18, color: c.brand)
                        : const SizedBox.shrink(),
                onTap: o.order != null && canSend && !busy ? () => _send(const v1api.ChatOfferBody(kind: 'order')) : null,
              ),
              GroupTile(
                icon: LucideIcons.bookOpen,
                iconColor: o.book != null ? c.brand : c.textFaint,
                title: o.book != null ? 'Ссылка на книгу «${o.book!.title}»' : 'Книги в работе нет',
                subtitle: o.book != null ? 'Отправит клиенту ссылку на продолжение книги' : 'У клиента пока нет черновика книги',
                trailing: _sendingKind == 'book'
                    ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2))
                    : o.book != null && canSend
                        ? Icon(LucideIcons.send, size: 18, color: c.brand)
                        : const SizedBox.shrink(),
                onTap: o.book != null && canSend && !busy ? () => _send(const v1api.ChatOfferBody(kind: 'book')) : null,
              ),
            ],
          ),
          if (o.maxDiscount > 0 && percents.isNotEmpty)
            Container(
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                color: c.surfaceRaised,
                borderRadius: BorderRadius.circular(Rd.md),
                border: Border.all(color: c.border, width: 0.7),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Icon(LucideIcons.badgePercent, size: 18, color: c.brand),
                      const SizedBox(width: 8),
                      Expanded(child: Text('Персональная скидка', style: AppText.headline(context))),
                      Tag('до ${o.maxDiscount}%', fg: c.brandDeep, bg: c.brand.withValues(alpha: 0.12)),
                    ],
                  ),
                  const SizedBox(height: 12),
                  Text('Размер скидки', style: AppText.caption(context)),
                  const SizedBox(height: 8),
                  Wrap(
                    spacing: 8,
                    runSpacing: 8,
                    children: [
                      for (final p in percents)
                        FilterPill(
                          label: '$p%',
                          selected: _percent == p,
                          onTap: () => setState(() => _percent = p),
                        ),
                    ],
                  ),
                  const SizedBox(height: 14),
                  Text('Срок действия', style: AppText.caption(context)),
                  const SizedBox(height: 8),
                  Wrap(
                    spacing: 8,
                    runSpacing: 8,
                    children: [
                      for (final opt in hourOptions)
                        FilterPill(
                          label: opt.label,
                          selected: _hours == opt.hours,
                          onTap: () => setState(() => _hours = opt.hours),
                        ),
                    ],
                  ),
                  const SizedBox(height: 12),
                  Text(
                    'Одноразовый промокод; по ссылке скидка применится сама.',
                    style: AppText.caption(context),
                  ),
                  const SizedBox(height: 14),
                  PrimaryButton(
                    label: 'Отправить промокод $_percent%',
                    icon: LucideIcons.send,
                    busy: _sendingKind == 'discount',
                    onPressed: canSend && !busy
                        ? () => _send(v1api.ChatOfferBody(kind: 'discount', percent: _percent, hours: _hours))
                        : null,
                  ),
                ],
              ),
            )
          else if (o.order == null && o.book == null)
            Padding(
              padding: const EdgeInsets.only(top: 4),
              child: Text(
                'У клиента нет неоплаченного заказа и книги в работе, а право выдавать персональную скидку отключено.',
                style: AppText.caption(context),
                textAlign: TextAlign.center,
              ),
            ),
        ],
      ),
    );
  }
}
