import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:provider/provider.dart';

import '../../api/mybook_api.g.dart' as v1api;
import '../../core/api.dart';
import '../../core/auth.dart';
import '../../core/format.dart';
import '../../core/v1.dart';
import '../../ui/kit.dart';
import '../../ui/tokens.dart';
import '../../widgets/crm_form.dart';
import '../money/money_widgets.dart';

/// Промокоды (API v1 crmPromos): итоги, все коды с использованием, оплаченными заказами и выручкой; переключатель —
/// включить или выключить код; «+» — новый код (процент или сумма, лимит использований, срок, заметка).
class PromosScreen extends StatefulWidget {
  const PromosScreen({super.key});

  @override
  State<PromosScreen> createState() => _PromosScreenState();
}

class _PromosScreenState extends State<PromosScreen> {
  v1api.Promos? _p;
  String? _error;
  bool _loading = false;

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
      final p = await v1(_api, (c) => c.crmPromos());
      if (mounted) setState(() => _p = p);
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _toggle(v1api.PromoRow r) async {
    try {
      await v1(_api, (c) => c.crmPromoToggle(id: r.id));
      HapticFeedback.selectionClick();
      _load();
    } on ApiException catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
    }
  }

  @override
  Widget build(BuildContext context) {
    final p = _p;
    final c = context.c;
    return MoneyPage(
      title: 'Промокоды',
      subtitle: 'Скидка — на книги, доставка оплачивается полностью',
      period: null,
      onPeriod: null,
      onRefresh: _load,
      loading: _loading,
      error: _error,
      actions: [
        RoundIconButton(icon: LucideIcons.plus, size: 44, iconSize: 24, color: c.brand, tooltip: 'Новый промокод', onTap: () async {
          final ok = await Navigator.of(context).push<bool>(MaterialPageRoute(builder: (_) => const _PromoForm()));
          if (ok == true) _load();
        }),
      ],
      children: p == null
          ? const []
          : [
              StatGrid(tiles: [
                StatTile(label: 'Кодов', value: '${p.totals.count}', note: 'активных ${p.totals.active}'),
                StatTile(label: 'Использований', value: '${p.totals.used}'),
                StatTile(label: 'Оплачено заказов', value: '${p.totals.paid}'),
                StatTile(label: 'Выручка с кодами', value: money(p.totals.revenue)),
              ]),
              const SizedBox(height: 8),
              if (p.rows.isEmpty)
                const MoneyEmpty('Кодов пока нет — создайте кнопкой «+»: для блогера, рассылки или постоянного клиента')
              else
                GroupCard(padding: EdgeInsets.zero, children: [
                  for (final r in p.rows)
                    SwitchListTile.adaptive(
                      value: r.active,
                      activeTrackColor: c.brand,
                      onChanged: (_) => _toggle(r),
                      title: Row(children: [
                        Text(r.code, style: TextStyle(fontSize: 15.5, fontWeight: FontWeight.w700, color: c.text, fontFamily: 'monospace')),
                        const SizedBox(width: 8),
                        Tag(r.discount, fg: c.brand, bg: c.brand.withValues(alpha: 0.1)),
                      ]),
                      subtitle: Text(
                        [
                          'использован ${r.used}${r.maxUses != null ? ' из ${r.maxUses}' : ''}',
                          r.until,
                          if (r.paid > 0) 'оплачено ${r.paid}, ${money(r.revenue)}',
                          if (r.note.isNotEmpty) r.note,
                        ].join(' · '),
                        style: AppText.caption(context),
                      ),
                    ),
                ]),
            ],
    );
  }
}

class _PromoForm extends StatefulWidget {
  const _PromoForm();

  @override
  State<_PromoForm> createState() => _PromoFormState();
}

class _PromoFormState extends State<_PromoForm> {
  final _code = TextEditingController();
  final _value = TextEditingController();
  final _max = TextEditingController();
  final _note = TextEditingController();
  String _kind = 'percent';
  String? _until;
  bool _busy = false;

  @override
  void dispose() {
    for (final c in [_code, _value, _max, _note]) {
      c.dispose();
    }
    super.dispose();
  }

  void _toast(String t) => ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(t)));

  Future<void> _save() async {
    final code = _code.text.trim().toUpperCase();
    final value = int.tryParse(_value.text.replaceAll(RegExp(r'\s'), ''));
    if (!RegExp(r'^[A-Z0-9_-]{3,40}$').hasMatch(code)) return _toast('Код: 3–40 символов, латиница, цифры, - и _');
    if (value == null || value <= 0) return _toast('Укажите размер скидки');
    if (_kind == 'percent' && value > 100) return _toast('Процент — не больше 100');
    setState(() => _busy = true);
    try {
      final r = await v1(
        context.read<AuthState>().api,
        (c) => c.crmPromoCreate(body: v1api.PromoBody(code: code, kind: _kind, value: value, maxUses: int.tryParse(_max.text.trim()), expiresAt: _until, note: _note.text.trim().isEmpty ? null : _note.text.trim())),
      );
      if (!mounted) return;
      _toast(r.message ?? 'Промокод создан');
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
    return Scaffold(
      backgroundColor: c.surface,
      appBar: AppBar(backgroundColor: c.bg, surfaceTintColor: Colors.transparent, title: Text('Новый промокод', style: AppText.headline(context))),
      body: ListView(padding: const EdgeInsets.only(top: 16, bottom: 40), children: [
        FormSection(title: 'Код и скидка', children: [
          LabeledField(label: 'Код', controller: _code, hint: 'BLOGER15', autocorrect: false, capitalization: TextCapitalization.characters),
          Padding(
            padding: const EdgeInsets.only(bottom: 12),
            child: Row(children: [
              FilterPill(label: 'Процент', selected: _kind == 'percent', onTap: () => setState(() => _kind = 'percent')),
              const SizedBox(width: 8),
              FilterPill(label: 'Сумма, ₸', selected: _kind == 'fixed', onTap: () => setState(() => _kind = 'fixed')),
            ]),
          ),
          LabeledField(label: _kind == 'percent' ? 'Скидка, %' : 'Скидка, ₸', controller: _value, keyboard: TextInputType.number),
        ]),
        FormSection(title: 'Ограничения', children: [
          LabeledField(label: 'Сколько раз можно использовать', controller: _max, keyboard: TextInputType.number, hint: 'без ограничения'),
          GroupCard(padding: const EdgeInsets.only(bottom: 14), children: [
            ChoiceRow(
              label: 'Действует до',
              icon: LucideIcons.calendar,
              value: _until == null ? 'бессрочно' : _until!.split('-').reversed.join('.'),
              onTap: () async {
                final now = DateTime.now();
                final d = await showDatePicker(context: context, firstDate: now, lastDate: now.add(const Duration(days: 730)), initialDate: now.add(const Duration(days: 30)), locale: const Locale('ru'));
                if (d != null) setState(() => _until = '${d.year}-${two(d.month)}-${two(d.day)}');
              },
            ),
            if (_until != null) GroupTile(title: 'Бессрочно', icon: LucideIcons.x, onTap: () => setState(() => _until = null)),
          ]),
          LabeledField(label: 'Заметка', controller: _note, hint: 'для кого код'),
        ]),
        Padding(padding: const EdgeInsets.symmetric(horizontal: 16), child: PrimaryButton(label: 'Создать промокод', icon: LucideIcons.check, busy: _busy, onPressed: _save)),
      ]),
    );
  }
}
