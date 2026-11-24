import 'dart:async';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:path_provider/path_provider.dart';
import 'package:provider/provider.dart';
import 'package:record/record.dart';

import '../../api/mybook_api.g.dart' as v1api;
import '../../core/api.dart';
import '../../ui/tokens.dart';
import '../data/models.dart';
import '../data/session.dart';
import '../data/stores.dart';
import '../ui/book_chrome.dart';
import '../ui/cabinet.dart';
import '../ui/motion.dart';

/// Редактор вопросов — как на сайте (QuestionsEditor на телефоне): шапка книги и лента шагов, строка «Глава N / название»
/// с отметкой сохранения, «Вопрос 1 из 6» с отметками ответов, вопрос засечками, подсказка, «С чего начать?», ответ
/// засечками с автосохранением; внизу — «назад» и «Следующий». Смена вопроса — листание страницы (PageTurn).
class AnswerScreen extends StatefulWidget {
  const AnswerScreen({
    super.key,
    required this.store,
    required this.questionId,
    this.hub,
  });
  final BookStore store;
  final String questionId;
  final v1api.CabinetBook? hub;

  @override
  State<AnswerScreen> createState() => _AnswerScreenState();
}

class _AnswerScreenState extends State<AnswerScreen> {
  late String _id = widget.questionId;
  late final TextEditingController _text = TextEditingController(
    text: _q.answer,
  );
  final _focus = FocusNode();
  bool _forward = true;
  bool _tips = false;

  // Диктовка: запись голоса (m4a) → распознавание на сервере (answerDictate, язык книги) → текст в ответ у курсора.
  final _recorder = AudioRecorder();
  bool _recording = false;
  bool _recognizing = false;
  int _seconds = 0;
  Timer? _clock;

  BookModel get _book => widget.store.book!;
  List<Question> get _all => _book.questions;
  Question get _q => _all.firstWhere((q) => q.id == _id);
  int get _index => _all.indexWhere((q) => q.id == _id);

  @override
  void dispose() {
    _clock?.cancel();
    _recorder.dispose();
    widget.store.flush();
    _text.dispose();
    _focus.dispose();
    super.dispose();
  }

  Future<void> _dictate() async {
    if (_recognizing) return;
    if (_recording) return _stopDictation();
    if (!await _recorder.hasPermission()) return;
    final dir = await getTemporaryDirectory();
    final path = '${dir.path}/dictation-${DateTime.now().millisecondsSinceEpoch}.m4a';
    await _recorder.start(const RecordConfig(encoder: AudioEncoder.aacLc, bitRate: 64000, sampleRate: 44100, numChannels: 1), path: path);
    setState(() {
      _recording = true;
      _seconds = 0;
    });
    _clock = Timer.periodic(const Duration(seconds: 1), (_) => setState(() => _seconds++));
  }

  Future<void> _stopDictation() async {
    _clock?.cancel();
    final path = await _recorder.stop();
    setState(() {
      _recording = false;
      _recognizing = path != null;
    });
    if (path == null) return;
    final question = _q;
    try {
      final text = (await context.read<ClientSession>().backend.dictate(_book.id, File(path))).trim();
      if (!mounted || text.isEmpty || question.id != _id) return;
      // Текст — туда, где курсор; без курсора — в конец, отдельным предложением.
      final v = _text.value;
      final sel = v.selection;
      final String next;
      final int caret;
      if (sel.isValid && sel.start >= 0) {
        final before = v.text.substring(0, sel.start);
        final glue = before.isEmpty || before.endsWith(' ') || before.endsWith('\n') ? '' : ' ';
        next = '$before$glue$text${v.text.substring(sel.end)}';
        caret = before.length + glue.length + text.length;
      } else {
        final glue = v.text.isEmpty || v.text.endsWith(' ') || v.text.endsWith('\n') ? '' : ' ';
        next = '${v.text}$glue$text';
        caret = next.length;
      }
      _text.value = TextEditingValue(text: next, selection: TextSelection.collapsed(offset: caret));
      widget.store.edit(question, next);
    } on ApiException catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
    } finally {
      File(path).delete().ignore();
      if (mounted) setState(() => _recognizing = false);
    }
  }

  void _go(int delta) {
    final i = _index + delta;
    if (i < 0 || i >= _all.length) return;
    widget.store.flush();
    setState(() {
      _forward = delta > 0;
      _tips = false;
      _id = _all[i].id;
      _text.text = _q.answer;
    });
  }

  @override
  Widget build(BuildContext context) {
    final c = context.c;
    final h = widget.hub;
    final editable = _book.editable;
    final chapters = _book.chapters;
    final chapterIndex = chapters.indexWhere((ch) => ch.key == _q.chapter);
    final chapterTitle = chapterIndex >= 0 ? chapters[chapterIndex].title : '';
    final inChapter = _book.inChapter(_q.chapter);
    final pos = inChapter.indexWhere((q) => q.id == _id);
    return Scaffold(
      backgroundColor: c.bg,
      appBar: BookHeader(
        bookId: _book.id,
        title: h?.title ?? _book.title,
        kind: h?.kind ?? '',
        coverUrl: h?.coverThumbUrl ?? '',
      ),
      body: SafeArea(
        top: false,
        child: Column(
          children: [
            // Строка редактора: глава и раздел, отметка сохранения.
            Container(
              height: 56,
              padding: const EdgeInsets.symmetric(horizontal: 16),
              decoration: BoxDecoration(
                color: c.surface.withValues(alpha: 0.5),
                border: Border(bottom: BorderSide(color: c.border)),
              ),
              child: Row(
                children: [
                  Icon(
                    LucideIcons.listTree,
                    size: 20,
                    color: c.text.withValues(alpha: 0.8),
                  ),
                  const SizedBox(width: 14),
                  Text(
                    'Глава ${chapterIndex + 1}',
                    style: const TextStyle(
                      fontSize: 15.5,
                      fontWeight: FontWeight.w500,
                    ),
                  ),
                  Text(
                    '  /  ',
                    style: TextStyle(fontSize: 15.5, color: c.wallpaperInk),
                  ),
                  Expanded(
                    child: Text(
                      chapterTitle,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(fontSize: 15.5, color: c.textMuted),
                    ),
                  ),
                  ListenableBuilder(
                    listenable: widget.store,
                    builder: (context, _) =>
                        _SaveMark(state: widget.store.save),
                  ),
                ],
              ),
            ),
            Expanded(
              child: GestureDetector(
                behavior: HitTestBehavior.translucent,
                onTap: editable ? () => _focus.requestFocus() : null,
                // Лист редактора: сюда «вырастает» первая страница открытой книги (LeafRoute).
                child: ClipRect(
                  child: PageTurnSwitcher(
                    forward: _forward,
                    child: KeyedSubtree(
                      key: ValueKey(_id),
                      child: Material(
                        color: c.bg,
                        child: ListView(
                          keyboardDismissBehavior:
                              ScrollViewKeyboardDismissBehavior.onDrag,
                          padding: const EdgeInsets.fromLTRB(20, 22, 20, 32),
                          children: [
                            _Ticks(
                              label: 'Вопрос ${pos + 1} из ${inChapter.length}',
                              items: [
                                for (final q in inChapter)
                                  q.answered ||
                                      q.id == _id &&
                                          _text.text.trim().isNotEmpty,
                              ],
                              current: pos,
                            ),
                            const SizedBox(height: 22),
                            Text(
                              _q.prompt.isNotEmpty ? _q.prompt : _q.title,
                              style: AppText.serif(
                                context,
                                size: 30,
                                weight: FontWeight.w500,
                              ).copyWith(height: 1.18),
                            ),
                            if (_q.hint != null && _q.hint!.isNotEmpty) ...[
                              const SizedBox(height: 12),
                              Text(
                                _q.hint!,
                                style: TextStyle(
                                  fontSize: 16,
                                  height: 1.55,
                                  color: c.textMuted,
                                ),
                              ),
                            ],
                            if (h != null && h.tips.isNotEmpty) ...[
                              const SizedBox(height: 10),
                              Align(
                                alignment: Alignment.centerLeft,
                                child: InkWell(
                                  onTap: () => setState(() => _tips = !_tips),
                                  child: Padding(
                                    padding: const EdgeInsets.symmetric(
                                      vertical: 10,
                                    ),
                                    child: Row(
                                      mainAxisSize: MainAxisSize.min,
                                      children: [
                                        Icon(
                                          LucideIcons.lightbulb,
                                          size: 17,
                                          color: c.brand,
                                        ),
                                        const SizedBox(width: 7),
                                        Text(
                                          h.whereToStart,
                                          style: TextStyle(
                                            fontSize: 15.5,
                                            color: c.brand,
                                          ),
                                        ),
                                        const SizedBox(width: 4),
                                        AnimatedRotation(
                                          turns: _tips ? 0.5 : 0,
                                          duration: const Duration(
                                            milliseconds: 180,
                                          ),
                                          child: Icon(
                                            LucideIcons.chevronDown,
                                            size: 15,
                                            color: c.brand,
                                          ),
                                        ),
                                      ],
                                    ),
                                  ),
                                ),
                              ),
                              if (_tips)
                                Column(
                                  children: [
                                    if (h.tipsNote != null)
                                      Enter(
                                        i: 0,
                                        child: _Tip(
                                          text: h.tipsNote!,
                                          rose: true,
                                        ),
                                      ),
                                    for (var i = 0; i < h.tips.length; i++)
                                      Enter(
                                        i: i + 1,
                                        child: _Tip(text: h.tips[i]),
                                      ),
                                  ],
                                ),
                            ],
                            const SizedBox(height: 26),
                            TextField(
                              controller: _text,
                              focusNode: _focus,
                              readOnly: !editable,
                              maxLines: null,
                              minLines: 6,
                              keyboardType: TextInputType.multiline,
                              textCapitalization: TextCapitalization.sentences,
                              onChanged: (v) =>
                                  setState(() => widget.store.edit(_q, v)),
                              style: AppText.serif(
                                context,
                                size: 21,
                              ).copyWith(height: 1.65),
                              decoration: InputDecoration(
                                hintText: editable ? h?.editor.answerPlaceholder : null,
                                hintStyle: AppText.serif(context, size: 21)
                                    .copyWith(
                                      color: c.textFaint,
                                      fontStyle: FontStyle.italic,
                                    ),
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
                  ),
                ),
              ),
            ),

            // Диктовка: идёт запись (с секундами) или распознавание — над нижней панелью.
            if (_recording || _recognizing)
              Container(
                width: double.infinity,
                padding: const EdgeInsets.fromLTRB(16, 10, 16, 10),
                color: c.bubbleOut,
                child: Row(children: [
                  _recording
                      ? Icon(LucideIcons.mic, size: 16, color: c.brand)
                      : const SizedBox(width: 14, height: 14, child: CircularProgressIndicator(strokeWidth: 2)),
                  const SizedBox(width: 10),
                  Expanded(child: Text(_recording ? (h?.editor.recording ?? '') : (h?.editor.recognizing ?? ''), style: const TextStyle(fontSize: 13.5))),
                  if (_recording) Text('${_seconds ~/ 60}:${(_seconds % 60).toString().padLeft(2, '0')}', style: TextStyle(fontSize: 13.5, fontWeight: FontWeight.w600, color: c.brand, fontFeatures: const [FontFeature.tabularFigures()])),
                ]),
              ),
            // Нижняя панель редактора: «назад», «Надиктовать» и тёмная «Следующий».
            Container(
              padding: const EdgeInsets.fromLTRB(12, 10, 12, 10),
              decoration: BoxDecoration(
                color: c.bg,
                border: Border(top: BorderSide(color: c.border)),
              ),
              child: Row(
                children: [
                  SizedBox(
                    width: 52,
                    height: 50,
                    child: OutlinedButton(
                      onPressed: _index > 0 ? () => _go(-1) : null,
                      style: OutlinedButton.styleFrom(
                        padding: EdgeInsets.zero,
                        side: BorderSide(color: c.border),
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(Cab.ctl),
                        ),
                        backgroundColor: c.surfaceRaised,
                      ),
                      child: Icon(
                        LucideIcons.arrowLeft,
                        size: 19,
                        color: _index > 0 ? c.text : c.textFaint,
                      ),
                    ),
                  ),
                  // Диктовка — как на сайте на телефоне: значок, во время записи — «Стоп».
                  if (editable && h != null) ...[
                    const SizedBox(width: 10),
                    Tooltip(
                      message: _recording ? h.editor.stop : h.editor.dictateTitle,
                      child: SizedBox(
                        height: 50,
                        child: OutlinedButton(
                          onPressed: _recognizing ? null : _dictate,
                          style: OutlinedButton.styleFrom(
                            minimumSize: const Size(52, 50),
                            padding: EdgeInsets.symmetric(horizontal: _recording ? 14 : 0),
                            side: BorderSide(color: _recording ? c.brand : c.border),
                            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(Cab.ctl)),
                            backgroundColor: _recording ? c.brand : c.surfaceRaised,
                            foregroundColor: _recording ? Colors.white : c.text,
                          ),
                          child: Row(mainAxisSize: MainAxisSize.min, children: [
                            Icon(_recording ? LucideIcons.square : LucideIcons.mic, size: 18),
                            if (_recording) ...[const SizedBox(width: 6), Text(h.editor.stop, style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w500))],
                          ]),
                        ),
                      ),
                    ),
                  ],
                  const SizedBox(width: 10),
                  Expanded(
                    child: SizedBox(
                      height: 50,
                      child: FilledButton(
                        onPressed: _index < _all.length - 1
                            ? () => _go(1)
                            : null,
                        style: FilledButton.styleFrom(
                          backgroundColor: c.text,
                          foregroundColor: c.bg,
                          shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(Cab.ctl),
                          ),
                        ),
                        child: Row(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            Text(
                              h?.editor.next ?? '',
                              style: const TextStyle(
                                fontSize: 17,
                                fontWeight: FontWeight.w500,
                              ),
                            ),
                            const SizedBox(width: 8),
                            const Icon(LucideIcons.arrowRight, size: 18),
                          ],
                        ),
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// «Вопрос 1 из 6» и отметки: отвеченные — тушью, текущий — винный, пустые — светлые (QuestionTicks).
class _Ticks extends StatelessWidget {
  const _Ticks({
    required this.label,
    required this.items,
    required this.current,
  });
  final String label;
  final List<bool> items;
  final int current;

  @override
  Widget build(BuildContext context) {
    final c = context.c;
    return Row(
      children: [
        Text(label, style: TextStyle(fontSize: 14.5, color: c.textMuted)),
        const SizedBox(width: 14),
        Flexible(
          child: Wrap(
            spacing: 5,
            runSpacing: 5,
            children: [
              for (var i = 0; i < items.length; i++)
                AnimatedContainer(
                  duration: const Duration(milliseconds: 250),
                  width: 16,
                  height: 4,
                  decoration: BoxDecoration(
                    borderRadius: BorderRadius.circular(2),
                    color: i == current
                        ? c.brand
                        : (items[i]
                              ? c.text.withValues(alpha: 0.65)
                              : c.wallpaperInk),
                  ),
                ),
            ],
          ),
        ),
      ],
    );
  }
}

class _Tip extends StatelessWidget {
  const _Tip({required this.text, this.rose = false});
  final String text;
  final bool rose;

  @override
  Widget build(BuildContext context) {
    final c = context.c;
    return Container(
      width: double.infinity,
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      decoration: BoxDecoration(
        color: rose ? c.bubbleOut : c.surface,
        borderRadius: BorderRadius.circular(Cab.ctl),
      ),
      child: Text(
        text,
        style: TextStyle(
          fontSize: 14.5,
          height: 1.4,
          color: c.text.withValues(alpha: 0.85),
        ),
      ),
    );
  }
}

/// Отметка сохранения: «✓ Сохранено», «Сохраняем…», без сети — «Сохраним, когда будет связь».
class _SaveMark extends StatelessWidget {
  const _SaveMark({required this.state});
  final SaveState state;

  @override
  Widget build(BuildContext context) {
    final c = context.c;
    final (text, color, icon) = switch (state) {
      SaveState.saved => ('Сохранено', c.textMuted, LucideIcons.check),
      SaveState.saving => ('Сохраняем…', c.textMuted, LucideIcons.loader),
      SaveState.offline => ('Без сети', c.warn, LucideIcons.cloudOff),
      SaveState.failed => (
        'Не сохранилось',
        c.danger,
        LucideIcons.triangleAlert,
      ),
    };
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Icon(
          icon,
          size: 15,
          color: state == SaveState.saved ? c.success : color,
        ),
        const SizedBox(width: 5),
        Text(text, style: TextStyle(fontSize: 14, color: color)),
      ],
    );
  }
}
