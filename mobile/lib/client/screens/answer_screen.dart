import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../ui/tokens.dart';
import '../data/models.dart';
import '../data/stores.dart';

/// Ответ на вопрос: вопрос и подсказка сверху, текст книги засечками, автосохранение (как редактор кабинета).
/// Стрелки внизу — к соседним вопросам книги, ответ при переходе сохраняется сразу.
class AnswerScreen extends StatefulWidget {
  const AnswerScreen({super.key, required this.store, required this.questionId});
  final BookStore store;
  final String questionId;

  @override
  State<AnswerScreen> createState() => _AnswerScreenState();
}

class _AnswerScreenState extends State<AnswerScreen> {
  late String _id = widget.questionId;
  late final TextEditingController _text = TextEditingController(text: _q.answer);
  final _focus = FocusNode();

  List<Question> get _all => widget.store.book!.questions;
  Question get _q => _all.firstWhere((q) => q.id == _id);
  int get _index => _all.indexWhere((q) => q.id == _id);

  @override
  void dispose() {
    widget.store.flush();
    _text.dispose();
    _focus.dispose();
    super.dispose();
  }

  void _go(int delta) {
    final i = _index + delta;
    if (i < 0 || i >= _all.length) return;
    widget.store.flush();
    setState(() {
      _id = _all[i].id;
      _text.text = _q.answer;
    });
  }

  @override
  Widget build(BuildContext context) {
    final c = context.c;
    final editable = widget.store.book!.editable;
    final chapter = widget.store.book!.chapters.where((ch) => ch.key == _q.chapter).map((ch) => ch.title).firstOrNull;
    return Scaffold(
      backgroundColor: c.wallpaper,
      appBar: AppBar(
        backgroundColor: c.wallpaper,
        surfaceTintColor: Colors.transparent,
        title: Text('${_index + 1} из ${_all.length}', style: AppText.sub(context)),
        actions: [Padding(padding: const EdgeInsets.only(right: 16), child: ListenableBuilder(listenable: widget.store, builder: (context, _) => _SaveBadge(state: widget.store.save)))],
      ),
      body: SafeArea(
        top: false,
        child: Column(children: [
          Expanded(
            child: GestureDetector(
              behavior: HitTestBehavior.translucent,
              onTap: () => _focus.requestFocus(),
              child: ListView(
                keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
                padding: const EdgeInsets.fromLTRB(22, 8, 22, 24),
                children: [
                  if (chapter != null && chapter.isNotEmpty) Text(chapter.toUpperCase(), style: AppText.label(context).copyWith(color: c.brand, letterSpacing: 1.2)),
                  const SizedBox(height: 8),
                  Text(_q.prompt.isNotEmpty ? _q.prompt : _q.title, style: AppText.serif(context, size: 27, weight: FontWeight.w600).copyWith(height: 1.15)),
                  if (_q.hint != null && _q.hint!.isNotEmpty) ...[
                    const SizedBox(height: 10),
                    Text(_q.hint!, style: AppText.sub(context).copyWith(height: 1.45)),
                  ],
                  const SizedBox(height: 18),
                  TextField(
                    controller: _text,
                    focusNode: _focus,
                    readOnly: !editable,
                    maxLines: null,
                    minLines: 8,
                    keyboardType: TextInputType.multiline,
                    textCapitalization: TextCapitalization.sentences,
                    onChanged: (v) => widget.store.edit(_q, v),
                    style: AppText.serif(context, size: 20).copyWith(height: 1.5),
                    decoration: InputDecoration(
                      hintText: editable ? 'Пишите, как рассказали бы вслух. Сохраняется само.' : null,
                      hintStyle: AppText.serif(context, size: 19).copyWith(color: c.textFaint, fontStyle: FontStyle.italic),
                      filled: false,
                      border: InputBorder.none,
                      enabledBorder: InputBorder.none,
                      focusedBorder: InputBorder.none,
                      contentPadding: EdgeInsets.zero,
                    ),
                  ),
                ],
              ),
            ),
          ),
          Container(
            decoration: BoxDecoration(color: c.surfaceRaised, border: Border(top: BorderSide(color: c.border))),
            padding: const EdgeInsets.fromLTRB(8, 6, 8, 6),
            child: Row(children: [
              TextButton.icon(onPressed: _index > 0 ? () => _go(-1) : null, icon: const Icon(LucideIcons.chevronLeft, size: 18), label: const Text('Назад')),
              const Spacer(),
              TextButton.icon(
                onPressed: _index < _all.length - 1 ? () => _go(1) : null,
                iconAlignment: IconAlignment.end,
                icon: const Icon(LucideIcons.chevronRight, size: 18),
                label: const Text('Следующий'),
              ),
            ]),
          ),
        ]),
      ),
    );
  }
}

class _SaveBadge extends StatelessWidget {
  const _SaveBadge({required this.state});
  final SaveState state;

  @override
  Widget build(BuildContext context) {
    final c = context.c;
    final (text, color, icon) = switch (state) {
      SaveState.saved => ('Сохранено', c.textMuted, LucideIcons.check),
      SaveState.saving => ('Сохраняем…', c.textMuted, LucideIcons.loader),
      SaveState.offline => ('Без сети — сохраним позже', c.warn, LucideIcons.cloudOff),
      SaveState.failed => ('Не сохранилось', c.danger, LucideIcons.triangleAlert),
    };
    return Row(mainAxisSize: MainAxisSize.min, children: [
      Icon(icon, size: 14, color: color),
      const SizedBox(width: 5),
      Text(text, style: AppText.caption(context).copyWith(color: color)),
    ]);
  }
}
