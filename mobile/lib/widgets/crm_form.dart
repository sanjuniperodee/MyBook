import 'package:flutter/cupertino.dart';
import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../api/mybook_api.g.dart' as v1;
import '../ui/kit.dart';
import '../ui/tokens.dart';

/// Формы CRM в приложении (правка сделки, клиента): поле с подписью, свои поля по типу, теги, номера, выбор из списка.

/// Поле формы на сером фоне листа: белое с тонкой рамкой, как .input сайта.
InputDecoration formInput(BuildContext context, {String? hint}) {
  final c = context.c;
  OutlineInputBorder border(Color color, [double w = 1]) => OutlineInputBorder(borderRadius: BorderRadius.circular(Rd.md), borderSide: BorderSide(color: color, width: w));
  return InputDecoration(
    hintText: hint,
    filled: true,
    fillColor: c.surfaceRaised,
    border: border(c.border),
    enabledBorder: border(c.border),
    disabledBorder: border(c.border.withValues(alpha: 0.5)),
    focusedBorder: border(c.brand, 1.5),
  );
}

/// Подпись над полем — как .label сайта.
class FormLabel extends StatelessWidget {
  const FormLabel(this.text, {super.key, this.hint});
  final String text;
  final String? hint;

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.fromLTRB(4, 0, 4, 6),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(text, style: AppText.caption(context).copyWith(fontWeight: FontWeight.w600, color: context.c.text, fontSize: 13.5)),
          if (hint != null) Padding(padding: const EdgeInsets.only(top: 2), child: Text(hint!, style: AppText.caption(context))),
        ]),
      );
}

/// Текстовое поле формы с подписью.
class LabeledField extends StatelessWidget {
  const LabeledField({super.key, required this.label, required this.controller, this.hint, this.keyboard, this.enabled = true, this.onChanged, this.lines = 1, this.note, this.autocorrect = true, this.capitalization});
  final String label;
  /// Имена и почта — без автозамены: iOS меняет «Asel» на «Adele».
  final bool autocorrect;
  final TextCapitalization? capitalization;
  final TextEditingController controller;
  final String? hint;
  final String? note;
  final TextInputType? keyboard;
  final bool enabled;
  final int lines;
  final ValueChanged<String>? onChanged;

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.only(bottom: 14),
        child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          FormLabel(label, hint: note),
          TextField(
            controller: controller,
            enabled: enabled,
            keyboardType: keyboard,
            minLines: lines,
            maxLines: lines == 1 ? 1 : lines + 4,
            onChanged: onChanged,
            autocorrect: autocorrect,
            enableSuggestions: autocorrect,
            textCapitalization: capitalization ?? (keyboard == null ? TextCapitalization.sentences : TextCapitalization.none),
            decoration: formInput(context, hint: hint),
          ),
        ]),
      );
}

/// Выбор одного значения из списка (лист снизу с галочкой у текущего) — источник, тариф, язык, канал, ответственный.
Future<String?> pickChoice(BuildContext context, {required String title, required List<(String id, String label)> options, String? current, String? emptyLabel}) {
  return showAppSheet<String>(context, title: title, builder: (sheet) {
    final c = sheet.c;
    final all = [if (emptyLabel != null) ('', emptyLabel), ...options];
    return ListView(shrinkWrap: true, padding: const EdgeInsets.fromLTRB(16, 4, 16, 24), children: [
      GroupCard(padding: EdgeInsets.zero, children: [
        for (final o in all)
          GroupTile(
            title: o.$2,
            trailing: (current ?? '') == o.$1 ? Icon(LucideIcons.check, size: 20, color: c.brand) : const SizedBox(width: 20),
            onTap: () => Navigator.pop(sheet, o.$1),
          ),
      ]),
    ]);
  });
}

/// Строка «подпись — значение» с выбором по нажатию.
class ChoiceRow extends StatelessWidget {
  const ChoiceRow({super.key, required this.label, required this.value, required this.onTap, this.icon});
  final String label;
  final String value;
  final VoidCallback? onTap;
  final IconData? icon;

  @override
  Widget build(BuildContext context) => GroupTile(
        title: label,
        icon: icon,
        onTap: onTap,
        trailing: Row(mainAxisSize: MainAxisSize.min, children: [
          ConstrainedBox(constraints: const BoxConstraints(maxWidth: 190), child: Text(value, maxLines: 1, overflow: TextOverflow.ellipsis, style: AppText.sub(context))),
          if (onTap != null) ...[const SizedBox(width: 4), Icon(LucideIcons.chevronRight, size: 18, color: context.c.textFaint)],
        ]),
      );
}

/// Свои поля (раздел «Свои поля» CRM): значение строкой, как в форме сайта.
class CustomFieldsEditor extends StatelessWidget {
  const CustomFieldsEditor({super.key, required this.fields, required this.values, required this.onChanged, this.enabled = true});
  final List<v1.CustomField> fields;
  final Map<String, String> values;
  final void Function(String key, String value) onChanged;
  final bool enabled;

  @override
  Widget build(BuildContext context) {
    final c = context.c;
    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      for (final f in fields)
        switch (f.type) {
          'checkbox' => Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: Container(
                decoration: BoxDecoration(color: c.surfaceRaised, borderRadius: BorderRadius.circular(Rd.md), border: Border.all(color: c.border, width: 0.6)),
                child: SwitchListTile.adaptive(
                  title: Text(f.label, style: AppText.body(context)),
                  value: values[f.key] == 'true',
                  activeTrackColor: c.brand,
                  onChanged: enabled ? (v) => onChanged(f.key, v ? 'true' : 'false') : null,
                ),
              ),
            ),
          'select' || 'date' => Padding(
              padding: const EdgeInsets.only(bottom: 14),
              child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                FormLabel(f.label),
                _PickerBox(
                  text: _shown(f, values[f.key] ?? ''),
                  placeholder: f.type == 'date' ? 'Выбрать дату' : 'Не выбрано',
                  icon: f.type == 'date' ? LucideIcons.calendar : LucideIcons.chevronDown,
                  onTap: !enabled
                      ? null
                      : () async {
                          final v = f.type == 'date' ? await _pickDate(context, values[f.key] ?? '') : await pickChoice(context, title: f.label, options: [for (final o in f.options) (o, o)], current: values[f.key], emptyLabel: 'Не выбрано');
                          if (v != null) onChanged(f.key, v);
                        },
                  onClear: enabled && (values[f.key] ?? '').isNotEmpty ? () => onChanged(f.key, '') : null,
                ),
              ]),
            ),
          _ => _TextCustomField(field: f, value: values[f.key] ?? '', enabled: enabled, onChanged: (v) => onChanged(f.key, v)),
        },
    ]);
  }

  static String _shown(v1.CustomField f, String v) {
    if (v.isEmpty) return '';
    if (f.type == 'date') {
      final d = DateTime.tryParse(v);
      return d == null ? v : DateFormat('d MMMM y', 'ru').format(d);
    }
    return v;
  }

  static Future<String?> _pickDate(BuildContext context, String current) async {
    var picked = DateTime.tryParse(current) ?? DateTime.now();
    final ok = await showCupertinoModalPopup<bool>(
      context: context,
      builder: (ctx) => Container(
        height: 320,
        color: ctx.c.surfaceRaised,
        child: SafeArea(
          top: false,
          child: Column(children: [
            Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
              CupertinoButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Отмена')),
              CupertinoButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Готово', style: TextStyle(fontWeight: FontWeight.w600))),
            ]),
            Expanded(child: CupertinoDatePicker(mode: CupertinoDatePickerMode.date, initialDateTime: picked, onDateTimeChanged: (d) => picked = d)),
          ]),
        ),
      ),
    );
    if (ok != true) return null;
    return '${picked.year.toString().padLeft(4, '0')}-${picked.month.toString().padLeft(2, '0')}-${picked.day.toString().padLeft(2, '0')}';
  }
}

class _TextCustomField extends StatefulWidget {
  const _TextCustomField({required this.field, required this.value, required this.enabled, required this.onChanged});
  final v1.CustomField field;
  final String value;
  final bool enabled;
  final ValueChanged<String> onChanged;

  @override
  State<_TextCustomField> createState() => _TextCustomFieldState();
}

class _TextCustomFieldState extends State<_TextCustomField> {
  late final _c = TextEditingController(text: widget.value);

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => LabeledField(
        label: widget.field.label,
        controller: _c,
        enabled: widget.enabled,
        keyboard: widget.field.type == 'number' ? const TextInputType.numberWithOptions(decimal: true) : null,
        onChanged: widget.onChanged,
      );
}

class _PickerBox extends StatelessWidget {
  const _PickerBox({required this.text, required this.placeholder, required this.icon, this.onTap, this.onClear});
  final String text;
  final String placeholder;
  final IconData icon;
  final VoidCallback? onTap;
  final VoidCallback? onClear;

  @override
  Widget build(BuildContext context) {
    final c = context.c;
    return Material(
      color: c.surfaceRaised,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(Rd.md), side: BorderSide(color: c.border)),
      child: InkWell(
        borderRadius: BorderRadius.circular(Rd.md),
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
          child: Row(children: [
            Expanded(child: Text(text.isEmpty ? placeholder : text, style: AppText.body(context).copyWith(color: text.isEmpty ? c.textFaint : c.text))),
            if (onClear != null) GestureDetector(onTap: onClear, child: Padding(padding: const EdgeInsets.only(right: 8), child: Icon(LucideIcons.x, size: 18, color: c.textFaint))),
            Icon(icon, size: 18, color: c.textMuted),
          ]),
        ),
      ),
    );
  }
}

/// Теги: «пилюли» с крестиком и «Добавить» — как TagEditor сайта (строчными, до 30 знаков, до 20 штук).
class TagsEditor extends StatelessWidget {
  const TagsEditor({super.key, required this.tags, required this.onChanged, this.enabled = true});
  final List<String> tags;
  final ValueChanged<List<String>> onChanged;
  final bool enabled;

  @override
  Widget build(BuildContext context) {
    final c = context.c;
    return Wrap(spacing: 8, runSpacing: 8, children: [
      for (final t in tags)
        Container(
          padding: EdgeInsets.fromLTRB(12, 7, enabled ? 6 : 12, 7),
          decoration: BoxDecoration(color: c.bubbleOut, borderRadius: BorderRadius.circular(20)),
          child: Row(mainAxisSize: MainAxisSize.min, children: [
            Text(t, style: TextStyle(color: c.brandDeep, fontWeight: FontWeight.w500, fontSize: 14)),
            if (enabled) GestureDetector(onTap: () => onChanged([...tags]..remove(t)), child: Padding(padding: const EdgeInsets.only(left: 4), child: Icon(LucideIcons.x, size: 15, color: c.brandDeep))),
          ]),
        ),
      if (enabled && tags.length < 20)
        ActionChip(
          avatar: Icon(LucideIcons.plus, size: 16, color: c.text),
          label: const Text('Тег'),
          backgroundColor: c.surfaceRaised,
          side: BorderSide(color: c.border),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
          onPressed: () async {
            final t = (await promptText(context, title: 'Новый тег', hint: 'например: свадьба', ok: 'Добавить'))?.toLowerCase();
            if (t == null) return;
            final clean = t.length > 30 ? t.substring(0, 30) : t;
            if (!tags.contains(clean)) onChanged([...tags, clean]);
          },
        ),
    ]);
  }
}

/// Дополнительные номера (до 5): по ним клиента узнают в звонках и WhatsApp.
class PhonesEditor extends StatefulWidget {
  const PhonesEditor({super.key, required this.phones, required this.onChanged, this.enabled = true});
  final List<String> phones;
  final ValueChanged<List<String>> onChanged;
  final bool enabled;

  @override
  State<PhonesEditor> createState() => _PhonesEditorState();
}

class _PhonesEditorState extends State<PhonesEditor> {
  late final List<TextEditingController> _c = [for (final p in widget.phones) TextEditingController(text: p)];

  @override
  void dispose() {
    for (final c in _c) {
      c.dispose();
    }
    super.dispose();
  }

  void _emit() => widget.onChanged([for (final c in _c) c.text.trim()].where((p) => p.isNotEmpty).toList());

  @override
  Widget build(BuildContext context) {
    final c = context.c;
    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      for (var i = 0; i < _c.length; i++)
        Padding(
          padding: const EdgeInsets.only(bottom: 8),
          child: Row(children: [
            Expanded(child: TextField(controller: _c[i], enabled: widget.enabled, keyboardType: TextInputType.phone, onChanged: (_) => _emit(), decoration: formInput(context, hint: '+7 700 000 00 00'))),
            if (widget.enabled)
              RoundIconButton(
                icon: LucideIcons.trash2,
                iconSize: 19,
                color: c.textMuted,
                tooltip: 'Убрать номер',
                onTap: () => setState(() {
                  _c.removeAt(i).dispose();
                  _emit();
                }),
              ),
          ]),
        ),
      if (widget.enabled && _c.length < 5)
        Align(
          alignment: Alignment.centerLeft,
          child: TextButton.icon(
            onPressed: () => setState(() => _c.add(TextEditingController())),
            icon: Icon(LucideIcons.plus, size: 18, color: c.brandDeep),
            label: Text('Добавить номер', style: TextStyle(color: c.brandDeep, fontWeight: FontWeight.w600)),
          ),
        ),
    ]);
  }
}

/// Заголовок раздела формы (как Panel сайта, на сером фоне).
class FormSection extends StatelessWidget {
  const FormSection({super.key, required this.title, required this.children, this.hint});
  final String title;
  final String? hint;
  final List<Widget> children;

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.fromLTRB(16, 0, 16, 22),
        child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(4, 0, 4, 10),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(title, style: AppText.headline(context)),
              if (hint != null) Padding(padding: const EdgeInsets.only(top: 2), child: Text(hint!, style: AppText.caption(context))),
            ]),
          ),
          ...children,
        ]),
      );
}
