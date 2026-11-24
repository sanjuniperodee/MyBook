import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:provider/provider.dart';

import '../api/mybook_api.g.dart' as api;
import '../core/api.dart';
import '../core/auth.dart';
import '../core/format.dart';
import '../core/v1.dart';
import '../ui/kit.dart';
import '../ui/tokens.dart';
import '../widgets/crm_form.dart';

/// Правка сделки — как карточка сделки на сайте: основное, контакты, теги, свои поля и договорённость (тариф и что
/// бесплатно). Данные — API v1 (crmDealForm / crmDealUpdate / crmDealPlan / crmDealGifts), права и лимит скидки — сервер.
class DealEditScreen extends StatefulWidget {
  const DealEditScreen({super.key, required this.dealId});
  final String dealId;

  @override
  State<DealEditScreen> createState() => _DealEditScreenState();
}

class _DealEditScreenState extends State<DealEditScreen> {
  api.DealForm? _f;
  String? _error;
  bool _saving = false;
  bool _changed = false;

  final _title = TextEditingController();
  final _contact = TextEditingController();
  final _amount = TextEditingController();
  final _phone = TextEditingController();
  final _email = TextEditingController();
  String _source = '';
  List<String> _tags = [];
  List<String> _extraPhones = [];
  final Map<String, String> _fields = {};
  // Договорённость сохраняется сразу — своё состояние, отдельно от формы.
  String? _plan;
  List<String> _gifts = [];
  List<api.Choice> _giftOptions = [];
  bool _locked = false;

  ApiClient get _api => context.read<AuthState>().api;

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    for (final c in [_title, _contact, _amount, _phone, _email]) {
      c.dispose();
    }
    super.dispose();
  }

  Future<void> _load() async {
    setState(() => _error = null);
    try {
      final f = await v1(_api, (c) => c.crmDealForm(dealId: widget.dealId));
      if (!mounted) return;
      setState(() {
        _f = f;
        _title.text = f.title;
        _contact.text = f.contactName;
        _amount.text = f.amount == 0 ? '' : f.amount.toString();
        _phone.text = f.phone ?? '';
        _email.text = f.email ?? '';
        _source = f.source;
        _tags = [...f.tags];
        _extraPhones = [...f.extraPhones];
        _fields
          ..clear()
          ..addEntries(f.fields.map((x) => MapEntry(x.key, x.value)));
        _plan = f.plan;
        _gifts = [...f.gifts];
        _giftOptions = [...f.giftOptions];
        _locked = f.agreementLocked;
        _changed = false;
      });
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    }
  }

  void _touch() {
    if (!_changed) setState(() => _changed = true);
  }

  /// В правку — только изменённое: сервер оставит остальное как было.
  api.DealPatch _patch(api.DealForm f) {
    final amount = int.tryParse(_amount.text.replaceAll(RegExp(r'\D'), '')) ?? 0;
    final fields = {for (final x in f.fields) if ((_fields[x.key] ?? '') != x.value) x.key: _fields[x.key] ?? ''};
    final contactsChanged = f.canEditContacts && (_phone.text.trim() != (f.phone ?? '') || _email.text.trim() != (f.email ?? '') || _extraPhones.join(',') != f.extraPhones.join(','));
    return api.DealPatch(
      title: _title.text.trim() != f.title ? _title.text.trim() : null,
      contactName: _contact.text.trim() != f.contactName ? _contact.text.trim() : null,
      amount: amount != f.amount ? amount : null,
      source: _source != f.source ? _source : null,
      tags: _tags.join(',') != f.tags.join(',') ? _tags : null,
      phone: contactsChanged ? _phone.text.trim() : null,
      email: contactsChanged ? _email.text.trim() : null,
      extraPhones: contactsChanged ? _extraPhones : null,
      fields: fields.isEmpty ? null : fields,
    );
  }

  Future<void> _save() async {
    final f = _f;
    if (f == null) return;
    if (_title.text.trim().length < 2) return _toast('Назовите сделку');
    FocusManager.instance.primaryFocus?.unfocus();
    setState(() => _saving = true);
    try {
      final r = await v1(_api, (c) => c.crmDealUpdate(dealId: f.id, body: _patch(f)));
      if (!mounted) return;
      _toast(r.message ?? 'Сохранено');
      Navigator.of(context).pop(true);
    } on ApiException catch (e) {
      _toast(e.message);
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  Future<void> _setPlan() async {
    final f = _f!;
    final v = await pickChoice(context, title: 'Тариф договорённости', options: [for (final p in f.plans) (p.id, '${p.label} — ${money(p.price)}')], current: _plan, emptyLabel: 'Не указан — клиент выберет сам');
    if (v == null || v == (_plan ?? '')) return;
    try {
      final r = await v1(_api, (c) => c.crmDealPlan(dealId: f.id, body: api.DealPlanBody(plan: v.isEmpty ? null : v)));
      _toast(r.message ?? 'Тариф сохранён');
      await _reloadAgreement();
    } on ApiException catch (e) {
      _toast(e.message);
    }
  }

  Future<void> _toggleGift(String id, bool on) async {
    final f = _f!;
    final next = on ? [..._gifts, id] : _gifts.where((g) => g != id).toList();
    try {
      await v1(_api, (c) => c.crmDealGifts(dealId: f.id, body: api.DealGiftsBody(gifts: next)));
      await _reloadAgreement();
    } on ApiException catch (e) {
      _toast(e.message);
    }
  }

  /// Тариф и подарки сохраняются сразу (как на сайте); остальное, что успели поправить, — не трогаем.
  Future<void> _reloadAgreement() async {
    final f = await v1(_api, (c) => c.crmDealForm(dealId: widget.dealId));
    if (!mounted) return;
    setState(() {
      _plan = f.plan;
      _gifts = [...f.gifts];
      _giftOptions = [...f.giftOptions];
      _locked = f.agreementLocked;
    });
  }

  void _toast(String text) {
    if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(text)));
  }

  Future<bool> _confirmLeave() async => !_changed || await confirm(context, title: 'Выйти без сохранения?', message: 'Изменения в сделке не сохранятся.', ok: 'Выйти', destructive: true);

  @override
  Widget build(BuildContext context) {
    final c = context.c;
    final f = _f;
    return PopScope(
      canPop: !_changed,
      onPopInvokedWithResult: (didPop, _) async {
        if (!didPop && await _confirmLeave() && context.mounted) Navigator.of(context).pop();
      },
      child: Scaffold(
        backgroundColor: c.surface,
        appBar: AppBar(
          backgroundColor: c.bg,
          surfaceTintColor: Colors.transparent,
          title: Text(f == null ? 'Сделка' : 'Сделка №${f.number}', style: AppText.headline(context)),
          actions: [
            if (f != null && f.canEdit)
              Padding(
                padding: const EdgeInsets.only(right: 8),
                child: TextButton(
                  onPressed: _saving || !_changed ? null : _save,
                  child: _saving ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2)) : Text('Сохранить', style: TextStyle(fontWeight: FontWeight.w600, color: _changed ? c.brand : c.textFaint, fontSize: 16)),
                ),
              ),
          ],
        ),
        body: f == null
            ? (_error != null ? EmptyState(icon: LucideIcons.circleAlert, title: 'Не удалось открыть сделку', hint: _error, action: 'Повторить', onAction: _load) : const Center(child: CircularProgressIndicator()))
            : GestureDetector(
                onTap: () => FocusManager.instance.primaryFocus?.unfocus(),
                child: ListView(
                  keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
                  padding: const EdgeInsets.only(top: 16, bottom: 40),
                  children: [
                    if (!f.canEdit)
                      Padding(
                        padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
                        child: Text('Только просмотр: сделка не ваша или нет права её менять.', style: AppText.sub(context).copyWith(color: c.warn)),
                      ),
                    FormSection(title: 'Основное', children: [
                      LabeledField(label: 'Название', controller: _title, enabled: f.canEdit, onChanged: (_) => _touch()),
                      LabeledField(label: 'Контактное лицо', controller: _contact, enabled: f.canEdit, onChanged: (_) => _touch()),
                      LabeledField(
                        label: 'Сумма, ₸',
                        controller: _amount,
                        keyboard: TextInputType.number,
                        enabled: f.canEdit,
                        note: f.maxDiscountPercent == null ? null : 'Ваш лимит скидки — ${f.maxDiscountPercent!.round()}% от прайса тарифа',
                        onChanged: (_) => _touch(),
                      ),
                      GroupCard(padding: EdgeInsets.zero, children: [
                        ChoiceRow(
                          label: 'Источник',
                          value: f.sources.where((s) => s.id == _source).map((s) => s.label).firstOrNull ?? _source,
                          onTap: !f.canEdit
                              ? null
                              : () async {
                                  final v = await pickChoice(context, title: 'Источник', options: [for (final s in f.sources) (s.id, s.label)], current: _source);
                                  if (v != null && v.isNotEmpty && v != _source) {
                                    setState(() => _source = v);
                                    _touch();
                                  }
                                },
                        ),
                      ]),
                    ]),
                    if (f.phone != null)
                      FormSection(title: 'Контакты', children: [
                        LabeledField(label: 'Телефон', controller: _phone, keyboard: TextInputType.phone, enabled: f.canEdit && f.canEditContacts, onChanged: (_) => _touch()),
                        LabeledField(label: 'Почта', controller: _email, keyboard: TextInputType.emailAddress, enabled: f.canEdit && f.canEditContacts, onChanged: (_) => _touch()),
                        const FormLabel('Дополнительные номера', hint: 'По ним сделку узнают в звонках и WhatsApp'),
                        PhonesEditor(
                          phones: _extraPhones,
                          enabled: f.canEdit && f.canEditContacts,
                          onChanged: (v) {
                            _extraPhones = v;
                            _touch();
                          },
                        ),
                      ]),
                    FormSection(title: 'Теги', children: [
                      TagsEditor(
                        tags: _tags,
                        enabled: f.canEdit,
                        onChanged: (v) {
                          setState(() => _tags = v);
                          _touch();
                        },
                      ),
                    ]),
                    if (f.fields.isNotEmpty)
                      FormSection(title: 'Свои поля', children: [
                        CustomFieldsEditor(
                          fields: f.fields,
                          values: _fields,
                          enabled: f.canEdit,
                          onChanged: (k, v) {
                            setState(() => _fields[k] = v);
                            _touch();
                          },
                        ),
                      ]),
                    FormSection(
                      title: 'Договорённость',
                      hint: _locked ? 'По сделке уже оформлен заказ — тариф и условия не меняются' : 'Клиент увидит это при оформлении заказа. Сохраняется сразу.',
                      children: [
                        GroupCard(padding: EdgeInsets.zero, children: [
                          ChoiceRow(
                            label: 'Тариф',
                            icon: LucideIcons.bookOpen,
                            value: f.plans.where((p) => p.id == _plan).map((p) => p.label).firstOrNull ?? 'Клиент выберет сам',
                            onTap: f.canEdit && !_locked ? _setPlan : null,
                          ),
                          for (final g in _giftOptions)
                            SwitchListTile.adaptive(
                              title: Text('${g.label} бесплатно', style: AppText.body(context)),
                              value: _gifts.contains(g.id),
                              activeTrackColor: c.brand,
                              onChanged: f.canEdit && !_locked ? (v) => _toggleGift(g.id, v) : null,
                            ),
                        ]),
                      ],
                    ),
                  ],
                ),
              ),
      ),
    );
  }
}
