import 'dart:async';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:path_provider/path_provider.dart';
import 'package:record/record.dart';

import '../core/chat_controller.dart';
import '../core/format.dart';
import '../models/chat.dart';
import '../ui/kit.dart';
import '../ui/tokens.dart';

/// Поле ответа, как в WhatsApp: текст, скрепка, камера и круглая кнопка — «микрофон» (удерживать и говорить,
/// смахнуть влево — отмена) или «отправить», когда есть текст. Слева — молния быстрых ответов (шаблоны).
class Composer extends StatefulWidget {
  const Composer({super.key, required this.controller, this.templates = const [], required this.onTemplates, required this.onAttach, required this.onCamera, required this.onBlocked});
  final ChatController controller;

  /// Шаблоны диалога (уже с подстановками): их предлагает «/» в поле ввода.
  final List<Template> templates;
  final VoidCallback onTemplates;
  final VoidCallback onAttach;
  final VoidCallback onCamera;

  /// Сервер счёл текст чужими реквизитами: спросить причину и отправить с ней.
  final Future<String?> Function(String reason) onBlocked;

  @override
  State<Composer> createState() => ComposerState();
}

class ComposerState extends State<Composer> {
  final _text = TextEditingController();
  final _focus = FocusNode();
  final _recorder = AudioRecorder();
  bool _hasText = false;
  bool _recording = false;
  bool _cancelHint = false;
  Duration _elapsed = Duration.zero;
  Timer? _timer;
  DateTime? _startedAt;
  double _drag = 0;

  /// Шаблоны по «/»: показываются над полем, пока в тексте незавершённое «/слово» (в начале или после пробела).
  List<Template> _slash = const [];

  static final _slashRe = RegExp(r'(^|\s)/([^\s/]{0,30})$');

  @override
  void initState() {
    super.initState();
    _text.addListener(() {
      final has = _text.text.trim().isNotEmpty;
      if (has != _hasText) setState(() => _hasText = has);
      _updateSlash();
    });
  }

  void _updateSlash() {
    final sel = _text.selection;
    final caret = sel.isValid && sel.isCollapsed ? sel.baseOffset : _text.text.length;
    final m = widget.templates.isEmpty ? null : _slashRe.firstMatch(_text.text.substring(0, caret.clamp(0, _text.text.length)));
    List<Template> found = const [];
    if (m != null) {
      final q = m.group(2)!.toLowerCase();
      final byTitle = widget.templates.where((t) => t.title.toLowerCase().contains(q)).toList();
      // Совпадение в названии — выше, чем в тексте.
      found = [...byTitle, ...widget.templates.where((t) => !byTitle.contains(t) && (q.isEmpty || t.text.toLowerCase().contains(q)))].take(6).toList();
    }
    if (found.length != _slash.length || !found.every((t) => _slash.any((x) => x.id == t.id))) setState(() => _slash = found);
  }

  void _pickSlash(Template t) {
    final sel = _text.selection;
    final caret = sel.isValid ? sel.baseOffset : _text.text.length;
    final head = _text.text.substring(0, caret).replaceFirst(RegExp(r'/[^\s/]{0,30}$'), '');
    final next = head + t.text + _text.text.substring(caret);
    _text.value = TextEditingValue(
      text: next,
      selection: TextSelection.collapsed(offset: head.length + t.text.length),
    );
    setState(() => _slash = const []);
    _focus.requestFocus();
  }

  /// Подставить текст (шаблон) и поставить курсор в конец.
  void insert(String text) {
    _text.text = text;
    _text.selection = TextSelection.collapsed(offset: text.length);
    _focus.requestFocus();
  }

  Future<void> _send() async {
    final body = _text.text.trim();
    if (body.isEmpty) return;
    _text.clear();
    final r = await widget.controller.sendText(body);
    if (r.blocked != null && mounted) {
      final reason = await widget.onBlocked(r.blocked!);
      if (reason != null && reason.trim().isNotEmpty) {
        await widget.controller.sendText(body, override: reason.trim());
      } else {
        _text.text = body;
      }
    }
  }

  Future<void> _startRecording() async {
    if (_recording) return;
    if (!await _recorder.hasPermission()) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Разрешите доступ к микрофону в настройках телефона')));
      return;
    }
    final dir = await getTemporaryDirectory();
    final path = '${dir.path}/voice_${DateTime.now().millisecondsSinceEpoch}.m4a';
    await _recorder.start(const RecordConfig(encoder: AudioEncoder.aacLc, bitRate: 64000, sampleRate: 44100, numChannels: 1), path: path);
    HapticFeedback.mediumImpact();
    _startedAt = DateTime.now();
    _timer = Timer.periodic(const Duration(milliseconds: 200), (_) {
      if (!mounted) return;
      setState(() => _elapsed = DateTime.now().difference(_startedAt!));
      // Страховка: если отпускание кнопки потерялось (звонок, системный жест), запись не тянется бесконечно.
      if (_elapsed > const Duration(minutes: 5)) _finishRecording(send: true);
    });
    setState(() {
      _recording = true;
      _cancelHint = false;
      _drag = 0;
      _elapsed = Duration.zero;
    });
  }

  Future<void> _finishRecording({required bool send}) async {
    if (!_recording) return;
    _timer?.cancel();
    final length = DateTime.now().difference(_startedAt!);
    final path = await _recorder.stop();
    setState(() {
      _recording = false;
      _cancelHint = false;
      _drag = 0;
    });
    if (path == null) return;
    final file = File(path);
    if (!send || length < const Duration(milliseconds: 800)) {
      if (send && mounted) ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Удерживайте кнопку, чтобы записать голосовое'), duration: Duration(seconds: 2)));
      await file.delete().catchError((_) => file);
      return;
    }
    final problem = await widget.controller.sendVoice(file, length);
    if (problem != null && mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(problem)));
  }

  @override
  void dispose() {
    _timer?.cancel();
    _recorder.dispose();
    _text.dispose();
    _focus.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final c = context.c;
    return Container(
      decoration: BoxDecoration(
        color: c.bg,
        border: Border(top: BorderSide(color: c.border, width: 0.6)),
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (_slash.isNotEmpty && !_recording) _slashList(context),
          SafeArea(
            top: false,
            child: Padding(
              padding: const EdgeInsets.fromLTRB(8, 8, 8, 8),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  if (!_recording) ...[RoundIconButton(icon: LucideIcons.plus, onTap: widget.onAttach, size: 44, iconSize: 26, color: c.brandDeep, tooltip: 'Прикрепить'), const SizedBox(width: 4)],
                  Expanded(
                    child: Container(
                      decoration: BoxDecoration(color: c.surface, borderRadius: BorderRadius.circular(23)),
                      constraints: const BoxConstraints(minHeight: 44),
                      child: _recording ? GestureDetector(behavior: HitTestBehavior.opaque, onTap: () => _finishRecording(send: false), child: _recordingBar(context)) : _inputRow(context),
                    ),
                  ),
                  const SizedBox(width: 8),
                  _actionButton(context),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }

  /// Подсказка шаблонов по «/»: название, строка текста; нажатие вставляет шаблон вместо «/слова».
  Widget _slashList(BuildContext context) {
    final c = context.c;
    return Container(
      constraints: const BoxConstraints(maxHeight: 230),
      decoration: BoxDecoration(
        border: Border(bottom: BorderSide(color: c.border, width: 0.6)),
      ),
      child: ListView.separated(
        shrinkWrap: true,
        padding: EdgeInsets.zero,
        keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.manual,
        itemCount: _slash.length,
        separatorBuilder: (_, _) => Divider(height: 1, indent: 16, color: c.border),
        itemBuilder: (_, i) {
          final t = _slash[i];
          return InkWell(
            onTap: () => _pickSlash(t),
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 9),
              child: Row(
                children: [
                  Icon(LucideIcons.zap, size: 18, color: c.brandDeep),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          children: [
                            Flexible(
                              child: Text(
                                t.title,
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                                style: TextStyle(fontSize: 15.5, fontWeight: FontWeight.w600, color: c.text),
                              ),
                            ),
                            if (t.own)
                              Container(
                                margin: const EdgeInsets.only(left: 8),
                                padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 1),
                                decoration: BoxDecoration(color: c.brandDeep.withValues(alpha: 0.14), borderRadius: BorderRadius.circular(7)),
                                child: Text(
                                  'мой',
                                  style: TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: c.brandDeep),
                                ),
                              ),
                          ],
                        ),
                        Text(
                          t.text.replaceAll('\n', ' '),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: TextStyle(fontSize: 13.5, color: c.textMuted),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          );
        },
      ),
    );
  }

  Widget _inputRow(BuildContext context) {
    final c = context.c;
    return Row(
      crossAxisAlignment: CrossAxisAlignment.end,
      children: [
        const SizedBox(width: 6),
        Expanded(
          child: TextField(
            controller: _text,
            focusNode: _focus,
            minLines: 1,
            maxLines: 6,
            textCapitalization: TextCapitalization.sentences,
            style: TextStyle(fontSize: 17, color: c.text, height: 1.25),
            decoration: InputDecoration(
              hintText: 'Сообщение  (/ — шаблоны)',
              hintStyle: TextStyle(color: c.textFaint, fontSize: 17),
              border: InputBorder.none,
              enabledBorder: InputBorder.none,
              focusedBorder: InputBorder.none,
              filled: false,
              isDense: true,
              contentPadding: const EdgeInsets.fromLTRB(10, 12, 4, 12),
            ),
          ),
        ),
        RoundIconButton(icon: LucideIcons.zap, onTap: widget.onTemplates, size: 42, iconSize: 21, color: c.textMuted, tooltip: 'Быстрые ответы'),
        if (!_hasText) RoundIconButton(icon: LucideIcons.camera, onTap: widget.onCamera, size: 42, iconSize: 22, color: c.textMuted, tooltip: 'Камера'),
      ],
    );
  }

  Widget _recordingBar(BuildContext context) {
    final c = context.c;
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 13),
      child: Row(
        children: [
          const _BlinkingDot(),
          const SizedBox(width: 10),
          Text(
            duration(_elapsed),
            style: TextStyle(fontSize: 17, fontWeight: FontWeight.w600, color: c.text, fontFeatures: const [FontFeature.tabularFigures()]),
          ),
          const Spacer(),
          Opacity(
            opacity: (1 - (_drag.abs() / 130)).clamp(0.25, 1.0),
            child: Row(
              children: [
                Icon(_cancelHint ? LucideIcons.trash2 : LucideIcons.chevronLeft, size: 18, color: _cancelHint ? c.danger : c.textMuted),
                const SizedBox(width: 2),
                Text(_cancelHint ? 'Отпустите — отмена' : 'Влево или тап — отмена', style: TextStyle(color: _cancelHint ? c.danger : c.textMuted, fontSize: 15)),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _actionButton(BuildContext context) {
    final c = context.c;
    final canSend = _hasText;
    final size = _recording ? 62.0 : 46.0;
    final button = AnimatedContainer(
      duration: const Duration(milliseconds: 140),
      width: size,
      height: size,
      transform: Matrix4.translationValues(_recording ? _drag : 0, 0, 0),
      decoration: BoxDecoration(
        color: _cancelHint ? c.danger : c.brandDeep,
        shape: BoxShape.circle,
        boxShadow: _recording ? [BoxShadow(color: c.brandDeep.withValues(alpha: 0.4), blurRadius: 18)] : null,
      ),
      child: AnimatedSwitcher(
        duration: const Duration(milliseconds: 140),
        child: Icon(canSend ? LucideIcons.arrowUp : LucideIcons.mic, key: ValueKey(canSend), color: Colors.white, size: _recording ? 28 : 23),
      ),
    );
    if (canSend) return GestureDetector(onTap: _send, child: button);
    return GestureDetector(
      onTap: () => ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Удерживайте кнопку, чтобы записать голосовое'), duration: Duration(seconds: 2))),
      onLongPressStart: (_) => _startRecording(),
      onLongPressMoveUpdate: (d) {
        if (!_recording) return;
        final dx = d.offsetFromOrigin.dx.clamp(-170.0, 0.0);
        final cancel = dx < -95;
        if (cancel && !_cancelHint) HapticFeedback.selectionClick();
        setState(() {
          _drag = dx;
          _cancelHint = cancel;
        });
      },
      onLongPressEnd: (_) => _finishRecording(send: !_cancelHint),
      onLongPressCancel: () => _finishRecording(send: false),
      child: button,
    );
  }
}

class _BlinkingDot extends StatefulWidget {
  const _BlinkingDot();

  @override
  State<_BlinkingDot> createState() => _BlinkingDotState();
}

class _BlinkingDotState extends State<_BlinkingDot> with SingleTickerProviderStateMixin {
  late final AnimationController _c = AnimationController(vsync: this, duration: const Duration(milliseconds: 700))..repeat(reverse: true);

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => FadeTransition(
    opacity: _c,
    child: Container(
      width: 11,
      height: 11,
      decoration: BoxDecoration(color: context.c.danger, shape: BoxShape.circle),
    ),
  );
}
