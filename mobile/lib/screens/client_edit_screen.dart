import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:provider/provider.dart';

import '../api/mybook_api.g.dart' as api;
import '../core/api.dart';
import '../core/auth.dart';
import '../core/v1.dart';
import '../ui/kit.dart';
import '../ui/tokens.dart';
import '../widgets/crm_form.dart';

/// Правка клиента — как карточка клиента на сайте: номера, теги, свои поля (кнопкой «Сохранить»); «Не писать первым»,
/// язык, канал и ответственный — сразу, как переключатели сайта. API v1: crmClientForm / crmClientUpdate.
class ClientEditScreen extends StatefulWidget {
  const ClientEditScreen({super.key, required this.clientId});
  final String clientId;

  @override
  State<ClientEditScreen> createState() => _ClientEditScreenState();
}

class _ClientEditScreenState extends State<ClientEditScreen> {
  api.ClientForm? _f;
  String? _error;
  bool _saving = false;
  bool _changed = false;
  int _version = 0;

  List<String> _phones = [];
  List<String> _tags = [];
  final Map<String, String> _fields = {};

  ApiClient get _api => context.read<AuthState>().api;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _error = null);
    try {
      final f = await v1(_api, (c) => c.crmClientForm(clientId: widget.clientId));
      if (!mounted) return;
      setState(() {
        _f = f;
        _phones = [...f.extraPhones];
        _tags = [...f.tags];
        _fields
          ..clear()
          ..addEntries(f.fields.map((x) => MapEntry(x.key, x.value)));
        _changed = false;
        _version++;
      });
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    }
  }

  void _touch() {
    if (!_changed) setState(() => _changed = true);
  }

  Future<void> _save() async {
    final f = _f!;
    final fields = {for (final x in f.fields) if ((_fields[x.key] ?? '') != x.value) x.key: _fields[x.key] ?? ''};
    final patch = api.ClientPatch(
      extraPhones: f.canEditPhones && _phones.join(',') != f.extraPhones.join(',') ? _phones : null,
      tags: _tags.join(',') != f.tags.join(',') ? _tags : null,
      fields: fields.isEmpty ? null : fields,
    );
    FocusManager.instance.primaryFocus?.unfocus();
    setState(() => _saving = true);
    try {
      final r = await v1(_api, (c) => c.crmClientUpdate(clientId: f.id, body: patch));
      _toast(r.message ?? 'Сохранено');
      if (mounted) Navigator.of(context).pop(true);
    } on ApiException catch (e) {
      _toast(e.message);
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  /// Переключатель или выбор — сохраняется сразу; несохранённые номера, теги и поля остаются в форме.
  Future<void> _quick(api.ClientPatch patch) async {
    try {
      final r = await v1(_api, (c) => c.crmClientUpdate(clientId: widget.clientId, body: patch));
      _toast(r.message ?? 'Сохранено');
      final f = await v1(_api, (c) => c.crmClientForm(clientId: widget.clientId));
      if (mounted) setState(() => _f = f);
    } on ApiException catch (e) {
      _toast(e.message);
    }
  }

  void _toast(String text) {
    if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(text)));
  }

  @override
  Widget build(BuildContext context) {
    final c = context.c;
    final f = _f;
    return PopScope(
      canPop: !_changed,
      onPopInvokedWithResult: (didPop, _) async {
        if (didPop) return;
        if (await confirm(context, title: 'Выйти без сохранения?', message: 'Номера, теги и поля не сохранятся.', ok: 'Выйти', destructive: true) && context.mounted) Navigator.of(context).pop();
      },
      child: Scaffold(
        backgroundColor: c.surface,
        appBar: AppBar(
          backgroundColor: c.bg,
          surfaceTintColor: Colors.transparent,
          title: Text(f?.name ?? 'Клиент', style: AppText.headline(context)),
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
            ? (_error != null ? EmptyState(icon: LucideIcons.circleAlert, title: 'Не удалось открыть клиента', hint: _error, action: 'Повторить', onAction: _load) : const Center(child: CircularProgressIndicator()))
            : GestureDetector(
                onTap: () => FocusManager.instance.primaryFocus?.unfocus(),
                child: ListView(
                  key: ValueKey(_version),
                  keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
                  padding: const EdgeInsets.only(top: 16, bottom: 40),
                  children: [
                    FormSection(title: 'Связь', children: [
                      GroupCard(padding: EdgeInsets.zero, children: [
                        SwitchListTile.adaptive(
                          title: Text('Не писать первым', style: AppText.body(context)),
                          subtitle: Text('Бот не напоминает, правила не пишут. Ответы — как обычно.', style: AppText.caption(context)),
                          value: f.noMarketing,
                          activeTrackColor: c.brand,
                          onChanged: f.canEdit ? (v) => _quick(api.ClientPatch(noMarketing: v)) : null,
                        ),
                        ChoiceRow(
                          label: 'Язык',
                          icon: LucideIcons.languages,
                          value: f.locales.where((l) => l.id == f.locale).map((l) => l.label).firstOrNull ?? f.locale,
                          onTap: !f.canEdit
                              ? null
                              : () async {
                                  final v = await pickChoice(context, title: 'Язык кабинета и писем', options: [for (final l in f.locales) (l.id, l.label)], current: f.locale);
                                  if (v != null && v.isNotEmpty && v != f.locale) await _quick(api.ClientPatch(locale: v));
                                },
                        ),
                        ChoiceRow(
                          label: 'Откуда пришёл',
                          icon: LucideIcons.signpost,
                          value: f.channels.where((x) => x.id == f.channel).map((x) => x.label).firstOrNull ?? 'Не указано',
                          onTap: !f.canEdit
                              ? null
                              : () async {
                                  final v = await pickChoice(context, title: 'Канал привлечения', options: [for (final x in f.channels) (x.id, x.label)], current: f.channel);
                                  if (v != null && v.isNotEmpty && v != f.channel) await _quick(api.ClientPatch(channel: v));
                                },
                        ),
                        ChoiceRow(
                          label: 'Ответственный',
                          icon: LucideIcons.userRound,
                          value: f.managers.where((m) => m.id == f.managerId).map((m) => m.label).firstOrNull ?? 'Не назначен',
                          onTap: !f.canEdit
                              ? null
                              : () async {
                                  final v = await pickChoice(context, title: 'Ответственный', options: [for (final m in f.managers) (m.id, m.label)], current: f.managerId);
                                  if (v != null && v.isNotEmpty && v != f.managerId) await _quick(api.ClientPatch(managerId: v));
                                },
                        ),
                      ]),
                    ]),
                    if (f.phone != null)
                      FormSection(title: 'Дополнительные номера', hint: 'По ним клиента узнают в звонках и WhatsApp${f.phone!.isEmpty ? '' : '. Основной: ${f.phone}'}', children: [
                        PhonesEditor(
                          phones: _phones,
                          enabled: f.canEditPhones,
                          onChanged: (v) {
                            _phones = v;
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
                  ],
                ),
              ),
      ),
    );
  }
}
