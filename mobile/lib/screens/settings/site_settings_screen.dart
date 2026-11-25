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

/// «Сайт» (API v1 crmSite): регистрация открыта или закрыта, поле открытки при оформлении — переключаются сразу; предел
/// фото в книге и реквизиты продавца (оферта, футер, упаковочный лист) — кнопкой «Сохранить».
class SiteSettingsScreen extends StatefulWidget {
  const SiteSettingsScreen({super.key});

  @override
  State<SiteSettingsScreen> createState() => _SiteSettingsScreenState();
}

class _SiteSettingsScreenState extends State<SiteSettingsScreen> {
  v1api.SiteSettings? _s;
  String? _error;
  bool _busy = false;
  bool _dirty = false;
  final _photos = TextEditingController();
  final _name = TextEditingController();
  final _bin = TextEditingController();
  final _phone = TextEditingController();
  final _wa = TextEditingController();

  ApiClient get _api => context.read<AuthState>().api;

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    for (final c in [_photos, _name, _bin, _phone, _wa]) {
      c.dispose();
    }
    super.dispose();
  }

  Future<void> _load() async {
    setState(() => _error = null);
    try {
      final s = await v1(_api, (c) => c.crmSite());
      if (!mounted) return;
      _photos.text = '${s.maxPhotos}';
      _name.text = s.seller.legalName;
      _bin.text = s.seller.bin;
      _phone.text = s.seller.phone;
      _wa.text = s.seller.whatsapp;
      setState(() {
        _s = s;
        _dirty = false;
      });
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    }
  }

  void _toast(String t) => ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(t), duration: const Duration(seconds: 5)));

  Future<void> _patch(v1api.SiteSettingsPatch body) async {
    setState(() => _busy = true);
    try {
      final r = await v1(_api, (c) => c.crmSiteSave(body: body));
      HapticFeedback.lightImpact();
      _toast(r.message ?? 'Сохранено');
      await _load();
    } on ApiException catch (e) {
      _toast(e.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final c = context.c;
    final s = _s;
    void touch(String _) => setState(() => _dirty = true);
    return Scaffold(
      backgroundColor: c.surface,
      body: s == null
          ? (_error != null ? EmptyState(icon: LucideIcons.wifiOff, title: 'Не удалось открыть', hint: _error, action: 'Повторить', onAction: _load) : const Center(child: CircularProgressIndicator()))
          : GestureDetector(
              onTap: () => FocusManager.instance.primaryFocus?.unfocus(),
              child: ListView(
                keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
                padding: EdgeInsets.only(top: MediaQuery.of(context).padding.top + 10, bottom: 40),
                children: [
                  Padding(padding: const EdgeInsets.fromLTRB(20, 0, 20, 16), child: PageTitle('Сайт')),
                  FormSection(title: 'Сразу на сайте', children: [
                    GroupCard(padding: const EdgeInsets.only(bottom: 14), children: [
                      SwitchListTile.adaptive(
                        title: Text('Регистрация открыта', style: AppText.body(context)),
                        subtitle: Text(s.registration ? 'кнопки «Начать книгу» на сайте' : 'новые аккаунты не создаются', style: AppText.caption(context)),
                        value: s.registration,
                        activeTrackColor: c.brand,
                        onChanged: _busy
                            ? null
                            : (v) async {
                                if (!v && !await confirm(context, title: 'Закрыть регистрацию?', message: 'Кнопки скроются, новые клиенты не смогут завести аккаунт.', ok: 'Закрыть', destructive: true)) return;
                                await _patch(v1api.SiteSettingsPatch(registration: v));
                              },
                      ),
                      SwitchListTile.adaptive(
                        title: Text('Открытка к заказу', style: AppText.body(context)),
                        subtitle: Text('поле «Текст открытки» при оформлении', style: AppText.caption(context)),
                        value: s.giftNote,
                        activeTrackColor: c.brand,
                        onChanged: _busy ? null : (v) => _patch(v1api.SiteSettingsPatch(giftNote: v)),
                      ),
                    ]),
                  ]),
                  FormSection(title: 'Книги', children: [
                    LabeledField(label: 'Фото в одной книге — не больше', controller: _photos, keyboard: TextInputType.number, note: 'от 1 до ${s.maxPhotosCeiling}; уже загруженные остаются', onChanged: touch),
                  ]),
                  FormSection(title: 'Реквизиты продавца', hint: 'оферта, футер, сертификат, упаковочный лист; пусто — заглушка', children: [
                    LabeledField(label: 'Юр. название', controller: _name, hint: s.sellerPlaceholder.legalName, onChanged: touch),
                    LabeledField(label: 'БИН', controller: _bin, keyboard: TextInputType.number, hint: s.sellerPlaceholder.bin, onChanged: touch),
                    LabeledField(label: 'Телефон', controller: _phone, keyboard: TextInputType.phone, hint: s.sellerPlaceholder.phone, onChanged: touch),
                    LabeledField(label: 'WhatsApp магазина', controller: _wa, keyboard: TextInputType.phone, hint: s.sellerPlaceholder.whatsapp, note: 'общий с рекламными ссылками', onChanged: touch),
                  ]),
                  Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 16),
                    child: PrimaryButton(
                      label: _dirty ? 'Сохранить' : 'Без изменений',
                      icon: LucideIcons.check,
                      busy: _busy,
                      onPressed: !_dirty
                          ? null
                          : () {
                              final n = int.tryParse(_photos.text.trim());
                              if (n == null) return _toast('Предел фото — целое число');
                              _patch(v1api.SiteSettingsPatch(
                                maxPhotos: n,
                                seller: v1api.SellerDetails(legalName: _name.text.trim(), bin: _bin.text.trim(), phone: _phone.text.trim(), whatsapp: _wa.text.trim()),
                              ));
                            },
                    ),
                  ),
                ],
              ),
            ),
    );
  }
}
