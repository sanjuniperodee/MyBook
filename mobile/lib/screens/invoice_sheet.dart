import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:uuid/uuid.dart';

import '../api/mybook_api.g.dart' as v1api;
import '../core/api.dart';
import '../core/format.dart';
import '../core/v1.dart';
import '../ui/kit.dart';
import '../ui/tokens.dart';

const _channels = {
  'whatsapp': 'WhatsApp',
  'instagram': 'Instagram',
  'telegram': 'Telegram',
  'tiktok': 'TikTok',
  'facebook': 'Facebook',
  'youtube': 'YouTube',
  'vk': 'ВКонтакте',
  'bloggers': 'Блогеры',
  'call': 'Звонок',
  'recommendation': 'Рекомендация',
  'repeat': 'Повторная покупка',
  'offline': 'Офлайн',
  'other': 'Другое',
};

const _purposes = {'prepayment': 'Предоплата', 'remainder': 'Остаток', 'full': 'Вся сумма', 'custom': 'Своя сумма'};

/// Счёт на оплату из чата или сделки: договорённость (тариф, цена, количество), сумма и способ — Kaspi на номер клиента или
/// ссылка. Правила (лимит скидки, один открытый счёт, защита от двойного нажатия) проверяет сервер, как в CRM.
/// Возвращает true, если счёт выставлен.
Future<bool> showInvoiceSheet(BuildContext context, {required ApiClient api, String? dealId, String? conversationId}) async {
  final done = await showAppSheet<bool>(context, title: 'Счёт на оплату', icon: LucideIcons.receipt, full: true, builder: (_) => _InvoiceSheet(api: api, dealId: dealId, conversationId: conversationId));
  return done == true;
}

class _InvoiceSheet extends StatefulWidget {
  const _InvoiceSheet({required this.api, this.dealId, this.conversationId});
  final ApiClient api;
  final String? dealId;
  final String? conversationId;

  @override
  State<_InvoiceSheet> createState() => _InvoiceSheetState();
}

class _InvoiceSheetState extends State<_InvoiceSheet> {
  v1api.CrmInvoiceForm? _info;
  String? _loadError;
  String? _error;
  bool _busy = false;

  final _issueKey = const Uuid().v4();
  final _name = TextEditingController();
  final _agreed = TextEditingController();
  final _amount = TextEditingController();
  String? _plan;
  String _purpose = 'prepayment';
  String _locale = 'ru';
  String _channel = '';
  int _count = 1;
  bool _kaspi = false;
  final Set<String> _gifts = {};

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final info = await v1(widget.api, (c) => c.crmInvoiceForm(dealId: widget.dealId, conversationId: widget.conversationId));
      if (!mounted) return;
      setState(() {
        _info = info;
        _plan = info.plan;
        if (_plan == null && info.plans.isNotEmpty) _plan = info.plans.first.id;
        final agreed = info.agreedTotal;
        final selectedPlan = info.plans.where((p) => p.id == _plan).firstOrNull;
        final price = agreed > 0 ? agreed : (selectedPlan?.price ?? 0);
        _agreed.text = price > 0 ? '$price' : '';
        _name.text = info.clientName;
        _locale = info.locale.isNotEmpty ? info.locale : 'ru';
        _channel = info.channel;
        _gifts.addAll(info.gifts);
        _kaspi = info.kaspiPhoneMasked != null;
        _suggest();
      });
    } on ApiException catch (e) {
      if (mounted) setState(() => _loadError = e.message);
    }
  }

  int get _agreedTotal => int.tryParse(_agreed.text.trim()) ?? 0;

  /// Подсказка суммы по назначению: предоплата — половина, остаток — за вычетом внесённого, вся сумма.
  void _suggest() {
    final paid = _info?.paid ?? 0;
    final total = _agreedTotal * _count;
    int v;
    switch (_purpose) {
      case 'prepayment':
        v = (total / 2).round();
      case 'remainder':
        v = (total - paid).clamp(0, 1 << 31);
      case 'full':
        v = total;
      default:
        return;
    }
    _amount.text = v > 0 ? '$v' : '';
  }

  Future<void> _submit() async {
    final info = _info!;
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final r = await v1(
        widget.api,
        (c) => c.crmInvoiceIssue(
          body: v1api.CrmInvoiceBody(
            dealId: info.dealId ?? widget.dealId,
            conversationId: widget.conversationId,
            clientName: _name.text.trim(),
            locale: _locale,
            channel: _channel,
            plan: _plan!,
            agreedTotal: _agreedTotal,
            count: _count,
            amount: int.tryParse(_amount.text.trim()) ?? 0,
            purpose: _purpose,
            issueKey: _issueKey,
            kaspiPush: _kaspi && info.kaspiPhoneMasked != null,
            gifts: _gifts.toList(),
          ),
        ),
      );
      if (!mounted) return;
      await showDialog<void>(
        context: context,
        builder: (_) => AlertDialog(
          title: const Text('Счёт выставлен'),
          content: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(r.message),
            const SizedBox(height: 10),
            SelectableText(r.link, style: const TextStyle(fontSize: 13)),
          ]),
          actions: [
            TextButton(onPressed: () => Clipboard.setData(ClipboardData(text: r.link)), child: const Text('Скопировать ссылку')),
            FilledButton(onPressed: () => Navigator.of(context).pop(), child: const Text('Готово')),
          ],
        ),
      );
      if (mounted) Navigator.of(context).pop(true);
    } on ApiException catch (e) {
      setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final info = _info;
    if (info != null) return _form(context, info);
    return SizedBox(height: 260, child: _loadError != null ? EmptyState(icon: LucideIcons.circleAlert, title: 'Не удалось открыть форму', hint: _loadError, action: 'Повторить', onAction: _load) : const Center(child: CircularProgressIndicator()));
  }

  Widget _form(BuildContext context, v1api.CrmInvoiceForm info) {
    final plans = info.plans;
    final open = info.open;
    final closed = info.closed;
    final hasOrder = info.hasOrder;
    final maxDiscount = info.maxDiscountPercent;
    final selected = plans.where((p) => p.id == _plan).firstOrNull;
    final blocked = closed || hasOrder || open != null;
    final methods = info.methods;
    return ListView(
      shrinkWrap: true,
      padding: const EdgeInsets.fromLTRB(20, 0, 20, 24),
      children: [
        Text(info.chat != null ? 'Ссылка на оплату уйдёт клиенту в ${info.chat}' : 'Чата нет — ссылку на оплату отправьте клиенту сами', style: AppText.sub(context)),
        const SizedBox(height: 12),
        if (info.kaspiWarning != null) _notice(info.kaspiWarning!, warn: true),
        if (closed) _notice('Сделка закрыта — вернуть в работу нужно в CRM, потом выставить счёт.', warn: true),
        if (hasOrder) _notice('По сделке уже есть заказ — оплата идёт в заказе.', warn: true),
        if (open != null) _notice('Уже есть открытый счёт ${open.label} на ${money(open.amount)}. Отмените его в сделке, чтобы выставить новый.', warn: true),
        if (!blocked) ...[
          const _Label('Тариф договорённости'),
          Wrap(spacing: 8, runSpacing: 8, children: [
            for (final p in plans)
              FilterPill(
                label: '${p.label} · ${money(p.price)}',
                selected: _plan == p.id,
                onTap: () => setState(() {
                  _plan = p.id;
                  if (_agreedTotal == 0) _agreed.text = '${p.price}';
                  _suggest();
                }),
              ),
          ]),
          const SizedBox(height: 14),
          Row(children: [
            Expanded(child: _field(_agreed, 'Цена книги, ₸', onChanged: (_) => setState(_suggest))),
            const SizedBox(width: 12),
            _Stepper(value: _count, onChanged: (v) => setState(() {
              _count = v;
              _suggest();
            })),
          ]),
          if (maxDiscount != null && selected != null) Padding(padding: const EdgeInsets.only(top: 4), child: Text('Скидка от прайса — не больше $maxDiscount%', style: TextStyle(fontSize: 12, color: context.c.textMuted))),
          const SizedBox(height: 14),
          const _Label('Что оплачивает счёт'),
          Wrap(spacing: 8, runSpacing: 8, children: [
            for (final e in _purposes.entries)
              FilterPill(
                label: e.value,
                selected: _purpose == e.key,
                onTap: () => setState(() {
                  _purpose = e.key;
                  _suggest();
                }),
              ),
          ]),
          const SizedBox(height: 10),
          _field(_amount, 'Сумма счёта, ₸', onChanged: (_) => setState(() => _purpose = _purpose)),
          if (info.paid > 0) Padding(padding: const EdgeInsets.only(top: 4), child: Text('Уже внесено: ${money(info.paid)}', style: TextStyle(fontSize: 12, color: context.c.textMuted))),
          const SizedBox(height: 14),
          _field(_name, 'Имя клиента'),
          const SizedBox(height: 14),
          Row(children: [
            Expanded(
              child: DropdownButtonFormField<String>(
                initialValue: _channels.containsKey(_channel) ? _channel : null,
                decoration: const InputDecoration(labelText: 'Откуда пришёл клиент'),
                items: [for (final e in _channels.entries) DropdownMenuItem(value: e.key, child: Text(e.value))],
                onChanged: (v) => setState(() => _channel = v ?? ''),
              ),
            ),
            const SizedBox(width: 12),
            SegmentedButton<String>(segments: const [ButtonSegment(value: 'ru', label: Text('RU')), ButtonSegment(value: 'kk', label: Text('KK'))], selected: {_locale}, showSelectedIcon: false, onSelectionChanged: (s) => setState(() => _locale = s.first)),
          ]),
          if (selected != null && (selected.giftwrap || selected.printed)) ...[
            const SizedBox(height: 10),
            Wrap(spacing: 8, children: [
              if (selected.giftwrap) FilterChip(label: const Text('Упаковка бесплатно'), selected: _gifts.contains('giftwrap'), onSelected: (v) => setState(() => v ? _gifts.add('giftwrap') : _gifts.remove('giftwrap'))),
              if (selected.printed) FilterChip(label: const Text('Доставка бесплатно'), selected: _gifts.contains('delivery'), onSelected: (v) => setState(() => v ? _gifts.add('delivery') : _gifts.remove('delivery'))),
            ]),
          ],
          if (info.kaspiPhoneMasked != null && methods.kaspi)
            SwitchListTile(contentPadding: EdgeInsets.zero, value: _kaspi, onChanged: (v) => setState(() => _kaspi = v), title: const Text('Счёт в приложение Kaspi'), subtitle: Text('на номер ${info.kaspiPhoneMasked}')),
          if (_error != null) Padding(padding: const EdgeInsets.only(top: 8), child: Text(_error!, style: TextStyle(color: context.c.danger, fontWeight: FontWeight.w500))),
          const SizedBox(height: 14),
          PrimaryButton(label: info.chat != null ? 'Выставить и отправить в чат' : 'Выставить счёт', icon: LucideIcons.send, busy: _busy, onPressed: _channel.isEmpty || _plan == null ? null : _submit),
        ],
      ],
    );
  }

  Widget _field(TextEditingController c, String label, {ValueChanged<String>? onChanged}) => TextField(
        controller: c,
        onChanged: onChanged,
        keyboardType: label.contains('₸') ? TextInputType.number : TextInputType.text,
        inputFormatters: label.contains('₸') ? [FilteringTextInputFormatter.digitsOnly] : null,
        decoration: InputDecoration(labelText: label),
      );

  Widget _notice(String text, {required bool warn}) => Container(
        margin: const EdgeInsets.only(bottom: 10),
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(color: context.c.warnBg, borderRadius: BorderRadius.circular(12)),
        child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [Icon(LucideIcons.info, size: 17, color: context.c.warn), const SizedBox(width: 9), Expanded(child: Text(text, style: TextStyle(color: context.c.warn, fontSize: 14, height: 1.3, fontWeight: FontWeight.w500)))]),
      );
}

class _Label extends StatelessWidget {
  const _Label(this.text);
  final String text;
  @override
  Widget build(BuildContext context) => Padding(padding: const EdgeInsets.only(bottom: 6), child: Text(text, style: TextStyle(fontSize: 12.5, fontWeight: FontWeight.w600, color: context.c.textMuted)));
}

class _Stepper extends StatelessWidget {
  const _Stepper({required this.value, required this.onChanged});
  final int value;
  final ValueChanged<int> onChanged;

  @override
  Widget build(BuildContext context) => Row(children: [
        IconButton.outlined(visualDensity: VisualDensity.compact, onPressed: value > 1 ? () => onChanged(value - 1) : null, icon: const Icon(Icons.remove)),
        Padding(padding: const EdgeInsets.symmetric(horizontal: 8), child: Text('$value кн.', style: const TextStyle(fontWeight: FontWeight.w600))),
        IconButton.outlined(visualDensity: VisualDensity.compact, onPressed: value < 20 ? () => onChanged(value + 1) : null, icon: const Icon(Icons.add)),
      ]);
}
