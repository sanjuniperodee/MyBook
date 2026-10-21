import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:provider/provider.dart';

import '../core/auth.dart';
import '../core/template_text.dart';
import '../core/templates_store.dart';
import '../models/chat.dart';
import '../ui/kit.dart';
import '../ui/tokens.dart';
import '../widgets/message_bubble.dart';

/// Редактор шаблона: готовые заготовки, название (необязательное), текст с подсветкой подстановок, жирный/курсив/смайлы,
/// подстановки по нажатию и предпросмотр «как увидит клиент». Из чата открывается с черновиком сообщения (initial*).
class TemplateEditorScreen extends StatefulWidget {
  const TemplateEditorScreen({super.key, this.template, this.initialTitle, this.initialText, this.replaced = const []});
  final Template? template;
  final String? initialTitle;
  final String? initialText;

  /// Что заменено подстановками в черновике из сообщения: «Айдана» → {имя}.
  final List<(String, String)> replaced;

  @override
  State<TemplateEditorScreen> createState() => _TemplateEditorScreenState();
}

class _TemplateEditorScreenState extends State<TemplateEditorScreen> {
  late final TextEditingController _title;
  late final TemplateTextController _text;
  final _focus = FocusNode();
  bool _saving = false;
  late final String _baseTitle;
  late final String _baseText;

  @override
  void initState() {
    super.initState();
    _baseTitle = widget.template?.title ?? widget.initialTitle ?? '';
    _baseText = widget.template?.text ?? widget.initialText ?? '';
    _title = TextEditingController(text: _baseTitle)..addListener(_changed);
    // Цвета подсветки задаются после первого кадра (нужен контекст темы) — до этого поле обычное.
    _text = TemplateTextController(text: _baseText, known: const Color(0xFF00A884), unknown: const Color(0xFFF5A524))..addListener(_changed);
  }

  void _changed() => setState(() {});

  @override
  void dispose() {
    _title.dispose();
    _text.dispose();
    _focus.dispose();
    super.dispose();
  }

  bool get _dirty => _title.text != _baseTitle || _text.text != _baseText;
  String get _autoTitle => titleFromText(_text.text);
  String get _finalTitle => _title.text.trim().isEmpty ? _autoTitle : _title.text.trim();
  bool get _valid => _text.text.trim().isNotEmpty && _finalTitle.isNotEmpty;

  void _insert(String v) {
    final sel = _text.selection;
    final start = sel.isValid ? sel.start : _text.text.length;
    final end = sel.isValid ? sel.end : _text.text.length;
    _text.value = TextEditingValue(
      text: _text.text.replaceRange(start, end, v),
      selection: TextSelection.collapsed(offset: start + v.length),
    );
    _focus.requestFocus();
  }

  void _wrap(String mark) {
    final sel = _text.selection;
    final start = sel.isValid ? sel.start : _text.text.length;
    final end = sel.isValid ? sel.end : _text.text.length;
    final body = start == end ? 'текст' : _text.text.substring(start, end);
    final wrapped = '$mark$body$mark';
    _text.value = TextEditingValue(
      text: _text.text.replaceRange(start, end, wrapped),
      selection: TextSelection(baseOffset: start, extentOffset: start + wrapped.length),
    );
    _focus.requestFocus();
  }

  Future<void> _save() async {
    if (!_valid || _saving) return;
    setState(() => _saving = true);
    final err = await context.read<TemplatesStore>().save(id: widget.template?.id, title: _finalTitle, text: _text.text);
    if (!mounted) return;
    setState(() => _saving = false);
    if (err != null) {
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(err)));
      return;
    }
    Navigator.of(context).pop(true);
  }

  Future<bool> _confirmClose() async {
    if (!_dirty) return true;
    return confirm(context, title: 'Закрыть без сохранения?', message: 'Изменения пропадут.', ok: 'Закрыть', destructive: true);
  }

  @override
  Widget build(BuildContext context) {
    final c = context.c;
    final isNew = widget.template == null;
    final manager = context.read<AuthState>().staff?.name ?? 'Менеджер';
    final unknown = unknownVars(_text.text);
    final empty = _text.text.trim().isEmpty;
    return PopScope(
      canPop: !_dirty,
      onPopInvokedWithResult: (didPop, _) async {
        if (didPop) return;
        if (await _confirmClose() && context.mounted) Navigator.of(context).pop();
      },
      child: Scaffold(
        backgroundColor: c.surface,
        appBar: AppBar(
          backgroundColor: c.bg,
          surfaceTintColor: Colors.transparent,
          scrolledUnderElevation: 0,
          leading: RoundIconButton(
            icon: LucideIcons.x,
            color: c.text,
            onTap: () async {
              if (await _confirmClose() && context.mounted) Navigator.of(context).pop();
            },
          ),
          title: Text(isNew ? 'Новый шаблон' : 'Изменить шаблон', style: AppText.headline(context)),
          actions: [
            Padding(
              padding: const EdgeInsets.only(right: 12),
              child: TextButton(
                onPressed: _valid && !_saving ? _save : null,
                child: _saving
                    ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2))
                    : Text(isNew ? 'Создать' : 'Сохранить', style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 16)),
              ),
            ),
          ],
        ),
        body: ListView(
          keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 40),
          children: [
            if (widget.replaced.isNotEmpty || (widget.initialText != null && isNew)) _Notice(replaced: widget.replaced),
            if (isNew && empty) ...[
              Row(
                children: [
                  Icon(LucideIcons.sparkles, size: 16, color: c.brandDeep),
                  const SizedBox(width: 6),
                  Text(
                    'Начать с готового',
                    style: TextStyle(fontWeight: FontWeight.w600, color: c.textMuted),
                  ),
                ],
              ),
              const SizedBox(height: 8),
              Wrap(
                spacing: 8,
                runSpacing: 8,
                children: [
                  for (final s in templateStarters)
                    ActionChip(
                      label: Text(s.title),
                      backgroundColor: c.surfaceRaised,
                      side: BorderSide(color: c.border),
                      onPressed: () {
                        _title.text = s.title;
                        _text.text = s.text;
                        _focus.requestFocus();
                      },
                    ),
                ],
              ),
              Padding(
                padding: const EdgeInsets.only(top: 6, bottom: 14),
                child: Text('или просто напишите свой текст ниже', style: AppText.caption(context)),
              ),
            ],
            _label(context, 'Название', '${_title.text.length}/60'),
            TextField(
              controller: _title,
              maxLength: 60,
              buildCounter: (_, {required currentLength, required isFocused, maxLength}) => null,
              style: TextStyle(fontSize: 17, color: c.text),
              decoration: InputDecoration(hintText: _autoTitle.isNotEmpty ? _autoTitle : 'Например, «Как оплатить»', filled: true, fillColor: c.surfaceRaised),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(2, 6, 2, 16),
              child: Text(
                'Шаблон ищется по названию: в чате наберите «/» и начало названия.${_title.text.trim().isEmpty && _autoTitle.isNotEmpty ? ' Оставите пустым — возьмём первые слова текста.' : ''}',
                style: AppText.caption(context),
              ),
            ),
            _label(context, 'Текст сообщения', '${_text.text.length}/2000'),
            Container(
              decoration: BoxDecoration(
                color: c.surfaceRaised,
                borderRadius: BorderRadius.circular(Rd.md),
                border: Border.all(color: c.border, width: 0.6),
              ),
              child: Column(
                children: [
                  SizedBox(
                    height: 44,
                    child: ListView(
                      scrollDirection: Axis.horizontal,
                      padding: const EdgeInsets.symmetric(horizontal: 6),
                      children: [
                        _Tool(icon: LucideIcons.bold, tip: 'Жирный', onTap: () => _wrap('*')),
                        _Tool(icon: LucideIcons.italic, tip: 'Курсив', onTap: () => _wrap('_')),
                        _Tool(icon: LucideIcons.strikethrough, tip: 'Зачёркнутый', onTap: () => _wrap('~')),
                        Container(width: 1, height: 22, margin: const EdgeInsets.symmetric(horizontal: 6, vertical: 11), color: c.border),
                        for (final e in templateEmoji)
                          GestureDetector(
                            behavior: HitTestBehavior.opaque,
                            onTap: () => _insert(e),
                            child: Padding(
                              padding: const EdgeInsets.symmetric(horizontal: 8),
                              child: Center(child: Text(e, style: const TextStyle(fontSize: 21))),
                            ),
                          ),
                      ],
                    ),
                  ),
                  Divider(height: 1, color: c.border),
                  TextField(
                    controller: _text,
                    focusNode: _focus,
                    maxLength: 2000,
                    buildCounter: (_, {required currentLength, required isFocused, maxLength}) => null,
                    minLines: 6,
                    maxLines: 14,
                    textCapitalization: TextCapitalization.sentences,
                    style: TextStyle(fontSize: 17, height: 1.35, color: c.text),
                    decoration: InputDecoration(
                      hintText: 'Здравствуйте, {имя}! …',
                      filled: false,
                      border: InputBorder.none,
                      enabledBorder: InputBorder.none,
                      focusedBorder: InputBorder.none,
                      contentPadding: const EdgeInsets.all(14),
                    ),
                    inputFormatters: [LengthLimitingTextInputFormatter(2000)],
                  ),
                ],
              ),
            ),
            if (unknown.isNotEmpty)
              Padding(
                padding: const EdgeInsets.fromLTRB(2, 8, 2, 0),
                child: Text('Незнакомая подстановка ${unknown.join(', ')} — она останется в тексте как есть, если это не своё поле сделки.', style: AppText.caption(context).copyWith(color: c.warn)),
              ),
            const SizedBox(height: 18),
            _label(context, 'Подстановки — нажмите, чтобы вставить', null),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                for (final v in templateVars)
                  ActionChip(
                    label: Text(v.label, style: const TextStyle(fontSize: 13.5)),
                    backgroundColor: c.surfaceRaised,
                    side: BorderSide(color: c.border),
                    visualDensity: VisualDensity.compact,
                    onPressed: () => _insert(v.key),
                  ),
              ],
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(2, 8, 2, 20),
              child: Text('В чате CRM сама заменит их данными диалога.', style: AppText.caption(context)),
            ),
            _label(context, 'Как увидит клиент', null),
            Container(
              padding: const EdgeInsets.all(14),
              decoration: BoxDecoration(
                color: c.wallpaper,
                borderRadius: BorderRadius.circular(Rd.lg),
                border: Border.all(color: c.border, width: 0.6),
              ),
              child: empty
                  ? Padding(
                      padding: const EdgeInsets.symmetric(vertical: 18),
                      child: Center(child: Text('Начните писать — здесь появится сообщение', style: AppText.caption(context))),
                    )
                  : Align(
                      alignment: Alignment.centerRight,
                      child: Container(
                        constraints: BoxConstraints(maxWidth: MediaQuery.of(context).size.width * 0.78),
                        margin: const EdgeInsets.only(right: BubbleBorder.tailWidth),
                        padding: const EdgeInsets.fromLTRB(10, 7, 10, 6),
                        decoration: ShapeDecoration(color: c.bubbleOut, shape: const BubbleBorder(outgoing: true, tail: true)),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.end,
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Align(
                              alignment: Alignment.centerLeft,
                              child: Text.rich(
                                TextSpan(
                                  style: TextStyle(fontSize: 16, height: 1.3, color: c.text),
                                  children: whatsappSpans(previewTemplate(_text.text, manager)),
                                ),
                              ),
                            ),
                            const SizedBox(height: 2),
                            Text('12:30  ✓', style: TextStyle(fontSize: 11.5, color: c.textMuted)),
                          ],
                        ),
                      ),
                    ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(2, 8, 2, 0),
              child: Text('Имя, заказ и ссылка в примере условные. *Жирный* и _курсив_ WhatsApp показывает у клиента именно так.', style: AppText.caption(context)),
            ),
          ],
        ),
      ),
    );
  }

  Widget _label(BuildContext context, String text, String? counter) => Padding(
    padding: const EdgeInsets.fromLTRB(2, 0, 2, 8),
    child: Row(
      children: [
        Expanded(
          child: Text(
            text,
            style: TextStyle(fontSize: 14.5, fontWeight: FontWeight.w600, color: context.c.textMuted),
          ),
        ),
        if (counter != null) Text(counter, style: AppText.caption(context)),
      ],
    ),
  );
}

class _Tool extends StatelessWidget {
  const _Tool({required this.icon, required this.tip, required this.onTap});
  final IconData icon;
  final String tip;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => Tooltip(
    message: tip,
    child: IconButton(
      onPressed: onTap,
      icon: Icon(icon, size: 20, color: context.c.textMuted),
      visualDensity: VisualDensity.compact,
    ),
  );
}

/// Плашка над формой для шаблона из сообщения: что заменено.
class _Notice extends StatelessWidget {
  const _Notice({required this.replaced});
  final List<(String, String)> replaced;

  @override
  Widget build(BuildContext context) {
    final c = context.c;
    return Container(
      margin: const EdgeInsets.only(bottom: 16),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(color: c.violetBg, borderRadius: BorderRadius.circular(Rd.md)),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(LucideIcons.sparkles, size: 17, color: c.violet),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  replaced.isNotEmpty ? 'Данные клиента заменены подстановками' : 'Подстановки не понадобились',
                  style: TextStyle(fontWeight: FontWeight.w700, color: c.violet),
                ),
              ),
            ],
          ),
          const SizedBox(height: 6),
          Text(
            replaced.isNotEmpty
                ? replaced.map((r) => '«${r.$1}» → ${r.$2}').join(' · ')
                : 'В этом сообщении нет данных конкретного клиента — шаблон получился обычным текстом. Подстановки можно добавить кнопками ниже.',
            style: TextStyle(fontSize: 13.5, color: c.text),
          ),
          const SizedBox(height: 4),
          Text('Проверьте текст и название — потом нажмите «Создать». В чате он будет по «/».', style: AppText.caption(context)),
        ],
      ),
    );
  }
}
