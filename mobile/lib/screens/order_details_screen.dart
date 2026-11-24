import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:provider/provider.dart';

import '../api/mybook_api.g.dart' as v1api;
import '../core/api.dart';
import '../core/auth.dart';
import '../core/format.dart';
import '../core/v1.dart';
import '../ui/kit.dart';
import '../ui/tokens.dart';
import '../widgets/crm_form.dart';

/// Получатель, контакты и доставка заказа — как форма «Изменить контакты и доставку» карточки заказа на сайте (API v1
/// crmOrderDetails / crmOrderDetailsUpdate, то же действие сайта: проверки, журнал заказа). Сохраняет всё разом.
class OrderDetailsScreen extends StatefulWidget {
  const OrderDetailsScreen({super.key, required this.orderId, required this.number});
  final String orderId;
  final int number;

  @override
  State<OrderDetailsScreen> createState() => _OrderDetailsScreenState();
}

class _OrderDetailsScreenState extends State<OrderDetailsScreen> {
  v1api.OrderDetailsForm? _f;
  String? _error;
  bool _busy = false;
  final _name = TextEditingController();
  final _phone = TextEditingController();
  final _email = TextEditingController();
  final _country = TextEditingController();
  final _city = TextEditingController();
  final _address = TextEditingController();
  final _postal = TextEditingController();
  final _gift = TextEditingController();
  String? _method;
  String? _date;

  ApiClient get _api => context.read<AuthState>().api;

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    for (final c in [_name, _phone, _email, _country, _city, _address, _postal, _gift]) {
      c.dispose();
    }
    super.dispose();
  }

  Future<void> _load() async {
    setState(() => _error = null);
    try {
      final f = await v1(_api, (c) => c.crmOrderDetails(orderId: widget.orderId));
      if (!mounted) return;
      _name.text = f.contactName;
      _phone.text = f.contactPhone;
      _email.text = f.contactEmail;
      _country.text = f.country ?? '';
      _city.text = f.city ?? '';
      _address.text = f.address ?? '';
      _postal.text = f.postalCode ?? '';
      _gift.text = f.giftNote ?? '';
      setState(() {
        _f = f;
        _method = f.deliveryMethod;
        _date = f.desiredDate;
      });
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    }
  }

  void _toast(String text) => ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(text)));

  String? _opt(TextEditingController c) => c.text.trim().isEmpty ? null : c.text.trim();

  Future<void> _save() async {
    if (_name.text.trim().isEmpty) return _toast('Укажите имя получателя');
    if (_phone.text.trim().length < 5) return _toast('Укажите телефон');
    if (!_email.text.contains('@')) return _toast('Проверьте e-mail');
    setState(() => _busy = true);
    try {
      final r = await v1(
        _api,
        (c) => c.crmOrderDetailsUpdate(
          orderId: widget.orderId,
          body: v1api.OrderDetailsBody(
            contactName: _name.text.trim(),
            contactPhone: _phone.text.trim(),
            contactEmail: _email.text.trim(),
            deliveryMethod: _method,
            country: _method == 'abroad' ? _opt(_country) : null,
            city: _opt(_city),
            address: _opt(_address),
            postalCode: _opt(_postal),
            desiredDate: _date,
            giftNote: _opt(_gift),
          ),
        ),
      );
      if (!mounted) return;
      _toast(r.message ?? 'Сохранено');
      Navigator.of(context).pop(true);
    } on ApiException catch (e) {
      if (mounted) _toast(e.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final c = context.c;
    final f = _f;
    return Scaffold(
      backgroundColor: c.surface,
      appBar: AppBar(backgroundColor: c.bg, surfaceTintColor: Colors.transparent, title: Text('Контакты и доставка', style: AppText.headline(context))),
      body: f == null
          ? (_error != null ? EmptyState(icon: LucideIcons.wifiOff, title: 'Не удалось открыть', hint: _error, action: 'Повторить', onAction: _load) : const Center(child: CircularProgressIndicator()))
          : GestureDetector(
              onTap: () => FocusManager.instance.primaryFocus?.unfocus(),
              child: ListView(
                keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
                padding: const EdgeInsets.only(top: 16, bottom: 40),
                children: [
                  if (!f.canEdit)
                    Padding(
                      padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
                      child: Text('Править контакты заказа может сотрудник с правом «Заказы: изменение» и полным доступом к контактам.', style: AppText.caption(context)),
                    ),
                  FormSection(title: 'Получатель', hint: 'кому звонить и писать о заказе', children: [
                    LabeledField(label: 'Имя', controller: _name, enabled: f.canEdit, autocorrect: false, capitalization: TextCapitalization.words),
                    LabeledField(label: 'Телефон', controller: _phone, enabled: f.canEdit, keyboard: TextInputType.phone),
                    LabeledField(label: 'E-mail', controller: _email, enabled: f.canEdit, keyboard: TextInputType.emailAddress, autocorrect: false),
                  ]),
                  FormSection(title: 'Доставка', children: [
                    GroupCard(padding: const EdgeInsets.only(bottom: 14), children: [
                      ChoiceRow(
                        label: 'Способ',
                        icon: LucideIcons.truck,
                        value: f.deliveryMethods.where((x) => x.id == _method).map((x) => x.label).firstOrNull ?? 'не выбран',
                        onTap: f.canEdit
                            ? () async {
                                final v = await pickChoice(context, title: 'Способ доставки', options: [for (final x in f.deliveryMethods) (x.id, x.label)], current: _method, emptyLabel: 'Не выбран');
                                if (v != null) setState(() => _method = v.isEmpty ? null : v);
                              }
                            : null,
                      ),
                    ]),
                    if (_method == 'abroad') LabeledField(label: 'Страна', controller: _country, enabled: f.canEdit, capitalization: TextCapitalization.words, note: 'Казахстан не указывать'),
                    if (_method != 'pickup') ...[
                      LabeledField(label: 'Город', controller: _city, enabled: f.canEdit, capitalization: TextCapitalization.words),
                      LabeledField(label: 'Адрес', controller: _address, enabled: f.canEdit, lines: 2),
                      LabeledField(label: 'Индекс', controller: _postal, enabled: f.canEdit, keyboard: TextInputType.number),
                    ],
                  ]),
                  FormSection(title: 'Пожелания', children: [
                    GroupCard(padding: const EdgeInsets.only(bottom: 14), children: [
                      ChoiceRow(
                        label: 'Нужна к',
                        icon: LucideIcons.calendar,
                        value: _date == null ? 'без даты' : _date!.split('-').reversed.join('.'),
                        onTap: f.canEdit
                            ? () async {
                                final now = DateTime.now();
                                final init = _date == null ? now.add(const Duration(days: 14)) : DateTime.parse(_date!);
                                final d = await showDatePicker(context: context, firstDate: init.isBefore(now) ? init : now, lastDate: now.add(const Duration(days: 365)), initialDate: init, locale: const Locale('ru'));
                                if (d != null) setState(() => _date = '${d.year}-${two(d.month)}-${two(d.day)}');
                              }
                            : null,
                      ),
                      if (_date != null && f.canEdit) GroupTile(title: 'Убрать дату', icon: LucideIcons.x, onTap: () => setState(() => _date = null)),
                    ]),
                    LabeledField(label: 'Текст открытки', controller: _gift, enabled: f.canEdit, lines: 3),
                  ]),
                  if (f.canEdit)
                    Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 16),
                      child: PrimaryButton(label: 'Сохранить', icon: LucideIcons.check, busy: _busy, onPressed: _save),
                    ),
                ],
              ),
            ),
    );
  }
}
