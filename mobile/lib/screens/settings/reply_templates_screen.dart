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
import '../money/money_widgets.dart';

/// Общие шаблоны быстрых ответов (API v1 crmTemplates): видят все менеджеры в чате; новый, правка, удаление. Свои шаблоны
/// сотрудника — «Мои шаблоны» в профиле.
class ReplyTemplatesScreen extends StatefulWidget {
  const ReplyTemplatesScreen({super.key});

  @override
  State<ReplyTemplatesScreen> createState() => _ReplyTemplatesScreenState();
}

class _ReplyTemplatesScreenState extends State<ReplyTemplatesScreen> {
  v1api.ReplyTemplates? _t;
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
      final t = await v1(_api, (c) => c.crmTemplates());
      if (mounted) setState(() => _t = t);
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _edit([v1api.ReplyTemplate? tpl]) async {
    final saved = await Navigator.of(context).push<bool>(MaterialPageRoute(builder: (_) => _TemplateForm(template: tpl, vars: _t?.vars ?? const [])));
    if (saved == true) _load();
  }

  @override
  Widget build(BuildContext context) {
    final t = _t;
    final c = context.c;
    return MoneyPage(
      title: 'Общие шаблоны',
      subtitle: 'Общие для всех менеджеров — вставляются в чат одной кнопкой',
      period: null,
      onPeriod: null,
      onRefresh: _load,
      loading: _loading,
      error: _error,
      actions: [RoundIconButton(icon: LucideIcons.plus, size: 44, iconSize: 24, color: c.brand, tooltip: 'Новый шаблон', onTap: () => _edit())],
      children: t == null
          ? const []
          : [
              if (t.templates.isEmpty)
                const MoneyEmpty('Шаблонов нет — добавьте кнопкой «+»')
              else
                GroupCard(padding: EdgeInsets.zero, children: [
                  for (final x in t.templates) GroupTile(title: x.title, subtitle: x.text.replaceAll('\n', ' '), icon: LucideIcons.messageSquareText, onTap: () => _edit(x)),
                ]),
              Padding(padding: const EdgeInsets.fromLTRB(4, 12, 4, 0), child: Text('Переменные: ${t.vars.join(', ')}', style: AppText.caption(context))),
            ],
    );
  }
}

class _TemplateForm extends StatefulWidget {
  const _TemplateForm({this.template, required this.vars});
  final v1api.ReplyTemplate? template;
  final List<String> vars;

  @override
  State<_TemplateForm> createState() => _TemplateFormState();
}

class _TemplateFormState extends State<_TemplateForm> {
  late final _title = TextEditingController(text: widget.template?.title ?? '');
  late final _text = TextEditingController(text: widget.template?.text ?? '');
  bool _busy = false;

  ApiClient get _api => context.read<AuthState>().api;

  @override
  void dispose() {
    _title.dispose();
    _text.dispose();
    super.dispose();
  }

  void _toast(String t) => ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(t)));

  Future<void> _save() async {
    if (_title.text.trim().isEmpty || _text.text.trim().isEmpty) return _toast('Нужны название и текст');
    setState(() => _busy = true);
    try {
      final r = await v1(_api, (c) => c.crmTemplateSave(body: v1api.ReplyTemplateBody(id: widget.template?.id, title: _title.text.trim(), text: _text.text.trim())));
      HapticFeedback.lightImpact();
      if (!mounted) return;
      _toast(r.message ?? 'Сохранено');
      Navigator.of(context).pop(true);
    } on ApiException catch (e) {
      if (mounted) _toast(e.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _delete() async {
    final t = widget.template!;
    if (!await confirm(context, title: 'Удалить шаблон «${t.title}»?', ok: 'Удалить', destructive: true)) return;
    try {
      final r = await v1(_api, (c) => c.crmTemplateDelete(id: t.id));
      if (!mounted) return;
      _toast(r.message ?? 'Удалено');
      Navigator.of(context).pop(true);
    } on ApiException catch (e) {
      _toast(e.message);
    }
  }

  void _insert(String v) {
    final sel = _text.selection;
    final at = sel.isValid ? sel.start : _text.text.length;
    _text.text = _text.text.replaceRange(at, sel.isValid ? sel.end : at, v);
    _text.selection = TextSelection.collapsed(offset: at + v.length);
  }

  @override
  Widget build(BuildContext context) {
    final c = context.c;
    return Scaffold(
      backgroundColor: c.surface,
      appBar: AppBar(
        backgroundColor: c.bg,
        surfaceTintColor: Colors.transparent,
        title: Text(widget.template == null ? 'Новый шаблон' : 'Шаблон', style: AppText.headline(context)),
        actions: [if (widget.template != null) RoundIconButton(icon: LucideIcons.trash2, size: 44, iconSize: 20, color: c.danger, tooltip: 'Удалить', onTap: _delete)],
      ),
      body: ListView(padding: const EdgeInsets.only(top: 16, bottom: 40), children: [
        FormSection(title: 'Шаблон', children: [
          LabeledField(label: 'Название', controller: _title, hint: 'Цены'),
          LabeledField(label: 'Текст', controller: _text, lines: 6),
          Wrap(spacing: 6, runSpacing: 6, children: [
            for (final v in widget.vars.where((v) => !v.contains('Название'))) ActionChip(label: Text(v), onPressed: () => _insert(v)),
          ]),
          const SizedBox(height: 16),
        ]),
        Padding(padding: const EdgeInsets.symmetric(horizontal: 16), child: PrimaryButton(label: 'Сохранить', icon: LucideIcons.check, busy: _busy, onPressed: _save)),
      ]),
    );
  }
}
