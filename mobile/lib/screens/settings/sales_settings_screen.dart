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

/// Настройки отдела продаж с телефона (API v1 crmSettingsSales): режим AI-продажника — сразу при выборе; рабочее время,
/// норматив ответа, передача заявки, когда заводить сделку с сайта, лимит скидки, переключатели — кнопкой «Сохранить».
/// Остальные настройки (ключи, тексты бота, шаблоны, правила) — страницами CRM в разделе «Настройки».
class SalesSettingsScreen extends StatefulWidget {
  const SalesSettingsScreen({super.key});

  @override
  State<SalesSettingsScreen> createState() => _SalesSettingsScreenState();
}

class _SalesSettingsScreenState extends State<SalesSettingsScreen> {
  v1api.CrmSalesSettings? _s;
  String? _error;
  bool _busy = false;
  bool _dirty = false;

  Set<int> _days = {};
  String _from = '09:00';
  String _to = '18:00';
  String _autoDeal = 'off';
  late Map<String, bool> _flags;
  final _off = TextEditingController();
  final _sla = TextEditingController();
  final _reassign = TextEditingController();
  final _merge = TextEditingController();
  final _discount = TextEditingController();

  ApiClient get _api => context.read<AuthState>().api;

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    for (final c in [_off, _sla, _reassign, _merge, _discount]) {
      c.dispose();
    }
    super.dispose();
  }

  Future<void> _load() async {
    setState(() => _error = null);
    try {
      final s = await v1(_api, (c) => c.crmSettingsSales());
      if (!mounted) return;
      _off.text = s.off;
      _sla.text = '${s.slaMinutes}';
      _reassign.text = '${s.reassignMinutes}';
      _merge.text = '${s.mergeClosedDays}';
      _discount.text = '${s.maxDiscount}';
      setState(() {
        _s = s;
        _days = s.workDays.toSet();
        _from = s.from;
        _to = s.to;
        _autoDeal = s.autoDealFrom;
        _flags = {
          'unsorted': s.unsorted,
          'digest': s.digest,
          'autoLetters': s.autoLetters,
          'chatReward': s.chatReward,
          'widgetEnabled': s.widgetEnabled,
          'widgetChat': s.widgetChat,
          'widgetHelp': s.widgetHelp,
        };
        _dirty = false;
      });
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    }
  }

  void _toast(String t) => ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(t)));
  void _touch() => setState(() => _dirty = true);

  Future<void> _botMode(v1api.CrmSalesSettings s) async {
    final v = await pickChoice(context, title: 'AI-продажник', options: [for (final m in s.botModes) (m.id, m.label)], current: s.botMode);
    if (v == null || v == s.botMode || !mounted) return;
    try {
      final r = await v1(_api, (c) => c.crmSettingsBotMode(body: v1api.BotModeBody(mode: v)));
      HapticFeedback.mediumImpact();
      _toast(r.message ?? 'Сохранено');
      await _load();
    } on ApiException catch (e) {
      _toast(e.message);
    }
  }

  Future<void> _save() async {
    int? n(TextEditingController c) => int.tryParse(c.text.trim());
    if (_days.isEmpty) return _toast('Выберите хотя бы один рабочий день');
    final sla = n(_sla), reassign = n(_reassign), merge = n(_merge), discount = n(_discount);
    if (sla == null || sla < 1) return _toast('Норматив ответа — от 1 минуты');
    if (reassign == null || reassign < 0) return _toast('Передача дальше — 0 (выключено) или больше');
    if (merge == null || merge < 0) return _toast('Дней для вливания заявки — 0 или больше');
    if (discount == null || discount < 0 || discount > 50) return _toast('Лимит скидки — от 0 до 50%');
    setState(() => _busy = true);
    try {
      final r = await v1(
        _api,
        (c) => c.crmSettingsSalesSave(
          body: v1api.CrmSalesSettingsBody(
            workDays: (_days.toList()..sort()),
            from: _from,
            to: _to,
            off: _off.text,
            slaMinutes: sla,
            reassignMinutes: reassign,
            autoDealFrom: _autoDeal,
            mergeClosedDays: merge,
            maxDiscount: discount,
            unsorted: _flags['unsorted']!,
            digest: _flags['digest']!,
            autoLetters: _flags['autoLetters']!,
            chatReward: _flags['chatReward']!,
            widgetEnabled: _flags['widgetEnabled']!,
            widgetChat: _flags['widgetChat']!,
            widgetHelp: _flags['widgetHelp']!,
          ),
        ),
      );
      HapticFeedback.lightImpact();
      _toast(r.message ?? 'Сохранено');
      await _load();
    } on ApiException catch (e) {
      _toast(e.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _pickTime(bool start) async {
    final cur = start ? _from : _to;
    final t = await showTimePicker(context: context, initialTime: TimeOfDay(hour: int.parse(cur.substring(0, 2)), minute: int.parse(cur.substring(3))));
    if (t == null) return;
    final v = '${two(t.hour)}:${two(t.minute)}';
    setState(() {
      if (start) {
        _from = v;
      } else {
        _to = v;
      }
      _dirty = true;
    });
  }

  @override
  Widget build(BuildContext context) {
    final c = context.c;
    final s = _s;
    return Scaffold(
      backgroundColor: c.surface,
      body: s == null
          ? (_error != null ? EmptyState(icon: LucideIcons.wifiOff, title: 'Не удалось открыть настройки', hint: _error, action: 'Повторить', onAction: _load) : const Center(child: CircularProgressIndicator()))
          : GestureDetector(
              onTap: () => FocusManager.instance.primaryFocus?.unfocus(),
              child: ListView(
                keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
                padding: EdgeInsets.only(top: MediaQuery.of(context).padding.top + 10, bottom: 40),
                children: [
                  Padding(padding: const EdgeInsets.fromLTRB(20, 0, 20, 16), child: Text('Отдел продаж', style: AppText.largeTitle(context))),
                  FormSection(title: 'AI-продажник', hint: 'меняется сразу; тексты и вопросы бота — в «Интеграциях» → «Бот»', children: [
                    GroupCard(padding: const EdgeInsets.only(bottom: 14), children: [
                      ChoiceRow(label: 'Режим', icon: LucideIcons.bot, value: s.botModes.where((m) => m.id == s.botMode).map((m) => m.label).firstOrNull ?? s.botMode, onTap: () => _botMode(s)),
                    ]),
                    Padding(padding: const EdgeInsets.fromLTRB(4, 0, 4, 0), child: Text(s.botModes.where((m) => m.id == s.botMode).map((m) => m.hint).firstOrNull ?? '', style: AppText.caption(context))),
                  ]),
                  FormSection(title: 'Рабочее время', hint: 'норматив ответа и сроки задач идут только в рабочее время', children: [
                    Wrap(spacing: 8, runSpacing: 8, children: [
                      for (final (i, d) in const ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'].indexed)
                        FilterPill(label: d, selected: _days.contains(i + 1), onTap: () {
                          setState(() => _days.contains(i + 1) ? _days.remove(i + 1) : _days.add(i + 1));
                          _touch();
                        }),
                    ]),
                    const SizedBox(height: 12),
                    GroupCard(padding: const EdgeInsets.only(bottom: 14), children: [
                      ChoiceRow(label: 'Начало смены', icon: LucideIcons.sunrise, value: _from, onTap: () => _pickTime(true)),
                      ChoiceRow(label: 'Конец смены', icon: LucideIcons.sunset, value: _to, onTap: () => _pickTime(false)),
                    ]),
                    LabeledField(label: 'Праздничные выходные', controller: _off, lines: 3, note: 'по одной в строке, «16.12.2026»', onChanged: (_) => _touch()),
                  ]),
                  FormSection(title: 'Заявки', children: [
                    LabeledField(label: 'Норматив ответа, рабочих минут', controller: _sla, keyboard: TextInputType.number, onChanged: (_) => _touch()),
                    LabeledField(label: 'Не взял заявку: следующему через, мин', controller: _reassign, keyboard: TextInputType.number, note: '0 — не передавать', onChanged: (_) => _touch()),
                    GroupCard(padding: const EdgeInsets.only(bottom: 14), children: [
                      ChoiceRow(
                        label: 'Сделка с сайта, когда клиент…',
                        icon: LucideIcons.handshake,
                        value: s.autoDealOptions.where((o) => o.id == _autoDeal).map((o) => o.label).firstOrNull ?? _autoDeal,
                        onTap: () async {
                          final v = await pickChoice(context, title: 'Заводить сделку с сайта, когда клиент…', options: [for (final o in s.autoDealOptions) (o.id, o.label)], current: _autoDeal);
                          if (v != null && v.isNotEmpty) {
                            setState(() => _autoDeal = v);
                            _touch();
                          }
                        },
                      ),
                    ]),
                    LabeledField(label: 'Влить заявку в закрытую сделку, дней', controller: _merge, keyboard: TextInputType.number, onChanged: (_) => _touch()),
                    GroupCard(padding: const EdgeInsets.only(bottom: 14), children: [
                      _switch('unsorted', '«Неразобранное»', 'новые заявки ждут, пока их возьмут'),
                      _switch('autoLetters', 'Автописьма клиентам'),
                      _switch('digest', 'Утренняя сводка в начале смены'),
                      _switch('chatReward', 'Награда за друга и за покупку из чата'),
                    ]),
                  ]),
                  FormSection(title: 'Скидки', children: [LabeledField(label: 'Лимит скидки от прайса, %', controller: _discount, keyboard: TextInputType.number, note: 'больше — только руководитель', onChanged: (_) => _touch())]),
                  FormSection(title: 'Виджет на сайте', children: [
                    GroupCard(padding: const EdgeInsets.only(bottom: 14), children: [
                      _switch('widgetEnabled', 'Кнопки «Написать в WhatsApp» и «Перезвоните мне»'),
                      _switch('widgetChat', 'Онлайн-чат в виджете'),
                      _switch('widgetHelp', 'Помощник в кабинете книги'),
                    ]),
                  ]),
                  Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 16),
                    child: PrimaryButton(label: _dirty ? 'Сохранить' : 'Сохранено', icon: LucideIcons.check, busy: _busy, onPressed: _dirty ? _save : null),
                  ),
                ],
              ),
            ),
    );
  }

  Widget _switch(String key, String title, [String? hint]) => SwitchListTile.adaptive(
        title: Text(title, style: AppText.body(context)),
        subtitle: hint == null ? null : Text(hint, style: AppText.caption(context)),
        value: _flags[key]!,
        activeTrackColor: context.c.brand,
        onChanged: (v) {
          setState(() => _flags[key] = v);
          _touch();
        },
      );
}
