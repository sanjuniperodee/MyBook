import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../core/api.dart';
import '../ui/kit.dart';
import '../ui/tokens.dart';

/// Лист «Новая сделка» (вручную: клиент позвонил, пришёл лично). Возвращает id созданной сделки.
Future<String?> showNewDealSheet(BuildContext context, {required ApiClient api, String? clientId, String? contactName, String? contactPhone}) {
  return showAppSheet<String>(
    context,
    title: 'Новая сделка',
    icon: LucideIcons.handshake,
    full: true,
    builder: (_) => _NewDeal(api: api, clientId: clientId, contactName: contactName, contactPhone: contactPhone),
  );
}

class _NewDeal extends StatefulWidget {
  const _NewDeal({required this.api, this.clientId, this.contactName, this.contactPhone});
  final ApiClient api;
  final String? clientId;
  final String? contactName;
  final String? contactPhone;

  @override
  State<_NewDeal> createState() => _NewDealState();
}

class _NewDealState extends State<_NewDeal> {
  late final _title = TextEditingController(text: widget.contactName == null || widget.contactName!.isEmpty ? '' : 'Сделка · ${widget.contactName}');
  late final _name = TextEditingController(text: widget.contactName ?? '');
  late final _phone = TextEditingController(text: widget.contactPhone ?? '');
  final _amount = TextEditingController();
  bool _busy = false;
  String? _error;

  @override
  void dispose() {
    _title.dispose();
    _name.dispose();
    _phone.dispose();
    _amount.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    final title = _title.text.trim();
    if (title.length < 2) {
      setState(() => _error = 'Назовите сделку');
      return;
    }
    setState(() {
      _busy = true;
      _error = null;
    });
    final amount = int.tryParse(_amount.text.replaceAll(RegExp(r'\s'), ''));
    try {
      final r = await widget.api.post('/api/mobile/deals', body: {
        'title': title,
        if (_name.text.trim().isNotEmpty) 'contactName': _name.text.trim(),
        if (_phone.text.trim().isNotEmpty) 'contactPhone': _phone.text.trim(),
        'amount': ?amount,
        'clientId': ?widget.clientId,
      }) as Map<String, dynamic>;
      if (mounted) Navigator.pop(context, r['id'] as String?);
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
    final fixedContact = widget.clientId != null;
    return SingleChildScrollView(
      padding: const EdgeInsets.fromLTRB(20, 4, 20, 24),
      child: Column(children: [
        TextField(controller: _title, autofocus: true, textCapitalization: TextCapitalization.sentences, decoration: const InputDecoration(hintText: 'Название сделки')),
        const SizedBox(height: 12),
        TextField(controller: _name, enabled: !fixedContact, textCapitalization: TextCapitalization.words, decoration: const InputDecoration(hintText: 'Имя клиента')),
        const SizedBox(height: 12),
        TextField(controller: _phone, enabled: !fixedContact, keyboardType: TextInputType.phone, decoration: const InputDecoration(hintText: 'Телефон')),
        const SizedBox(height: 12),
        TextField(controller: _amount, keyboardType: TextInputType.number, decoration: const InputDecoration(hintText: 'Сумма, ₸ (необязательно)')),
        if (_error != null) Padding(padding: const EdgeInsets.only(top: 14), child: Align(alignment: Alignment.centerLeft, child: Text(_error!, style: TextStyle(color: c.danger, fontWeight: FontWeight.w600)))),
        const SizedBox(height: 22),
        PrimaryButton(label: 'Создать сделку', busy: _busy, onPressed: _save),
      ]),
    );
  }
}
