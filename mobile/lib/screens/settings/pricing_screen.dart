import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:provider/provider.dart';

import '../../api/mybook_api.g.dart' as v1api;
import '../../core/api.dart';
import '../../core/auth.dart';
import '../../core/v1.dart';
import '../../ui/kit.dart';
import '../../ui/tokens.dart';
import '../../widgets/crm_form.dart';

/// «Цены и тарифы» (API v1 crmPricing): поля — с сервера (тарифы, допы, доставка, пакеты ИИ и видео), сохранение — всё
/// разом тем же действием, что форма сайта: цены сразу действуют на витрине, в оформлении, у бота и в лимите скидки.
class PricingScreen extends StatefulWidget {
  const PricingScreen({super.key});

  @override
  State<PricingScreen> createState() => _PricingScreenState();
}

class _PricingScreenState extends State<PricingScreen> {
  v1api.PricingForm? _f;
  String? _error;
  bool _busy = false;
  bool _dirty = false;
  final _text = <String, TextEditingController>{};
  final _on = <String, bool>{};

  ApiClient get _api => context.read<AuthState>().api;

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    for (final c in _text.values) {
      c.dispose();
    }
    super.dispose();
  }

  Future<void> _load() async {
    setState(() => _error = null);
    try {
      final f = await v1(_api, (c) => c.crmPricing());
      if (!mounted) return;
      for (final s in f.sections) {
        for (final x in s.fields) {
          if (x.kind == 'switch') {
            _on[x.key] = x.value == 'on';
          } else {
            (_text[x.key] ??= TextEditingController()).text = x.value;
          }
        }
      }
      setState(() {
        _f = f;
        _dirty = false;
      });
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    }
  }

  Future<void> _save() async {
    final f = _f!;
    final values = <String, String>{};
    for (final s in f.sections) {
      for (final x in s.fields) {
        values[x.key] = x.kind == 'switch' ? (_on[x.key]! ? 'on' : '') : _text[x.key]!.text.replaceAll(RegExp(r'\s'), '');
      }
    }
    if (!await confirm(context, title: 'Сохранить цены?', message: 'Новые цены сразу действуют на сайте, в счетах бота и в лимите скидки. Оформленные заказы не меняются.', ok: 'Сохранить')) return;
    setState(() => _busy = true);
    try {
      final r = await v1(_api, (c) => c.crmPricingSave(body: v1api.SettingsValuesBody(values: values)));
      HapticFeedback.mediumImpact();
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(r.message ?? 'Сохранено'), duration: const Duration(seconds: 6)));
      await _load();
    } on ApiException catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
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
      body: f == null
          ? (_error != null ? EmptyState(icon: LucideIcons.wifiOff, title: 'Не удалось открыть цены', hint: _error, action: 'Повторить', onAction: _load) : const Center(child: CircularProgressIndicator()))
          : GestureDetector(
              onTap: () => FocusManager.instance.primaryFocus?.unfocus(),
              child: ListView(
                keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
                padding: EdgeInsets.only(top: MediaQuery.of(context).padding.top + 10, bottom: 40),
                children: [
                  Padding(padding: const EdgeInsets.fromLTRB(20, 0, 20, 4), child: PageTitle('Цены и тарифы')),
                  Padding(padding: const EdgeInsets.fromLTRB(20, 0, 20, 16), child: Text(f.changed ? 'Цены изменены относительно заводских' : 'Заводские цены', style: AppText.sub(context))),
                  for (final s in f.sections)
                    FormSection(title: s.title, children: [
                      for (final x in s.fields.where((x) => x.kind != 'switch'))
                        LabeledField(label: x.label, controller: _text[x.key]!, keyboard: TextInputType.number, note: x.hint, onChanged: (_) => setState(() => _dirty = true)),
                      if (s.fields.any((x) => x.kind == 'switch'))
                        GroupCard(padding: const EdgeInsets.only(bottom: 14), children: [
                          for (final x in s.fields.where((x) => x.kind == 'switch'))
                            SwitchListTile.adaptive(
                              title: Text(x.label, style: AppText.body(context)),
                              value: _on[x.key]!,
                              activeTrackColor: c.brand,
                              onChanged: (v) => setState(() {
                                _on[x.key] = v;
                                _dirty = true;
                              }),
                            ),
                        ]),
                    ]),
                  Padding(padding: const EdgeInsets.symmetric(horizontal: 16), child: PrimaryButton(label: _dirty ? 'Сохранить цены' : 'Без изменений', icon: LucideIcons.check, busy: _busy, onPressed: _dirty ? _save : null)),
                ],
              ),
            ),
    );
  }
}
