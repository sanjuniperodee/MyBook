import 'dart:async';
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_svg/flutter_svg.dart';
import 'package:http/http.dart' as http;
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../api/mybook_api.g.dart' as v1api;
import '../../core/api.dart';
import '../../ui/tokens.dart';
import '../data/backend.dart';
import '../ui/cabinet.dart';

/// Что вкладкам студии нужно от экрана «Страницы»: сервер, книга, правка с «Отменить» и смена разворота на сцене.
abstract class PagesHost {
  ClientBackend get backend;
  String get bookId;
  v1api.PagesView get view;

  /// Запомнить оформление до правки (для «Отменить») и принять новую модель экрана.
  void commit(v1api.PagesView next, {String? spread, bool undoable = true});
  void showSpread(String kind);
  void error(String message);
}

/// Вкладка студии (Текст, Элементы, Цвета, Главы, шрифты по ролям): разделы и элементы управления — с сервера
/// (API v1 pagesStudioGet), правки — операциями (pagesStudioApply). Своих списков, чисел и подписей здесь нет.
class StudioTabView extends StatefulWidget {
  const StudioTabView({super.key, required this.host, required this.tab, this.header});
  final PagesHost host;
  final String tab;

  /// Над разделами (вкладка «Шрифты» — готовые пары).
  final Widget? header;

  @override
  State<StudioTabView> createState() => _StudioTabViewState();
}

class _StudioTabViewState extends State<StudioTabView> {
  v1api.PagesStudio? _s;
  String? _chapter;
  bool _busy = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void didUpdateWidget(StudioTabView old) {
    super.didUpdateWidget(old);
    // Стиль сменили снаружи (отмена, ИИ, другой стиль) — значения вкладки перечитать.
    if (old.host.view.state.styleJson != widget.host.view.state.styleJson && !_busy) _load();
  }

  Future<void> _load() async {
    final b = widget.host.backend;
    try {
      final s = await b.call(() => b.contract.pagesStudioGet(bookId: widget.host.bookId, tab: widget.tab, chapter: _chapter));
      if (mounted) setState(() => _s = s);
    } on ApiException catch (e) {
      widget.host.error(e.message);
    }
  }

  Future<void> _apply(List<v1api.PagesStudioOp> ops, String? spread) async {
    final b = widget.host.backend;
    setState(() => _busy = true);
    try {
      final r = await b.call(() => b.contract.pagesStudioApply(bookId: widget.host.bookId, body: v1api.PagesStudioBody(tab: widget.tab, chapter: _s?.chapter, ops: ops)));
      if (!mounted) return;
      setState(() => _s = r.studio);
      widget.host.commit(r.view, spread: spread);
    } on ApiException catch (e) {
      widget.host.error(e.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  void _send(v1api.PagesStudioControl c, String? json) => _apply([v1api.PagesStudioOp(target: c.target ?? 'style', section: c.section, key: c.key, json: json)], c.spread);

  @override
  Widget build(BuildContext context) {
    final c = context.c;
    final s = _s;
    if (s == null) return const Padding(padding: EdgeInsets.all(24), child: Center(child: CircularProgressIndicator()));
    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      ?widget.header,
      // «Главы»: пояснение — над списком глав, как у сайта.
      if (s.chapters != null)
        for (final sec in s.sections.where((x) => x.title == null && x.reset == null)) ...[
          for (final ctl in sec.controls) Padding(padding: const EdgeInsets.only(bottom: 12), child: StudioControlView(control: ctl, studio: s, host: widget.host, onSend: (_) {})),
        ],
      if (s.chapters != null) ...[
        if (s.chapters!.isEmpty) Text(s.labels.empty, style: TextStyle(fontSize: 14, color: c.textMuted)),
        Wrap(spacing: 6, runSpacing: 6, children: [
          for (final ch in s.chapters!)
            StudioChip(
              label: ch.label,
              on: ch.key == s.chapter,
              dot: ch.styled,
              onTap: () {
                setState(() => _chapter = ch.key);
                widget.host.showSpread('chapter');
                _load();
              },
            ),
        ]),
        const SizedBox(height: 18),
      ],
      for (final sec in s.sections.where((x) => s.chapters == null || x.title != null || x.reset != null)) ...[
        _Section(
          section: sec,
          studio: s,
          host: widget.host,
          onSend: _send,
          onReset: sec.reset == null ? null : () => _apply([sec.reset!], 'chapter'),
        ),
        const SizedBox(height: 22),
      ],
    ]);
  }
}

class _Section extends StatelessWidget {
  const _Section({required this.section, required this.studio, required this.host, required this.onSend, this.onReset});
  final v1api.PagesStudioSections section;
  final v1api.PagesStudio studio;
  final PagesHost host;
  final void Function(v1api.PagesStudioControl c, String? json) onSend;
  final VoidCallback? onReset;

  @override
  Widget build(BuildContext context) {
    final c = context.c;
    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      if (section.title != null || onReset != null)
        Padding(
          padding: const EdgeInsets.only(bottom: 10),
          child: Row(children: [
            Expanded(child: Text((section.title ?? '').toUpperCase(), style: TextStyle(fontSize: 12, letterSpacing: 0.8, fontWeight: FontWeight.w600, color: c.textMuted))),
            if (onReset != null)
              TextButton.icon(
                style: TextButton.styleFrom(padding: EdgeInsets.zero, foregroundColor: c.textMuted, visualDensity: VisualDensity.compact),
                onPressed: onReset,
                icon: const Icon(LucideIcons.rotateCcw, size: 14),
                label: Text(section.resetLabel ?? studio.labels.reset, style: const TextStyle(fontSize: 12.5)),
              ),
          ]),
        ),
      if (section.text != null) Padding(padding: const EdgeInsets.only(bottom: 10), child: Text(section.text!, style: TextStyle(fontSize: 12.5, height: 1.4, color: c.textMuted))),
      for (final ctl in section.controls) Padding(padding: const EdgeInsets.only(bottom: 14), child: StudioControlView(control: ctl, studio: studio, host: host, onSend: (json) => onSend(ctl, json))),
    ]);
  }
}

/// Один элемент управления студии по описанию сервера.
class StudioControlView extends StatelessWidget {
  const StudioControlView({super.key, required this.control, required this.studio, required this.host, required this.onSend});
  final v1api.PagesStudioControl control;
  final v1api.PagesStudio studio;
  final PagesHost host;

  /// Значение JSON-строкой; null — «как в стиле».
  final ValueChanged<String?> onSend;

  @override
  Widget build(BuildContext context) {
    final c = context.c;
    final k = control;
    Widget labelRow(String? label, {Widget? trailing}) => label == null && !k.custom && trailing == null
        ? const SizedBox.shrink()
        : Padding(
            padding: const EdgeInsets.only(bottom: 6),
            child: Row(children: [
              Expanded(child: Text(label ?? '', style: TextStyle(fontSize: 13.5, fontWeight: FontWeight.w500, color: c.text.withValues(alpha: 0.85)))),
              ?trailing,
              if (k.custom)
                InkWell(
                  onTap: () => onSend(null),
                  child: Padding(padding: const EdgeInsets.only(left: 8), child: Icon(LucideIcons.rotateCcw, size: 15, color: c.textMuted, semanticLabel: studio.labels.reset)),
                ),
            ]),
          );
    switch (k.kind) {
      case 'note':
        return Text(k.hint ?? '', style: TextStyle(fontSize: 12.5, height: 1.4, color: c.textMuted));
      case 'warning':
        return Container(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
          decoration: BoxDecoration(color: c.warnBg, borderRadius: BorderRadius.circular(12)),
          child: Row(children: [Icon(LucideIcons.triangleAlert, size: 16, color: c.warn), const SizedBox(width: 8), Expanded(child: Text(k.hint ?? '', style: TextStyle(fontSize: 12.5, color: c.warn)))]),
        );
      case 'number':
        return _NumberControl(control: k, labelRow: labelRow, onSend: onSend);
      case 'toggle':
        return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          InkWell(
            onTap: () => onSend(k.checked == true ? k.offJson : k.onJson),
            child: Row(children: [
              Expanded(child: Text(k.label ?? '', style: const TextStyle(fontSize: 14))),
              Switch.adaptive(value: k.checked == true, activeTrackColor: c.brand, onChanged: (v) => onSend(v ? k.onJson : k.offJson)),
            ]),
          ),
          if (k.hint != null) Text(k.hint!, style: TextStyle(fontSize: 12, height: 1.4, color: c.textMuted)),
        ]);
      case 'text':
        return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          labelRow(k.label),
          _TextControl(control: k, onSend: onSend),
          if (k.hint != null) Padding(padding: const EdgeInsets.only(top: 4), child: Text(k.hint!, style: TextStyle(fontSize: 12, color: c.textMuted))),
        ]);
      case 'choice':
        return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          labelRow(k.label),
          Wrap(spacing: 6, runSpacing: 6, children: [
            for (final o in k.options ?? const <v1api.PagesStudioOption>[]) StudioChip(label: o.label, on: o.id == k.selected, onTap: () => onSend(o.json)),
          ]),
          if (k.hint != null) Padding(padding: const EdgeInsets.only(top: 6), child: Text(k.hint!, style: TextStyle(fontSize: 12, height: 1.4, color: c.textMuted))),
        ]);
      case 'tiles':
        return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          labelRow(k.label),
          LayoutBuilder(builder: (_, box) {
            final palette = (k.options ?? const []).any((o) => o.swatches != null);
            final cols = palette ? 3 : 4;
            final w = (box.maxWidth - (cols - 1) * 8) / cols;
            return Wrap(spacing: 8, runSpacing: 8, children: [
              for (final o in k.options ?? const <v1api.PagesStudioOption>[]) SizedBox(width: w, child: _Tile(option: o, on: o.id == k.selected, onTap: () => onSend(o.json))),
            ]);
          }),
        ]);
      case 'color':
        return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          labelRow(k.label),
          Wrap(spacing: 8, runSpacing: 8, crossAxisAlignment: WrapCrossAlignment.center, children: [
            if (k.noneLabel != null) StudioChip(label: k.noneLabel!, on: k.color == null, onTap: () => onSend(k.noneJson)),
            for (final sw in k.swatches ?? const <String>[]) _Swatch(color: sw, on: k.color?.toUpperCase() == sw.toUpperCase(), onTap: () => onSend(jsonEncode(sw))),
            if (k.color != null && !(k.swatches ?? const []).any((s) => s.toUpperCase() == k.color!.toUpperCase())) _Swatch(color: k.color!, on: true, onTap: () {}),
          ]),
        ]);
      case 'font':
        final f = (studio.fonts ?? const <v1api.PagesStudioFont>[]).where((x) => x.id == k.selected).firstOrNull;
        return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          labelRow(null),
          InkWell(
            borderRadius: BorderRadius.circular(12),
            onTap: () async {
              final picked = await showModalBottomSheet<String>(
                context: context,
                isScrollControlled: true,
                useSafeArea: true,
                backgroundColor: c.bg,
                builder: (_) => _FontSheet(studio: studio, backend: host.backend, current: k.selected, bodyOnly: k.bodyOnly == true, title: k.label ?? ''),
              );
              if (picked != null && picked != k.selected) onSend(jsonEncode({'font': picked}));
            },
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
              decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(12), border: Border.all(color: c.border)),
              child: Row(children: [
                Expanded(child: f == null ? Text(k.selected ?? '') : BookFontText(text: f.name, url: f.url, backend: host.backend, style: const TextStyle(fontSize: 19))),
                Icon(LucideIcons.chevronDown, size: 18, color: c.textMuted),
              ]),
            ),
          ),
        ]);
    }
    return const SizedBox.shrink();
  }
}

class _NumberControl extends StatefulWidget {
  const _NumberControl({required this.control, required this.labelRow, required this.onSend});
  final v1api.PagesStudioControl control;
  final Widget Function(String? label, {Widget? trailing}) labelRow;
  final ValueChanged<String?> onSend;

  @override
  State<_NumberControl> createState() => _NumberControlState();
}

class _NumberControlState extends State<_NumberControl> {
  double? _drag;

  String _show(double v) {
    final k = widget.control;
    final shown = v * (k.scale ?? 1);
    final step = (k.step ?? 1) * (k.scale ?? 1);
    final digits = step >= 1 ? 0 : (step >= 0.1 ? 1 : 2);
    return '${shown.toStringAsFixed(digits)}${k.unit == null ? '' : ' ${k.unit}'}';
  }

  void _send(double v) {
    final k = widget.control;
    final step = k.step ?? 1;
    final snapped = double.parse(((v / step).round() * step).toStringAsFixed(4));
    widget.onSend(k.unsetAt != null && (snapped - k.unsetAt!).abs() < 1e-9 ? null : jsonEncode(snapped));
  }

  @override
  Widget build(BuildContext context) {
    final c = context.c;
    final k = widget.control;
    final min = k.min ?? 0, max = k.max ?? 1, step = k.step ?? 1;
    final value = (_drag ?? k.value ?? min).clamp(min, max).toDouble();
    if (k.slider == false) {
      return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        widget.labelRow(k.label),
        Row(children: [
          IconButton.outlined(onPressed: value - step >= min ? () => _send(value - step) : null, icon: const Icon(LucideIcons.minus, size: 16)),
          SizedBox(width: 56, child: Text(_show(value), textAlign: TextAlign.center, style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w500))),
          IconButton.outlined(onPressed: value + step <= max ? () => _send(value + step) : null, icon: const Icon(LucideIcons.plus, size: 16)),
        ]),
      ]);
    }
    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      widget.labelRow(k.label, trailing: Text(_show(value), style: TextStyle(fontSize: 13, color: c.textMuted, fontFeatures: const [FontFeature.tabularFigures()]))),
      SliderTheme(
        data: SliderTheme.of(context).copyWith(trackHeight: 3, tickMarkShape: SliderTickMarkShape.noTickMark, activeTrackColor: c.brand, thumbColor: c.brand, inactiveTrackColor: c.border, overlayShape: SliderComponentShape.noOverlay),
        child: Slider(
          value: value,
          min: min,
          max: max,
          divisions: ((max - min) / step).round().clamp(1, 1000),
          onChanged: (v) => setState(() => _drag = v),
          onChangeEnd: (v) {
            setState(() => _drag = null);
            _send(v);
          },
        ),
      ),
    ]);
  }
}

/// Текст с автосохранением через 600 мс (как поля студии сайта).
class _TextControl extends StatefulWidget {
  const _TextControl({required this.control, required this.onSend});
  final v1api.PagesStudioControl control;
  final ValueChanged<String?> onSend;

  @override
  State<_TextControl> createState() => _TextControlState();
}

class _TextControlState extends State<_TextControl> {
  late final _ctl = TextEditingController(text: widget.control.text ?? '');
  Timer? _t;

  @override
  void dispose() {
    _t?.cancel();
    _ctl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => TextField(
        controller: _ctl,
        maxLength: widget.control.maxLength,
        decoration: InputDecoration(hintText: widget.control.placeholder, counterText: ''),
        onChanged: (v) {
          _t?.cancel();
          _t = Timer(const Duration(milliseconds: 600), () => widget.onSend(v.trim().isEmpty ? null : jsonEncode(v)));
        },
      );
}

class _Tile extends StatelessWidget {
  const _Tile({required this.option, required this.on, required this.onTap});
  final v1api.PagesStudioOption option;
  final bool on;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final c = context.c;
    final o = option;
    return Semantics(
      button: true,
      selected: on,
      label: o.label,
      child: GestureDetector(
        onTap: onTap,
        child: Container(
          height: o.swatches != null ? 66 : 56,
          padding: const EdgeInsets.all(6),
          decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(12), border: Border.all(color: on ? c.brand : c.border, width: on ? 1.5 : 1)),
          child: o.swatches != null
              ? Column(crossAxisAlignment: CrossAxisAlignment.start, mainAxisAlignment: MainAxisAlignment.center, children: [
                  Row(children: [for (final s in o.swatches!) Container(width: 20, height: 20, margin: const EdgeInsets.only(right: 2), decoration: BoxDecoration(color: _hex(s), shape: BoxShape.circle, border: Border.all(color: Colors.white, width: 2)))]),
                  const SizedBox(height: 4),
                  Text(o.label, maxLines: 1, overflow: TextOverflow.ellipsis, style: TextStyle(fontSize: 11.5, color: c.text.withValues(alpha: 0.8))),
                ])
              : Column(mainAxisAlignment: MainAxisAlignment.center, children: [
                  if (o.svg != null) Expanded(child: SvgPicture.string(o.svg!, fit: BoxFit.contain)),
                  if (o.svg == null || o.svg!.isEmpty) Expanded(child: Center(child: Text(o.label, maxLines: 2, textAlign: TextAlign.center, overflow: TextOverflow.ellipsis, style: TextStyle(fontSize: 11, color: c.textMuted)))),
                ]),
        ),
      ),
    );
  }
}

Color _hex(String s) => Color(int.parse('FF${s.replaceFirst('#', '')}', radix: 16));

class _Swatch extends StatelessWidget {
  const _Swatch({required this.color, required this.on, required this.onTap});
  final String color;
  final bool on;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => GestureDetector(
        onTap: onTap,
        child: Container(
          width: 32,
          height: 32,
          decoration: BoxDecoration(shape: BoxShape.circle, color: _hex(color), border: Border.all(color: on ? context.c.brand : Colors.black.withValues(alpha: 0.12), width: on ? 3 : 1)),
        ),
      );
}

/// Чип выбора (как .chip сайта): выбранный — тушью.
class StudioChip extends StatelessWidget {
  const StudioChip({super.key, required this.label, required this.on, required this.onTap, this.dot = false});
  final String label;
  final bool on;
  final bool dot;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final c = context.c;
    return GestureDetector(
      onTap: onTap,
      child: Container(
        constraints: const BoxConstraints(minHeight: 38),
        padding: const EdgeInsets.symmetric(horizontal: 13, vertical: 8),
        decoration: BoxDecoration(color: on ? c.text : Colors.white, borderRadius: BorderRadius.circular(99), border: Border.all(color: on ? c.text : c.border)),
        child: Row(mainAxisSize: MainAxisSize.min, children: [
          Flexible(child: Text(label, maxLines: 1, overflow: TextOverflow.ellipsis, style: TextStyle(fontSize: 13.5, color: on ? c.bg : c.text))),
          if (dot) Container(width: 6, height: 6, margin: const EdgeInsets.only(left: 6), decoration: BoxDecoration(shape: BoxShape.circle, color: on ? c.bg : c.brand)),
        ]),
      ),
    );
  }
}

/// Выбор шрифта роли (FontPicker сайта): поиск, группы, названия — своими шрифтами.
class _FontSheet extends StatefulWidget {
  const _FontSheet({required this.studio, required this.backend, required this.current, required this.bodyOnly, required this.title});
  final v1api.PagesStudio studio;
  final ClientBackend backend;
  final String? current;
  final bool bodyOnly;
  final String title;

  @override
  State<_FontSheet> createState() => _FontSheetState();
}

class _FontSheetState extends State<_FontSheet> {
  String _q = '';
  String _group = 'all';

  @override
  Widget build(BuildContext context) {
    final c = context.c;
    final all = (widget.studio.fonts ?? const <v1api.PagesStudioFont>[]).where((f) => !widget.bodyOnly || f.body).toList();
    final groups = (widget.studio.fontCategories ?? const []).where((g) => g.id == 'all' || all.any((f) => f.category == g.id)).toList();
    final q = _q.trim().toLowerCase();
    final shown = all.where((f) => (_group == 'all' || f.category == _group) && (q.isEmpty || f.name.toLowerCase().contains(q))).toList();
    return DraggableScrollableSheet(
      expand: false,
      initialChildSize: 0.85,
      maxChildSize: 0.95,
      builder: (_, scroll) => Column(children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 16, 16, 8),
          child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            Text(widget.title, style: AppText.serif(context, size: 24, weight: FontWeight.w500)),
            const SizedBox(height: 10),
            TextField(onChanged: (v) => setState(() => _q = v), decoration: InputDecoration(isDense: true, hintText: widget.studio.labels.search, prefixIcon: Icon(LucideIcons.search, size: 18, color: c.textMuted))),
            const SizedBox(height: 10),
            SingleChildScrollView(
              scrollDirection: Axis.horizontal,
              child: Row(children: [for (final g in groups) Padding(padding: const EdgeInsets.only(right: 6), child: StudioChip(label: g.label, on: _group == g.id, onTap: () => setState(() => _group = g.id)))]),
            ),
          ]),
        ),
        Expanded(
          child: ListView.builder(
            controller: scroll,
            itemCount: shown.length,
            itemBuilder: (_, i) {
              final f = shown[i];
              final on = f.id == widget.current;
              return ListTile(
                onTap: () => Navigator.pop(context, f.id),
                title: BookFontText(text: f.name, url: f.url, backend: widget.backend, style: TextStyle(fontSize: 20, color: c.text)),
                trailing: on ? Icon(LucideIcons.check, color: c.brand) : null,
              );
            },
          ),
        ),
      ]),
    );
  }
}

/// Текст шрифтом книги: файл начертания грузится один раз (FontLoader), до этого — шрифт приложения.
class BookFontText extends StatefulWidget {
  const BookFontText({super.key, required this.text, required this.url, required this.backend, required this.style, this.maxLines = 1, this.weight = 400, this.italic = false});
  final String text;
  final String url;
  final ClientBackend backend;
  final TextStyle style;
  final int maxLines;
  final int weight;
  final bool italic;

  @override
  State<BookFontText> createState() => _BookFontTextState();
}

class _BookFontTextState extends State<BookFontText> {
  static final _loaded = <String, Future<bool>>{};

  String get _family => 'book-${widget.url.split('/').last}';

  @override
  void initState() {
    super.initState();
    _loaded.putIfAbsent(_family, () async {
      try {
        final res = await http.get(Uri.parse(widget.backend.url(widget.url)));
        if (res.statusCode != 200) return false;
        await (FontLoader(_family)..addFont(Future.value(ByteData.sublistView(res.bodyBytes)))).load();
        return true;
      } catch (_) {
        return false;
      }
    });
  }

  @override
  Widget build(BuildContext context) => FutureBuilder<bool>(
        future: _loaded[_family],
        builder: (_, snap) => Text(
          widget.text,
          maxLines: widget.maxLines,
          overflow: TextOverflow.ellipsis,
          style: widget.style.copyWith(
            fontFamily: snap.data == true ? _family : null,
            fontWeight: FontWeight.values[(widget.weight ~/ 100 - 1).clamp(0, 8)],
            fontStyle: widget.italic ? FontStyle.italic : FontStyle.normal,
          ),
        ),
      );
}

/// «Главы книги» (ChaptersEditor сайта): номер, своё название и эпиграф, убрать или вернуть, порядок; режим оглавления.
class ChaptersEditorView extends StatefulWidget {
  const ChaptersEditorView({super.key, required this.host});
  final PagesHost host;

  @override
  State<ChaptersEditorView> createState() => _ChaptersEditorViewState();
}

class _ChaptersEditorViewState extends State<ChaptersEditorView> {
  v1api.PagesChapters? _d;
  String? _open;
  bool _busy = false;
  final _timers = <String, Timer>{};

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    for (final t in _timers.values) {
      t.cancel();
    }
    super.dispose();
  }

  Future<void> _load() async {
    final b = widget.host.backend;
    try {
      final d = await b.call(() => b.contract.pagesChapters(bookId: widget.host.bookId));
      if (mounted) setState(() => _d = d);
    } on ApiException catch (e) {
      widget.host.error(e.message);
    }
  }

  Future<void> _send(v1api.PagesChaptersBody body, {String spread = 'chapter'}) async {
    final b = widget.host.backend;
    setState(() => _busy = true);
    try {
      final r = await b.call(() => b.contract.pagesChaptersUpdate(bookId: widget.host.bookId, body: body));
      if (!mounted) return;
      setState(() => _d = r.chapters);
      widget.host.commit(r.view, spread: spread, undoable: false);
    } on ApiException catch (e) {
      widget.host.error(e.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  void _later(String key, v1api.PagesChaptersBody body) {
    _timers[key]?.cancel();
    _timers[key] = Timer(const Duration(milliseconds: 600), () => _send(body));
  }

  @override
  Widget build(BuildContext context) {
    final c = context.c;
    final d = _d;
    if (d == null) return const Padding(padding: EdgeInsets.all(16), child: Center(child: CircularProgressIndicator()));
    final l = d.labels;
    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      Text(l.title.toUpperCase(), style: TextStyle(fontSize: 12, letterSpacing: 0.8, fontWeight: FontWeight.w600, color: c.textMuted)),
      const SizedBox(height: 6),
      Text(l.text, style: TextStyle(fontSize: 12.5, height: 1.4, color: c.textMuted)),
      const SizedBox(height: 10),
      if (d.rows.isEmpty) Text(l.later, style: TextStyle(fontSize: 14, color: c.textMuted)),
      if (l.removedCount != null) Padding(padding: const EdgeInsets.only(bottom: 8), child: Text(l.removedCount!, style: TextStyle(fontSize: 12, color: c.textMuted))),
      if (!d.blank)
        for (final r in d.rows) _row(d, r),
      const SizedBox(height: 14),
      Text(l.toc.toUpperCase(), style: TextStyle(fontSize: 12, letterSpacing: 0.8, fontWeight: FontWeight.w600, color: c.textMuted)),
      const SizedBox(height: 8),
      for (final m in d.tocModes)
        InkWell(
          onTap: !d.editable || _busy || m.id == d.tocMode ? null : () => _send(v1api.PagesChaptersBody(tocMode: m.id), spread: 'toc'),
          child: Padding(
            padding: const EdgeInsets.symmetric(vertical: 8),
            child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Icon(m.id == d.tocMode ? Icons.radio_button_checked : Icons.radio_button_off, size: 20, color: m.id == d.tocMode ? c.brand : c.textMuted),
              const SizedBox(width: 12),
              Expanded(
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text(m.title, style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w500)),
                  Text(m.text, style: TextStyle(fontSize: 12.5, color: c.textMuted)),
                ]),
              ),
            ]),
          ),
        ),
    ]);
  }

  Widget _row(v1api.PagesChapters d, v1api.PagesChapterRow r) {
    final c = context.c;
    final l = d.labels;
    final open = _open == r.key;
    final title = r.title.trim().isNotEmpty ? r.title : r.label;
    final editable = d.editable && !_busy;
    return Container(
      margin: const EdgeInsets.only(bottom: 6),
      decoration: BoxDecoration(
        color: r.removed ? c.surface : Colors.white,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: open ? c.brand.withValues(alpha: 0.4) : c.border, width: open ? 1.5 : 1),
      ),
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        InkWell(
          borderRadius: BorderRadius.circular(14),
          onTap: () {
            setState(() => _open = open ? null : r.key);
            if (!open) widget.host.showSpread('chapter');
          },
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
            child: Row(children: [
              SizedBox(width: 26, child: Text(r.number == null ? '—' : '${r.number}.', textAlign: TextAlign.right, style: TextStyle(fontSize: 13.5, color: c.textMuted))),
              const SizedBox(width: 10),
              Expanded(
                child: Text(title, maxLines: 1, overflow: TextOverflow.ellipsis, style: TextStyle(fontSize: 14.5, fontWeight: FontWeight.w500, decoration: r.removed ? TextDecoration.lineThrough : null, color: r.removed ? c.textMuted : c.text)),
              ),
              if (r.removed) Container(padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2), decoration: BoxDecoration(color: c.surface, borderRadius: BorderRadius.circular(99)), child: Text(l.removed, style: TextStyle(fontSize: 11.5, color: c.textMuted))),
              Icon(open ? LucideIcons.chevronUp : LucideIcons.chevronDown, size: 17, color: c.textMuted),
            ]),
          ),
        ),
        if (open)
          Padding(
            padding: const EdgeInsets.fromLTRB(12, 0, 12, 12),
            child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
              if (!r.removed) ...[
                _Field(initial: r.title, hint: r.label, max: d.limits.title, enabled: editable, reset: r.title.isNotEmpty ? l.nameReset : null, onChanged: (v) => _later('t${r.key}', v1api.PagesChaptersBody(key: r.key, title: v)), onReset: () => _send(v1api.PagesChaptersBody(key: r.key, title: ''))),
                const SizedBox(height: 8),
                _Field(initial: r.epigraph, hint: r.epigraphPlaceholder, max: d.limits.epigraph, italic: true, enabled: editable, reset: r.epigraph.isNotEmpty ? l.epigraphReset : null, onChanged: (v) => _later('e${r.key}', v1api.PagesChaptersBody(key: r.key, epigraph: v)), onReset: () => _send(v1api.PagesChaptersBody(key: r.key, epigraph: ''))),
                const SizedBox(height: 8),
              ],
              Text(r.meta, style: TextStyle(fontSize: 12.5, color: c.textMuted)),
              const SizedBox(height: 6),
              Row(children: [
                if (!r.first)
                  TextButton.icon(
                    style: TextButton.styleFrom(foregroundColor: r.removed ? c.brand : c.textMuted, padding: EdgeInsets.zero),
                    onPressed: editable ? () => _send(v1api.PagesChaptersBody(key: r.key, hidden: !r.removed)) : null,
                    icon: Icon(r.removed ? LucideIcons.undo2 : LucideIcons.x, size: 16),
                    label: Text(r.removed ? l.restore : l.remove),
                  ),
                const Spacer(),
                if (r.movable && editable) ...[
                  _Move(icon: LucideIcons.arrowUpToLine, label: l.toStart, enabled: r.canUp, onTap: () => _send(v1api.PagesChaptersBody(key: r.pageKey, move: 'start'))),
                  _Move(icon: LucideIcons.arrowUp, label: l.up, enabled: r.canUp, onTap: () => _send(v1api.PagesChaptersBody(key: r.pageKey, move: 'up'))),
                  _Move(icon: LucideIcons.arrowDown, label: l.down, enabled: r.canDown, onTap: () => _send(v1api.PagesChaptersBody(key: r.pageKey, move: 'down'))),
                  _Move(icon: LucideIcons.arrowDownToLine, label: l.toEnd, enabled: r.canDown, onTap: () => _send(v1api.PagesChaptersBody(key: r.pageKey, move: 'end'))),
                ],
              ]),
            ]),
          ),
      ]),
    );
  }
}

class _Move extends StatelessWidget {
  const _Move({required this.icon, required this.label, required this.enabled, required this.onTap});
  final IconData icon;
  final String label;
  final bool enabled;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => IconButton(tooltip: label, onPressed: enabled ? onTap : null, icon: Icon(icon, size: 18), visualDensity: VisualDensity.compact);
}

class _Field extends StatefulWidget {
  const _Field({required this.initial, required this.hint, required this.max, required this.enabled, required this.onChanged, required this.onReset, this.reset, this.italic = false});
  final String initial;
  final String hint;
  final int max;
  final bool enabled;
  final bool italic;
  final String? reset;
  final ValueChanged<String> onChanged;
  final VoidCallback onReset;

  @override
  State<_Field> createState() => _FieldState();
}

class _FieldState extends State<_Field> {
  late final _ctl = TextEditingController(text: widget.initial);

  @override
  void didUpdateWidget(_Field old) {
    super.didUpdateWidget(old);
    if (old.initial != widget.initial && widget.initial.isEmpty) _ctl.text = '';
  }

  @override
  void dispose() {
    _ctl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => TextField(
        controller: _ctl,
        enabled: widget.enabled,
        maxLength: widget.max,
        style: TextStyle(fontStyle: widget.italic ? FontStyle.italic : FontStyle.normal),
        onChanged: widget.onChanged,
        decoration: InputDecoration(
          isDense: true,
          hintText: widget.hint,
          counterText: '',
          suffixIcon: widget.reset == null ? null : IconButton(tooltip: widget.reset, icon: const Icon(LucideIcons.rotateCcw, size: 16), onPressed: widget.onReset),
        ),
      );
}

/// ИИ-дизайнер страниц (DesignAiPanel сайта): остаток запросов, режимы, идеи, просьба; правка сохраняется сразу
/// (с «Вернуть как было»), варианты — с разворотом каждого, оценка — с советами «Применить». Пакеты — на сайте.
class AiDesignerView extends StatefulWidget {
  const AiDesignerView({super.key, required this.host, required this.imageUrl, required this.headers});
  final PagesHost host;
  final String Function(String url, int width) imageUrl;
  final Map<String, String> headers;

  @override
  State<AiDesignerView> createState() => _AiDesignerViewState();
}

class _AiDesignerViewState extends State<AiDesignerView> {
  v1api.PagesAiInfo? _info;
  String _mode = 'edit';
  final _prompt = TextEditingController();
  bool _busy = false;
  final _log = <({String prompt, String reply, String? concept, bool changed})>[];
  v1api.PagesAiAnswer? _last;
  final _applied = <int>{};
  int? _picked;

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _prompt.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    final b = widget.host.backend;
    try {
      final i = await b.call(() => b.contract.pagesAiInfo(bookId: widget.host.bookId));
      if (mounted) setState(() => _info = i);
    } on ApiException catch (e) {
      widget.host.error(e.message);
    }
  }

  Future<void> _ask() async {
    final b = widget.host.backend;
    final text = _prompt.text.trim();
    setState(() {
      _busy = true;
      _applied.clear();
      _picked = null;
    });
    try {
      final history = [for (final x in _log.where((x) => x.changed).toList().reversed.take(4).toList().reversed) v1api.PagesAiBodyHistory(prompt: x.prompt, reply: x.reply)];
      final r = await b.call(() => b.contract.pagesAi(bookId: widget.host.bookId, body: v1api.PagesAiBody(mode: _mode, prompt: text, history: _mode == 'edit' || _mode == 'create' ? history : const [])));
      if (!mounted) return;
      setState(() {
        _info = r.info;
        _last = r;
        if (r.mode == 'edit' || r.mode == 'create') _log.add((prompt: text, reply: r.reply.isEmpty ? (r.changed == true ? '' : r.info.labels.noChange) : r.reply, concept: r.concept, changed: r.changed == true));
        _prompt.clear();
      });
      // Правка уже в книге — сцена перечитывает модель, «Отменить» вернёт прежнее.
      if (r.changed == true) await _reload(r.before);
    } on ApiException catch (e) {
      widget.host.error(e.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  /// Модель экрана после правки ИИ: «Отменить» помнит оформление до неё.
  Future<void> _reload(v1api.PagesAiPatch before) async {
    final b = widget.host.backend;
    final v = await b.call(() => b.contract.pagesGet(bookId: widget.host.bookId));
    widget.host.commit(v, spread: 'chapter');
  }

  Future<void> _applyPatch(v1api.PagesAiPatch p) async {
    final b = widget.host.backend;
    try {
      final v = await b.call(() => b.contract.pagesUpdate(bookId: widget.host.bookId, body: v1api.PagesPatch(interior: p.interior, styleJson: p.styleJson)));
      widget.host.commit(v, spread: 'chapter');
    } on ApiException catch (e) {
      widget.host.error(e.message);
    }
  }

  @override
  Widget build(BuildContext context) {
    final c = context.c;
    final i = _info;
    if (i == null) return const Padding(padding: EdgeInsets.all(24), child: Center(child: CircularProgressIndicator()));
    final l = i.labels;
    final mode = l.modes.firstWhere((m) => m.id == _mode);
    final ideas = switch (_mode) { 'create' => i.ideas.create, 'variants' => i.ideas.variants, 'review' => i.ideas.review, _ => i.ideas.edit };
    final last = _last;
    final canSend = !_busy && !i.out && widget.host.view.editable && (_mode != 'edit' || _prompt.text.trim().length >= 2);
    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      Row(children: [Icon(LucideIcons.sparkles, size: 16, color: c.brand), const SizedBox(width: 8), Text(l.title, style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w600))]),
      const SizedBox(height: 4),
      Text(l.lead, style: TextStyle(fontSize: 13.5, height: 1.45, color: c.textMuted)),
      const SizedBox(height: 12),
      Wrap(spacing: 8, crossAxisAlignment: WrapCrossAlignment.center, children: [
        Text(l.left, style: TextStyle(fontSize: 13.5, fontWeight: FontWeight.w600, color: i.remaining > 1 ? c.success : (i.remaining == 1 ? c.warn : c.textMuted))),
        if (l.credits != null) Text(l.credits!, style: TextStyle(fontSize: 12.5, color: c.brand)),
      ]),
      if (i.out) ...[
        const SizedBox(height: 10),
        Container(
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(color: c.surface, borderRadius: BorderRadius.circular(14)),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(l.outTitle, style: const TextStyle(fontWeight: FontWeight.w600)),
            const SizedBox(height: 4),
            Text(l.outText, style: TextStyle(fontSize: 13.5, color: c.text.withValues(alpha: 0.8))),
            for (final p in l.perks) Padding(padding: const EdgeInsets.only(top: 4), child: Text('· $p', style: TextStyle(fontSize: 13, color: c.textMuted))),
          ]),
        ),
      ] else ...[
        const SizedBox(height: 12),
        Wrap(spacing: 6, runSpacing: 6, children: [
          for (final m in l.modes) StudioChip(label: m.label, on: m.id == _mode, onTap: () => setState(() => _mode = m.id)),
        ]),
        const SizedBox(height: 6),
        Text(mode.hint, style: TextStyle(fontSize: 12.5, height: 1.4, color: c.textMuted)),
        const SizedBox(height: 10),
        TextField(controller: _prompt, minLines: _mode == 'review' ? 2 : 3, maxLines: 6, maxLength: 500, onChanged: (_) => setState(() {}), decoration: InputDecoration(hintText: mode.placeholder, counterText: '')),
        const SizedBox(height: 8),
        Text(l.examplesLabel, style: TextStyle(fontSize: 12, color: c.textMuted)),
        const SizedBox(height: 6),
        Wrap(spacing: 6, runSpacing: 6, children: [
          for (final idea in ideas) StudioChip(label: idea, on: false, onTap: () => setState(() => _prompt.text = idea)),
        ]),
        if (l.notice != null) Padding(padding: const EdgeInsets.only(top: 10), child: Text(l.notice!, style: TextStyle(fontSize: 12.5, color: c.warn))),
        const SizedBox(height: 12),
        CabinetButton(label: _busy ? mode.thinking : mode.send, icon: LucideIcons.sparkles, busy: _busy, large: false, onPressed: canSend ? _ask : null),
        const SizedBox(height: 6),
        Text(l.freeNote, style: TextStyle(fontSize: 12, color: c.textMuted)),
      ],
      // Разговор: просьбы и ответы (правка, «с нуля»), «Вернуть как было».
      if ((_mode == 'edit' || _mode == 'create') && _log.isNotEmpty) ...[
        const SizedBox(height: 16),
        for (final x in _log)
          Container(
            margin: const EdgeInsets.only(bottom: 8),
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(color: c.surface, borderRadius: BorderRadius.circular(12)),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              if (x.prompt.isNotEmpty) Text(x.prompt, style: const TextStyle(fontWeight: FontWeight.w500)),
              if (x.reply.isNotEmpty) Padding(padding: const EdgeInsets.only(top: 4), child: Text(x.reply, style: TextStyle(fontSize: 13.5, color: c.text.withValues(alpha: 0.85)))),
              if (x.concept != null) Padding(padding: const EdgeInsets.only(top: 4), child: Text('${l.concept}: ${x.concept}', style: TextStyle(fontSize: 13, color: c.textMuted))),
            ]),
          ),
        if (last != null && last.changed == true)
          Align(
            alignment: Alignment.centerLeft,
            child: TextButton.icon(onPressed: () => _applyPatch(last.before), icon: const Icon(LucideIcons.undo2, size: 16), label: Text(l.undo)),
          ),
      ],
      if (_mode == 'variants' && last?.variants != null) ...[
        const SizedBox(height: 16),
        Text(l.variantsTitle, style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w600)),
        if (last!.reply.isNotEmpty) Padding(padding: const EdgeInsets.only(top: 4), child: Text(last.reply, style: TextStyle(fontSize: 13, color: c.textMuted))),
        if (last.variants!.isEmpty) Padding(padding: const EdgeInsets.only(top: 8), child: Text(l.noVariants, style: TextStyle(fontSize: 13, color: c.textMuted))),
        for (var n = 0; n < last.variants!.length; n++) ...[
          const SizedBox(height: 12),
          ClipRRect(
            borderRadius: BorderRadius.circular(4),
            child: AspectRatio(
              aspectRatio: widget.host.view.spreadAspect,
              child: Image.network(widget.imageUrl(last.variants![n].imageUrl, widget.host.view.imageWidths.last), headers: widget.headers, fit: BoxFit.cover, errorBuilder: (_, _, _) => ColoredBox(color: c.surface), loadingBuilder: (_, child, p) => p == null ? child : ColoredBox(color: c.surface, child: const Center(child: CircularProgressIndicator(strokeWidth: 2)))),
            ),
          ),
          const SizedBox(height: 8),
          Row(children: [
            Expanded(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text(last.variants![n].name, style: AppText.serif(context, size: 18, weight: FontWeight.w500)),
                Text(last.variants![n].idea, style: TextStyle(fontSize: 12.5, color: c.textMuted)),
              ]),
            ),
            const SizedBox(width: 10),
            OutlinedButton(
              onPressed: _picked == n
                  ? null
                  : () async {
                      await _applyPatch(last.variants![n].patch);
                      if (mounted) setState(() => _picked = n);
                    },
              child: Text(_picked == n ? l.picked : l.pick),
            ),
          ]),
        ],
        if (_picked != null) Align(alignment: Alignment.centerLeft, child: TextButton.icon(onPressed: () => _applyPatch(last.before).then((_) => setState(() => _picked = null)), icon: const Icon(LucideIcons.undo2, size: 16), label: Text(l.undo))),
      ],
      if (_mode == 'review' && last?.score != null) ...[
        const SizedBox(height: 16),
        Container(
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(14), border: Border.all(color: c.border)),
          child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            Row(children: [
              Text(l.scoreLabel, style: const TextStyle(fontWeight: FontWeight.w600)),
              const Spacer(),
              Text(last!.scoreText ?? '', style: AppText.serif(context, size: 22, weight: FontWeight.w500).copyWith(color: c.brand)),
            ]),
            if ((last.summary ?? '').isNotEmpty) Padding(padding: const EdgeInsets.only(top: 6), child: Text(last.summary!, style: TextStyle(fontSize: 13.5, color: c.text.withValues(alpha: 0.85)))),
            if ((last.strengths ?? const []).isNotEmpty) ...[
              const SizedBox(height: 10),
              Text(l.strengths, style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600)),
              for (final s in last.strengths!) Padding(padding: const EdgeInsets.only(top: 3), child: Text('· $s', style: TextStyle(fontSize: 13, color: c.text.withValues(alpha: 0.8)))),
            ],
            if ((last.tips ?? const []).isNotEmpty) ...[
              const SizedBox(height: 10),
              Text(l.tips, style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600)),
              for (var n = 0; n < last.tips!.length; n++)
                Padding(
                  padding: const EdgeInsets.only(top: 8),
                  child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Expanded(
                      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                        Text(last.tips![n].title, style: const TextStyle(fontSize: 13.5, fontWeight: FontWeight.w500)),
                        Text(last.tips![n].why, style: TextStyle(fontSize: 12.5, color: c.textMuted)),
                      ]),
                    ),
                    if (last.tips![n].patch != null)
                      TextButton(
                        onPressed: _applied.contains(n)
                            ? null
                            : () async {
                                await _applyPatch(last.tips![n].patch!);
                                if (mounted) setState(() => _applied.add(n));
                              },
                        child: Text(_applied.contains(n) ? l.applied : l.apply),
                      ),
                  ]),
                ),
            ],
          ]),
        ),
      ],
    ]);
  }
}
