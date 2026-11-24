import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:provider/provider.dart';

import '../../api/mybook_api.g.dart' as v1api;
import '../../core/api.dart';
import '../../ui/kit.dart';
import '../../ui/tokens.dart';
import '../data/session.dart';
import '../ui/cabinet.dart';

/// Мастер новой книги — как /books/new сайта (NewBookWizard): шаг 1 — какую книгу пишете (подарок; о себе или своя),
/// шаг 2 — кто пишет и для кого (у автобиографии — чья история, рассказчик, кто записывает, посвящение), шаг 3 —
/// название (варианты темы на языке книги), первая глава своей книги, язык книги и повод с подсказкой срока.
/// Виды книг, поводы, надписи и длины полей — с сервера (API v1 bookWizard); создание — bookCreate.
/// Возвращает id новой книги.
class NewBookScreen extends StatefulWidget {
  const NewBookScreen({super.key});

  @override
  State<NewBookScreen> createState() => _NewBookScreenState();
}

class _NewBookScreenState extends State<NewBookScreen> {
  late final ClientSession _session = context.read<ClientSession>();
  v1api.BookWizard? _w;
  String? _error;
  int _step = 0;
  v1api.WizardTheme? _theme;
  String _language = 'ru';
  bool _storyOther = false;
  String _authorGender = 'f';
  String _recipientGender = 'f';
  String? _occasion;
  String? _date;
  String? _deadline;
  bool _sending = false;
  Set<String> _errors = {};

  final _author = TextEditingController();
  final _narrator = TextEditingController();
  final _recipient = TextEditingController();
  final _recordedBy = TextEditingController();
  final _dedication = TextEditingController();
  final _title = TextEditingController();
  final _firstChapter = TextEditingController();

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    for (final c in [_author, _narrator, _recipient, _recordedBy, _dedication, _title, _firstChapter]) {
      c.dispose();
    }
    super.dispose();
  }

  Future<void> _load() async {
    try {
      final w = await _session.backend.wizard();
      if (!mounted) return;
      setState(() {
        _w = w;
        _error = null;
        _language = w.defaultLanguage;
      });
      _author.text = w.defaultAuthor;
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    }
  }

  v1api.WizardThemePerLanguage? _lang(v1api.WizardTheme t, String l) {
    for (final x in t.perLanguage) {
      if (x.language == l) return x;
    }
    return null;
  }

  List<String> _suggestions(v1api.WizardTheme t, [String? l]) => _lang(t, l ?? _language)?.titles ?? const [];

  void _pick(v1api.WizardTheme t) {
    // Название — первый вариант новой темы, если поле пустое или в нём вариант прежней (своё название не трогаем).
    final before = _theme == null ? const <String>[] : _suggestions(_theme!);
    final keep = _title.text.isNotEmpty && !before.contains(_title.text);
    setState(() {
      _theme = t;
      _step = 1;
      _errors = {};
      _recipientGender = t.recipientGender ?? t.defaultRecipientGender;
      _occasion = null;
      _date = null;
      _deadline = null;
    });
    final s = _suggestions(t);
    if (!keep) _title.text = s.isEmpty ? '' : s.first;
  }

  /// Смена языка книги: выбранный вариант названия переводится (как на сайте), своё название остаётся.
  void _setLanguage(String l) {
    final t = _theme;
    if (t != null) {
      final before = _suggestions(t);
      final i = before.indexOf(_title.text);
      final after = _suggestions(t, l);
      if ((_title.text.isEmpty || i >= 0) && after.isNotEmpty) _title.text = after[i < 0 ? 0 : i.clamp(0, after.length - 1)];
    }
    setState(() => _language = l);
  }

  bool get _asNarrator => _theme?.kind == 'autobiography' && _storyOther;
  String get _effectiveAuthor => (_asNarrator ? _narrator : _author).text.trim();

  Set<String> _missing(int step) {
    final t = _theme!;
    final out = <String>{};
    if (step == 1) {
      if (_effectiveAuthor.isEmpty) out.add('authorName');
      if (t.recipient == 'required' && _recipient.text.trim().isEmpty) out.add('recipientName');
    }
    if (step == 2 && t.kind == 'blank' && _title.text.trim().isEmpty) out.add('title');
    return out;
  }

  void _next() {
    final bad = _missing(1);
    setState(() => _errors = bad);
    if (bad.isEmpty) setState(() => _step = 2);
  }

  Future<void> _pickDate() async {
    final now = DateTime.now();
    final initial = _date != null ? DateTime.parse(_date!) : now.add(const Duration(days: 30));
    final d = await showDatePicker(context: context, initialDate: initial.isBefore(now) ? now : initial, firstDate: now, lastDate: DateTime(now.year + 3));
    if (d == null) return;
    final iso = '${d.year.toString().padLeft(4, '0')}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';
    setState(() => _date = iso);
    _loadDeadline();
  }

  Future<void> _loadDeadline() async {
    final o = _occasion, d = _date;
    if (o == null || d == null) {
      setState(() => _deadline = null);
      return;
    }
    try {
      final text = await _session.backend.wizardDeadline(o, d);
      if (mounted && _occasion == o && _date == d) setState(() => _deadline = text);
    } on ApiException catch (_) {}
  }

  Future<void> _submit() async {
    final t = _theme!;
    final bad = {..._missing(1), ..._missing(2)};
    if (bad.isNotEmpty) {
      setState(() {
        _errors = bad;
        if (bad.contains('authorName') || bad.contains('recipientName')) _step = 1;
      });
      return;
    }
    setState(() => _sending = true);
    String? opt(TextEditingController c) => c.text.trim().isEmpty ? null : c.text.trim();
    try {
      final id = await _session.backend.createBook(v1api.CreateBookBody(
        theme: t.id,
        language: _language,
        authorName: _effectiveAuthor,
        authorGender: _authorGender,
        recipientName: t.recipient == 'none' ? null : opt(_recipient),
        recipientGender: t.recipient == 'none' ? null : _recipientGender,
        recordedBy: _asNarrator ? opt(_recordedBy) : null,
        dedication: t.kind == 'autobiography' ? opt(_dedication) : null,
        firstChapterTitle: t.kind == 'blank' ? opt(_firstChapter) : null,
        title: opt(_title),
        occasion: _occasion,
        occasionDate: _occasion == null ? null : _date,
      ));
      if (mounted) Navigator.of(context).pop(id);
    } on ApiException catch (e) {
      if (mounted) {
        setState(() => _sending = false);
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final c = context.c;
    final w = _w;
    return Scaffold(
      backgroundColor: c.bg,
      appBar: AppBar(
        backgroundColor: c.bg,
        surfaceTintColor: Colors.transparent,
        leading: IconButton(
          icon: const Icon(LucideIcons.chevronLeft),
          onPressed: () => _step > 0 ? setState(() => _step = _step == 2 ? 1 : 0) : Navigator.of(context).maybePop(),
        ),
      ),
      body: w == null
          ? (_error == null
              ? const Center(child: CircularProgressIndicator())
              : EmptyState(icon: LucideIcons.wifiOff, title: _error!, action: 'Повторить', onAction: _load))
          : GestureDetector(
              onTap: () => FocusScope.of(context).unfocus(),
              child: ListView(
                padding: const EdgeInsets.fromLTRB(16, 4, 16, 40),
                keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
                children: [
                  _Stepper(labels: w.labels.steps, step: _step),
                  const SizedBox(height: 22),
                  if (_step == 0) ..._catalog(w) else ..._form(w),
                ],
              ),
            ),
    );
  }

  List<Widget> _catalog(v1api.BookWizard w) {
    final c = context.c;
    final l = w.labels;
    Widget grid(List<v1api.WizardTheme> list) => LayoutBuilder(builder: (context, box) {
          const gap = 16.0;
          final cols = box.maxWidth > 560 ? 3 : 2;
          final width = (box.maxWidth - gap * (cols - 1)) / cols;
          return Wrap(spacing: gap, runSpacing: 26, children: [
            for (final t in list) SizedBox(width: width, child: _ThemeCard(t: t, selected: _theme?.id == t.id, onTap: () => _pick(t))),
          ]);
        });
    final gifts = w.themes.where((t) => t.group == 'gift').toList();
    final own = w.themes.where((t) => t.group == 'own').toList();
    return [
      Text(l.whoTitle, style: AppText.serif(context, size: 34, weight: FontWeight.w500).copyWith(height: 1.1)),
      const SizedBox(height: 10),
      Text(l.whoText, style: TextStyle(fontSize: 16, height: 1.45, color: c.textMuted)),
      const SizedBox(height: 28),
      Text(l.groups.gift, style: AppText.serif(context, size: 24, weight: FontWeight.w500)),
      const SizedBox(height: 14),
      grid(gifts),
      if (own.isNotEmpty) ...[
        const SizedBox(height: 36),
        Text(l.groups.own, style: AppText.serif(context, size: 24, weight: FontWeight.w500)),
        const SizedBox(height: 14),
        grid(own),
      ],
    ];
  }

  List<Widget> _form(v1api.BookWizard w) {
    final c = context.c;
    final t = _theme!;
    final l = w.labels;
    final max = w.limits;
    final blank = t.kind == 'blank';
    final heading = _step == 1 ? (blank ? l.stepTitles.namesBlank : l.stepTitles.names) : l.stepTitles.title;
    final text = _step == 2 ? l.titleText : (blank ? l.detailsTextBlank : l.detailsText);
    String? err(String id, String msg) => _errors.contains(id) ? msg : null;

    final preview = Row(children: [
      ClipRRect(
        borderRadius: BorderRadius.circular(2),
        child: SizedBox(width: 54, height: 77, child: CoverArt(url: t.coverUrl)),
      ),
      const SizedBox(width: 14),
      Expanded(
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(_title.text.isEmpty ? l.bookTitle : _title.text, maxLines: 2, overflow: TextOverflow.ellipsis, style: AppText.serif(context, size: 19, weight: FontWeight.w500)),
          Text(t.name, style: TextStyle(fontSize: 13, color: c.textMuted)),
          Text(l.coverNote, style: TextStyle(fontSize: 12, color: c.textFaint)),
        ]),
      ),
    ]);

    final step1 = <Widget>[
      if (t.kind == 'autobiography') ...[
        _Label(l.story.title),
        _Choice(value: _storyOther ? 'other' : 'own', options: [('own', l.story.own), ('other', l.story.other)], onChanged: (v) => setState(() => _storyOther = v == 'other')),
        const SizedBox(height: 18),
      ],
      _Label(_asNarrator ? l.story.narratorName : (blank ? l.blank.authorName : l.authorName)),
      _Input(controller: _asNarrator ? _narrator : _author, max: max.authorName, hint: _asNarrator ? l.story.narratorNamePlaceholder : null, error: err('authorName', l.errors.authorName), onChanged: (_) => setState(() {})),
      if (!blank) ...[
        const SizedBox(height: 18),
        _Label(_asNarrator ? l.story.narratorAs : l.authorAs),
        _Choice(value: _authorGender, options: [('m', l.genders.author[0]), ('f', l.genders.author[1])], onChanged: (v) => setState(() => _authorGender = v)),
      ],
      if (t.recipient != 'none') ...[
        const SizedBox(height: 18),
        _Label(t.recipientLabel ?? '', optional: t.recipient == 'optional' ? l.optional : null),
        _Input(controller: _recipient, max: max.recipientName, hint: t.recipientPlaceholder, error: err('recipientName', l.errors.recipientName)),
        if (t.recipientGenderChoice) ...[
          const SizedBox(height: 18),
          _Label(l.recipientFor),
          _Choice(value: _recipientGender, options: [('m', l.genders.recipient[0]), ('f', l.genders.recipient[1])], onChanged: (v) => setState(() => _recipientGender = v)),
        ],
      ],
      if (t.kind == 'autobiography') ...[
        if (_storyOther) ...[
          const SizedBox(height: 18),
          _Label(l.story.recordedBy, optional: l.optional),
          _Input(controller: _recordedBy, max: max.recordedBy, hint: l.story.recordedByPlaceholder),
          _Hint(l.story.recordedByHint),
        ],
        const SizedBox(height: 18),
        _Label(l.story.dedication, optional: l.optional),
        _Input(controller: _dedication, max: max.dedication, hint: l.story.dedicationPlaceholder),
        _Hint(l.story.dedicationHint),
      ],
    ];

    final suggestions = _suggestions(t);
    final step2 = <Widget>[
      _Label(l.bookTitle),
      _Input(controller: _title, max: max.title, error: err('title', l.errors.title), onChanged: (_) => setState(() {})),
      if (blank) _Hint(l.blank.titleHint),
      if (suggestions.isNotEmpty) ...[
        const SizedBox(height: 10),
        Wrap(spacing: 8, runSpacing: 8, children: [
          for (final s in suggestions) _Pill(label: s, on: _title.text == s, onTap: () => setState(() => _title.text = s)),
        ]),
      ],
      if (blank) ...[
        const SizedBox(height: 18),
        _Label(l.blank.firstChapter, optional: l.optional),
        _Input(controller: _firstChapter, max: max.firstChapterTitle, hint: _lang(t, _language)?.firstChapter),
        _Hint(l.blank.firstChapterHint),
      ],
      const SizedBox(height: 18),
      _Label(l.language),
      _Choice(value: _language, options: [for (final x in w.languages) (x.id, x.label)], onChanged: _setLanguage),
      _Hint(blank ? l.languageHintBlank : l.languageHint),
      const SizedBox(height: 18),
      _Label(l.occasion, optional: l.optional),
      _Hint(l.occasionHint),
      const SizedBox(height: 8),
      Wrap(spacing: 8, runSpacing: 8, children: [
        for (final o in t.occasions)
          _Pill(
            label: o.label,
            on: _occasion == o.id,
            onTap: () {
              setState(() {
                if (_occasion == o.id) {
                  _occasion = null;
                  _date = null;
                } else {
                  _occasion = o.id;
                  _date = o.date ?? _date;
                }
              });
              _loadDeadline();
            },
          ),
      ]),
      if (_occasion != null) ...[
        const SizedBox(height: 12),
        Container(
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(color: c.surface, borderRadius: BorderRadius.circular(Cab.panel)),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            InkWell(
              onTap: _pickDate,
              child: Row(children: [
                Icon(LucideIcons.calendarHeart, size: 20, color: c.brand),
                const SizedBox(width: 10),
                Text(l.occasionDate, style: const TextStyle(fontSize: 14)),
                const SizedBox(width: 10),
                Text(_date == null ? '—' : MaterialLocalizations.of(context).formatMediumDate(DateTime.parse(_date!)), style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: c.brand)),
              ]),
            ),
            const SizedBox(height: 8),
            Text(_date == null ? l.occasionPickDate : (_deadline ?? ''), style: TextStyle(fontSize: 13.5, height: 1.4, color: c.textMuted)),
          ]),
        ),
      ],
    ];

    return [
      preview,
      const SizedBox(height: 22),
      Text(l.stepOf[_step], style: TextStyle(fontSize: 13, color: c.textMuted)),
      const SizedBox(height: 4),
      Text(heading, style: AppText.serif(context, size: 32, weight: FontWeight.w500).copyWith(height: 1.1)),
      const SizedBox(height: 8),
      Text(text, style: TextStyle(fontSize: 15, height: 1.45, color: c.textMuted)),
      const SizedBox(height: 22),
      ...(_step == 1 ? step1 : step2),
      const SizedBox(height: 28),
      Row(children: [
        Expanded(
          child: CabinetButton(
            label: _step == 1 ? l.back : l.prev,
            kind: CabBtn.outline,
            large: false,
            onPressed: _sending ? null : () => setState(() => _step = _step == 2 ? 1 : 0),
          ),
        ),
        const SizedBox(width: 10),
        Expanded(
          child: CabinetButton(
            label: _step == 1 ? l.next : (_sending ? l.pending : l.submit),
            large: false,
            busy: _sending,
            onPressed: _sending ? null : (_step == 1 ? _next : _submit),
          ),
        ),
      ]),
    ];
  }
}

class _Stepper extends StatelessWidget {
  const _Stepper({required this.labels, required this.step});
  final List<String> labels;
  final int step;

  @override
  Widget build(BuildContext context) {
    final c = context.c;
    return Row(children: [
      for (var i = 0; i < labels.length; i++) ...[
        Container(
          width: 26,
          height: 26,
          alignment: Alignment.center,
          decoration: BoxDecoration(shape: BoxShape.circle, color: i <= step ? c.brand : Colors.transparent, border: Border.all(color: i <= step ? c.brand : c.border)),
          child: i < step
              ? const Icon(LucideIcons.check, size: 14, color: Colors.white)
              : Text('${i + 1}', style: TextStyle(fontSize: 12.5, fontWeight: FontWeight.w600, color: i == step ? Colors.white : c.textMuted)),
        ),
        if (i == step) ...[const SizedBox(width: 8), Text(labels[i], style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w500))],
        if (i < labels.length - 1)
          Expanded(child: Container(height: 2, margin: const EdgeInsets.symmetric(horizontal: 8), color: i < step ? c.brand : c.border)),
      ],
    ]);
  }
}

class _ThemeCard extends StatelessWidget {
  const _ThemeCard({required this.t, required this.selected, required this.onTap});
  final v1api.WizardTheme t;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final c = context.c;
    return GestureDetector(
      onTap: onTap,
      behavior: HitTestBehavior.opaque,
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        AspectRatio(
          aspectRatio: 1 / 1.43,
          child: Container(
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(3),
              border: selected ? Border.all(color: c.brand, width: 2) : null,
              boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.16), blurRadius: 10, offset: const Offset(0, 4))],
            ),
            clipBehavior: Clip.antiAlias,
            child: CoverArt(url: t.coverUrl),
          ),
        ),
        const SizedBox(height: 10),
        Text(t.name, style: AppText.serif(context, size: 18, weight: FontWeight.w500).copyWith(height: 1.15)),
        const SizedBox(height: 3),
        Text(t.questionsLabel, style: TextStyle(fontSize: 12.5, color: c.textMuted)),
      ]),
    );
  }
}

class _Label extends StatelessWidget {
  const _Label(this.text, {this.optional});
  final String text;
  final String? optional;

  @override
  Widget build(BuildContext context) {
    final c = context.c;
    return Padding(
      padding: const EdgeInsets.only(bottom: 6),
      child: Text.rich(TextSpan(children: [
        TextSpan(text: text, style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w600)),
        if (optional != null) TextSpan(text: ' $optional', style: TextStyle(fontSize: 14, color: c.textMuted)),
      ])),
    );
  }
}

class _Hint extends StatelessWidget {
  const _Hint(this.text);
  final String text;

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.only(top: 6),
        child: Text(text, style: TextStyle(fontSize: 12.5, height: 1.4, color: context.c.textMuted)),
      );
}

class _Input extends StatelessWidget {
  const _Input({required this.controller, required this.max, this.hint, this.error, this.onChanged});
  final TextEditingController controller;
  final int max;
  final String? hint;
  final String? error;
  final ValueChanged<String>? onChanged;

  @override
  Widget build(BuildContext context) => TextField(
        controller: controller,
        maxLength: max,
        textCapitalization: TextCapitalization.words,
        decoration: InputDecoration(hintText: hint, errorText: error, counterText: ''),
        onChanged: onChanged,
      );
}

/// Выбор из нескольких — сегменты, как Choice сайта.
class _Choice extends StatelessWidget {
  const _Choice({required this.value, required this.options, required this.onChanged});
  final String value;
  final List<(String, String)> options;
  final ValueChanged<String> onChanged;

  @override
  Widget build(BuildContext context) {
    final c = context.c;
    return Container(
      padding: const EdgeInsets.all(4),
      decoration: BoxDecoration(color: c.surface, borderRadius: BorderRadius.circular(Cab.panel)),
      child: Row(children: [
        for (final o in options)
          Expanded(
            child: GestureDetector(
              onTap: () => onChanged(o.$1),
              child: AnimatedContainer(
                duration: const Duration(milliseconds: 160),
                padding: const EdgeInsets.symmetric(vertical: 10, horizontal: 6),
                decoration: BoxDecoration(
                  color: value == o.$1 ? c.surfaceRaised : Colors.transparent,
                  borderRadius: BorderRadius.circular(Cab.ctl),
                  boxShadow: value == o.$1 ? [BoxShadow(color: Colors.black.withValues(alpha: 0.06), blurRadius: 4)] : null,
                ),
                child: Text(o.$2, textAlign: TextAlign.center, style: TextStyle(fontSize: 14, fontWeight: FontWeight.w500, color: value == o.$1 ? c.text : c.textMuted)),
              ),
            ),
          ),
      ]),
    );
  }
}

class _Pill extends StatelessWidget {
  const _Pill({required this.label, required this.on, required this.onTap});
  final String label;
  final bool on;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final c = context.c;
    return Material(
      color: on ? c.bubbleOut : c.surfaceRaised,
      shape: StadiumBorder(side: BorderSide(color: on ? c.brand : c.border)),
      child: InkWell(
        customBorder: const StadiumBorder(),
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 13, vertical: 8),
          child: Text(label, style: TextStyle(fontSize: 13.5, fontWeight: FontWeight.w500, color: on ? c.brand : c.text)),
        ),
      ),
    );
  }
}
