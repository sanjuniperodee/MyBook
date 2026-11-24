import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_svg/flutter_svg.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:provider/provider.dart';

import '../../api/mybook_api.g.dart' as v1api;
import '../../core/api.dart';
import '../../ui/kit.dart';
import '../../ui/tokens.dart';
import '../data/session.dart';
import '../ui/book_chrome.dart';
import '../ui/cabinet.dart';

/// Обложка — как на сайте (/books/[id]/cover), режим «Шаблон»: лицо — «Дизайн» (настроение, обложки крупно, выбранная
/// первой с «На обложке»), «Фото» (места шаблона), «Текст» (название, подзаголовок, имена, получатель, линии); оборот —
/// «Вариант» (цитата, письмо, фото…), текст и фото. На сцене — лицевая крышка картинкой той же вёрстки, что в печати:
/// после правки сервер отдаёт новый адрес, картинка меняется без мигания. Обложка из конструктора правится на сайте.
class CoverScreen extends StatefulWidget {
  const CoverScreen({super.key, required this.hub});
  final v1api.CabinetBook hub;

  @override
  State<CoverScreen> createState() => _CoverScreenState();
}

const _moods = ['all', 'romance', 'tender', 'classic', 'bright', 'photo'];
const _moodNames = {'all': 'Все', 'romance': 'Романтика', 'tender': 'Нежные', 'classic': 'Классика', 'bright': 'Яркие', 'photo': 'С фото'};
const _designsShown = 12;

/// Варианты оборота (lib/book/cover-back.ts) и сколько фото у каждого.
const _backLayouts = ['quote', 'letter', 'photo', 'fullPhoto', 'polaroids', 'minimal'];
const _backSlots = {'photo': 1, 'fullPhoto': 1, 'polaroids': 3};
const _backNames = {
  'quote': ('Цитата', 'Фраза в центре'),
  'letter': ('Письмо', 'Несколько строк с подписью'),
  'photo': ('Фото', 'Снимок с подписью'),
  'fullPhoto': ('Фото во всю', 'Снимок на всю крышку, текст поверх'),
  'polaroids': ('Полароиды', 'Два-три снимка внахлёст'),
  'minimal': ('Лаконично', 'Имена и год'),
};
const _backLabel = {'quote': 'Цитата', 'letter': 'Текст письма', 'photo': 'Подпись к фото', 'fullPhoto': 'Текст поверх фото', 'polaroids': 'Подпись под снимками'};
const _backPlaceholder = {
  'quote': 'Фраза, которая о вас двоих',
  'letter': 'Пара строк от вас — их прочитают первыми, когда перевернут книгу',
  'photo': 'Например: «Наше первое лето. Алматы, 2022»',
  'fullPhoto': 'Фраза на фоне вашего снимка — или оставьте пустым, будут имена и год',
  'polaroids': 'Например: «Наши лучшие дни — 2019–2026»',
};

String _variants(int n) {
  final m10 = n % 10, m100 = n % 100;
  final w = m10 == 1 && m100 != 11 ? 'вариант' : (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14) ? 'варианта' : 'вариантов');
  return '$n $w';
}

class _CoverScreenState extends State<CoverScreen> {
  late final ClientSession _session = context.read<ClientSession>();
  v1api.CoverView? _view;
  v1api.CabinetPhotos? _photos;
  String? _error;
  bool _back = false;
  String _tab = 'designs';
  String _mood = 'all';
  bool _allDesigns = false;
  int _slot = 0;
  int _saving = 0;
  String? _saveError;

  /// Фото оборота по порядку: ответ сервера знает только первое — остальные помним сами, пока экран открыт.
  List<String> _backIds = [];

  final _title = TextEditingController();
  final _subtitle = TextEditingController();
  final _names = TextEditingController();
  final _backText = TextEditingController();
  Timer? _typing;
  v1api.CoverPatch? _pendingText;

  String get _bookId => widget.hub.id;

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _flushText();
    _typing?.cancel();
    _title.dispose();
    _subtitle.dispose();
    _names.dispose();
    _backText.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    try {
      final r = await Future.wait([_session.backend.cover(_bookId), _session.backend.photosTab(_bookId)]);
      if (!mounted) return;
      final v = r[0] as v1api.CoverView;
      setState(() {
        _view = v;
        _photos = r[1] as v1api.CabinetPhotos;
        _error = null;
        _backIds = [if (v.cover.backPhotoId != null) v.cover.backPhotoId!];
      });
      _title.text = v.cover.title;
      _subtitle.text = v.cover.subtitle;
      _names.text = v.cover.namesOnCover;
      _backText.text = v.cover.backText;
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    }
  }

  Future<void> _save(v1api.CoverPatch patch) async {
    setState(() {
      _saving++;
      _saveError = null;
    });
    try {
      final v = await _session.backend.updateCover(_bookId, patch);
      if (mounted) setState(() => _view = v);
    } on ApiException catch (e) {
      if (mounted) setState(() => _saveError = e.message);
    } finally {
      if (mounted) setState(() => _saving--);
    }
  }

  /// Тексты сохраняются, когда автор перестал печатать (как поля сайта), и при уходе с экрана.
  void _text(v1api.CoverPatch patch) {
    final p = _pendingText;
    _pendingText = v1api.CoverPatch(
      title: patch.title ?? p?.title,
      subtitle: patch.subtitle ?? p?.subtitle,
      namesOnCover: patch.namesOnCover ?? p?.namesOnCover,
      backText: patch.backText ?? p?.backText,
    );
    _typing?.cancel();
    _typing = Timer(const Duration(milliseconds: 900), _flushText);
  }

  void _flushText() {
    _typing?.cancel();
    final p = _pendingText;
    _pendingText = null;
    if (p == null) return;
    if (mounted) {
      _save(p);
    } else {
      _session.backend.updateCover(_bookId, p).ignore();
    }
  }

  v1api.CoverTemplate? _template(String id) {
    for (final t in _view?.templates ?? const <v1api.CoverTemplate>[]) {
      if (t.id == id) return t;
    }
    return null;
  }

  /// Какие фото книги подставлять в пустые места (как cover-fill.ts сайта): сначала без выбранного места, потом
  /// остальные; фото в ответе и фото главы — никогда, иначе снимок повторится.
  List<String> _fillOrder() {
    final free = <String>[], rest = <String>[];
    for (final p in _photos?.photos ?? const <v1api.CabPhoto>[]) {
      final k = p.place.kind;
      if (k == 'answer' || k == 'opener') continue;
      if (p.place.auto || k == 'off') {
        free.add(p.id);
      } else {
        rest.add(p.id);
      }
    }
    return [...free, ...rest];
  }

  Future<void> _choose(v1api.CoverTemplate t) async {
    final cover = _view!.cover;
    final ids = [...cover.photoIds];
    final patch = <String, Object?>{};
    // Шаблону с фото — сразу снимки книги в пустые места, как на сайте.
    if (t.photoSlots > 0) {
      final have = ids.whereType<String>().toList();
      final fill = [...have, ..._fillOrder().where((id) => !have.contains(id))].take(t.photoSlots).toList();
      if (fill.join() != have.take(t.photoSlots).join()) {
        patch['photo'] = fill.isEmpty ? null : fill.first;
        patch['extra'] = fill.skip(1).toList();
      }
    }
    await _save(v1api.CoverPatch(
      coverTemplate: t.id,
      coverPhotoId: patch.containsKey('photo') ? patch['photo'] as String? : null,
      coverPhotoExtra: patch['extra'] as List<String>?,
      nulls: patch.containsKey('photo') && patch['photo'] == null ? {'coverPhotoId'} : const {},
    ));
  }

  Future<void> _pickCoverPhoto(String id, int slots) async {
    final ids = [..._view!.cover.photoIds];
    while (ids.length < slots) {
      ids.add(null);
    }
    final from = ids.indexOf(id);
    // Фото из другого места меняется с ним местами (как на сайте).
    if (from >= 0) ids[from] = ids[_slot];
    ids[_slot] = id;
    final list = ids.take(slots).toList();
    await _save(v1api.CoverPatch(
      coverPhotoId: list.first,
      coverPhotoExtra: list.skip(1).whereType<String>().toList(),
      nulls: list.first == null ? {'coverPhotoId'} : const {},
    ));
    if (mounted && _slot < slots - 1 && list[_slot + 1] == null) setState(() => _slot++);
  }

  Future<void> _pickBackLayout(String layout) async {
    final need = _backSlots[layout] ?? 0;
    var ids = _backIds;
    // Вариант с фото без выбранных снимков — сразу первые подходящие фото книги.
    if (need > 0 && ids.length < need) {
      ids = [...ids, ..._fillOrder().where((id) => !ids.contains(id))].take(need).toList();
    }
    setState(() => _backIds = ids);
    await _save(v1api.CoverPatch(
      backLayout: layout,
      backPhotoId: ids.isEmpty ? null : ids.first,
      backPhotoExtra: ids.skip(1).toList(),
      nulls: ids.isEmpty ? {'backPhotoId'} : const {},
    ));
  }

  Future<void> _toggleBackPhoto(String id, int need) async {
    var ids = [..._backIds];
    if (ids.contains(id)) {
      ids.remove(id);
    } else if (need == 1) {
      ids = [id];
    } else if (ids.length < need) {
      ids.add(id);
    } else {
      return;
    }
    setState(() => _backIds = ids);
    await _save(v1api.CoverPatch(
      backPhotoId: ids.isEmpty ? null : ids.first,
      backPhotoExtra: ids.skip(1).toList(),
      nulls: ids.isEmpty ? {'backPhotoId'} : const {},
    ));
  }

  void _side(bool back) {
    _flushText();
    setState(() {
      _back = back;
      _tab = back ? 'variant' : 'designs';
    });
  }

  @override
  Widget build(BuildContext context) {
    final c = context.c;
    final h = widget.hub;
    final v = _view;
    return Scaffold(
      backgroundColor: c.bg,
      appBar: BookHeader(bookId: h.id, title: h.title, kind: h.kind, coverUrl: v?.cover.imageUrl != null ? '${v!.cover.imageUrl}&w=240' : h.coverThumbUrl),
      body: v == null
          ? (_error == null
              ? const Center(child: CircularProgressIndicator())
              : EmptyState(icon: LucideIcons.wifiOff, title: 'Обложка не открылась', hint: _error, action: 'Повторить', onAction: _load))
          : _body(v),
    );
  }

  Widget _body(v1api.CoverView v) {
    final c = context.c;
    final cover = v.cover;
    final template = _template(cover.template);
    final slots = template?.photoSlots ?? 0;
    final tabs = _back
        ? const [('variant', 'Вариант')]
        : [const ('designs', 'Дизайн'), if (slots > 0 && !cover.hasDesign) const ('photo', 'Фото'), const ('text', 'Текст')];
    final tab = tabs.any((t) => t.$1 == _tab) ? _tab : tabs.first.$1;
    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 18, 16, 48),
      keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
      children: [
        Row(children: [
          Expanded(child: Text('Обложка', style: AppText.serif(context, size: 30, weight: FontWeight.w500))),
          _SideSwitch(back: _back, onChanged: _side),
        ]),
        const SizedBox(height: 18),
        if (!_back) _stage(cover, template) else _backIntro(),
        const SizedBox(height: 10),
        SizedBox(
          height: 20,
          child: Center(
            child: _saving > 0
                ? Row(mainAxisSize: MainAxisSize.min, children: [
                    const SizedBox(width: 12, height: 12, child: CircularProgressIndicator(strokeWidth: 1.6)),
                    const SizedBox(width: 8),
                    Text('Сохраняем…', style: TextStyle(fontSize: 13, color: c.textMuted)),
                  ])
                : _saveError != null
                    ? Text(_saveError!, style: TextStyle(fontSize: 13, color: c.danger), textAlign: TextAlign.center)
                    : null,
          ),
        ),
        if (!cover.editable) ...[
          const SizedBox(height: 8),
          _Note(icon: LucideIcons.lock, text: 'Книга заказана — обложку уже нельзя менять.'),
        ],
        if (cover.hasDesign && !_back) ...[
          const SizedBox(height: 8),
          _Note(icon: LucideIcons.layers, text: 'Обложка собрана в конструкторе: дизайн, надписи и фото на ней правятся на сайте, в разделе «Обложка» → «Конструктор».'),
        ],
        const SizedBox(height: 14),
        _Tabs(tabs: tabs, value: tab, onChanged: (t) => setState(() => _tab = t)),
        const SizedBox(height: 16),
        AnimatedSwitcher(
          duration: const Duration(milliseconds: 180),
          child: KeyedSubtree(
            key: ValueKey(tab),
            child: switch (tab) {
              'designs' => _designs(v),
              'photo' => _coverPhotos(cover, slots),
              'text' => _texts(cover),
              _ => _variant(cover),
            },
          ),
        ),
      ],
    );
  }

  Widget _stage(v1api.Cover cover, v1api.CoverTemplate? t) {
    final c = context.c;
    return Column(children: [
      Center(child: CoverImage(url: '${cover.imageUrl}&w=480', width: 200)),
      const SizedBox(height: 14),
      if (t != null && !cover.hasDesign) ...[
        Text(t.name, style: AppText.serif(context, size: 21, weight: FontWeight.w500)),
        Text(_moodNames[t.mood] ?? '', style: TextStyle(fontSize: 12.5, color: c.textMuted)),
      ],
    ]);
  }

  Widget _backIntro() {
    final c = context.c;
    return Panel(
      padding: const EdgeInsets.all(16),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text('Задняя сторона', style: AppText.serif(context, size: 21, weight: FontWeight.w600)),
        const SizedBox(height: 4),
        Text('Её видят, когда переворачивают книгу: последние слова, которые остаются в руках.', style: TextStyle(fontSize: 14, height: 1.4, color: c.textMuted)),
      ]),
    );
  }

  Widget _designs(v1api.CoverView v) {
    final c = context.c;
    final cover = v.cover;
    final all = v.templates;
    final moods = _moods.where((m) => m == 'all' || all.any((t) => t.mood == m)).toList();
    var list = all.where((t) => _mood == 'all' || t.mood == _mood || t.id == cover.template).toList();
    // Выбранная — первой и всегда в списке; сначала дюжина, остальные по кнопке.
    list.sort((a, b) => (b.id == cover.template ? 1 : 0) - (a.id == cover.template ? 1 : 0));
    final more = _mood == 'all' && !_allDesigns && list.length > _designsShown;
    if (more) list = list.take(_designsShown).toList();
    final noPhotos = (_photos?.photos ?? const []).isEmpty;
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Text(_variants(all.length), style: TextStyle(fontSize: 12.5, color: c.textMuted, fontFeatures: const [FontFeature.tabularFigures()])),
      const SizedBox(height: 10),
      SingleChildScrollView(
        scrollDirection: Axis.horizontal,
        child: Row(children: [
          for (final m in moods)
            Padding(
              padding: const EdgeInsets.only(right: 6),
              child: _Chip(label: _moodNames[m] ?? m, on: _mood == m, onTap: () => setState(() => _mood = m)),
            ),
        ]),
      ),
      const SizedBox(height: 16),
      LayoutBuilder(builder: (context, box) {
        final cols = box.maxWidth > 560 ? 4 : (box.maxWidth > 380 ? 3 : 2);
        const gap = 14.0;
        final w = (box.maxWidth - gap * (cols - 1)) / cols;
        return Wrap(spacing: gap, runSpacing: 20, children: [
          for (final t in list)
            SizedBox(
              width: w,
              child: _DesignTile(
                t: t,
                on: t.id == cover.template && !cover.hasDesign,
                needsPhoto: t.photoSlots > 0 && noPhotos,
                // Шаблон с фото — с фото этой книги на местах (как миниатюры сайта); адрес меняется вместе с выбором.
                url: t.photoSlots > 0 && !noPhotos
                    ? '/api/books/${_bookId}/cover-thumb/${t.id}?v=${Object.hash(Object.hashAll(cover.photoIds), cover.lines, (_photos?.photos ?? const []).length)}'
                    : t.previewUrl,
                mood: _moodNames[t.mood] ?? '',
                onTap: cover.editable && !cover.hasDesign && t.id != cover.template ? () => _choose(t) : null,
              ),
            ),
        ]);
      }),
      if (more) ...[
        const SizedBox(height: 18),
        CabinetButton(label: 'Показать все обложки (${all.length})', kind: CabBtn.outline, large: false, onPressed: () => setState(() => _allDesigns = true)),
      ],
    ]);
  }

  Widget _coverPhotos(v1api.Cover cover, int slots) {
    final c = context.c;
    final photos = _photos?.photos ?? const <v1api.CabPhoto>[];
    final chosen = [...cover.photoIds];
    while (chosen.length < slots) {
      chosen.add(null);
    }
    final slot = _slot.clamp(0, slots - 1);
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Text(slots > 1 ? 'Фото для обложки — $slots места' : 'Фото для обложки', style: const TextStyle(fontSize: 13.5, fontWeight: FontWeight.w600)),
      if (slots > 1) ...[
        const SizedBox(height: 10),
        Wrap(spacing: 8, runSpacing: 8, children: [
          for (var i = 0; i < slots; i++) _Chip(label: 'Фото ${i + 1}', on: slot == i, onTap: () => setState(() => _slot = i)),
        ]),
        const SizedBox(height: 8),
        Text('Выберите место, затем фото — оно встанет туда. Фото из другого места поменяется с ним местами.', style: TextStyle(fontSize: 13, height: 1.4, color: c.textMuted)),
      ],
      const SizedBox(height: 12),
      if (photos.isEmpty)
        Text('Сначала загрузите фото — во вкладке «Фото» книги.', style: TextStyle(fontSize: 14, color: c.textMuted))
      else
        _PhotoGrid(
          photos: photos,
          badge: (id) {
            final i = chosen.indexOf(id);
            return i < 0 || i >= slots ? null : (slots > 1 ? '${i + 1}' : '');
          },
          onTap: cover.editable ? (p) => _pickCoverPhoto(p.id, slots) : null,
        ),
      const SizedBox(height: 12),
      Text('Фото с обложки внутри книги сами не повторяются. Хотите и на странице — нажмите «Где в книге» во вкладке «Фото».', style: TextStyle(fontSize: 12.5, height: 1.4, color: c.textFaint)),
    ]);
  }

  Widget _texts(v1api.Cover cover) {
    final c = context.c;
    final on = cover.editable && !cover.hasDesign;
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      _Field(label: 'Название книги', controller: _title, max: 80, enabled: on, onChanged: (s) => _text(v1api.CoverPatch(title: s))),
      const SizedBox(height: 16),
      _Field(label: 'Подзаголовок', hint: 'Например, «Четыре года вместе»', controller: _subtitle, max: 80, enabled: on, onChanged: (s) => _text(v1api.CoverPatch(subtitle: s))),
      const SizedBox(height: 16),
      _Field(label: 'Имена на обложке', hint: 'Пусто — как сейчас', controller: _names, max: 120, enabled: on, onChanged: (s) => _text(v1api.CoverPatch(namesOnCover: s))),
      const SizedBox(height: 6),
      Text('Можно поменять порядок или написать по-своему. Пусто — как сейчас.', style: TextStyle(fontSize: 12.5, color: c.textMuted)),
      const SizedBox(height: 14),
      _Check(
        value: cover.hideRecipientOnCover,
        title: 'Не отображать получателя на обложке',
        onChanged: on ? (b) => _save(v1api.CoverPatch(hideRecipientOnCover: b)) : null,
      ),
      _Check(
        value: cover.lines,
        title: 'Декоративные линии',
        hint: 'Линии и рамки рисунка шаблона. Украшение под именами остаётся — его можно убрать в «Конструкторе». Фото и текст не меняются.',
        onChanged: on ? (b) => _save(v1api.CoverPatch(coverLines: b)) : null,
      ),
    ]);
  }

  Widget _variant(v1api.Cover cover) {
    final c = context.c;
    final layout = _backNames.containsKey(cover.backLayout) ? cover.backLayout : 'quote';
    final need = _backSlots[layout] ?? 0;
    final photos = _photos?.photos ?? const <v1api.CabPhoto>[];
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      LayoutBuilder(builder: (context, box) {
        const gap = 10.0;
        final w = (box.maxWidth - gap) / 2;
        return Wrap(spacing: gap, runSpacing: gap, children: [
          for (final l in _backLayouts)
            SizedBox(
              width: w,
              child: _LayoutCard(
                name: _backNames[l]!.$1,
                hint: _backNames[l]!.$2,
                on: l == layout,
                onTap: cover.editable && l != layout ? () => _pickBackLayout(l) : null,
              ),
            ),
        ]);
      }),
      const SizedBox(height: 18),
      if (layout == 'minimal')
        Text('На обороте — имена и год. Текст не нужен.', style: TextStyle(fontSize: 14, color: c.textMuted))
      else
        _Field(
          label: _backLabel[layout] ?? 'Текст',
          hint: _backPlaceholder[layout],
          controller: _backText,
          max: 400,
          lines: layout == 'letter' ? 5 : 3,
          enabled: cover.editable,
          onChanged: (s) => _text(v1api.CoverPatch(backText: s)),
        ),
      if (need > 0) ...[
        const SizedBox(height: 18),
        Text(need > 1 ? 'Какие фото — до $need, в порядке выбора' : 'Какое фото', style: const TextStyle(fontSize: 13.5, fontWeight: FontWeight.w600)),
        const SizedBox(height: 10),
        if (photos.isEmpty)
          Text('В книге пока нет фото.', style: TextStyle(fontSize: 14, color: c.textMuted))
        else
          _PhotoGrid(
            photos: photos,
            badge: (id) {
              final i = _backIds.indexOf(id);
              return i < 0 || i >= need ? null : (need > 1 ? '${i + 1}' : '');
            },
            onTap: cover.editable ? (p) => _toggleBackPhoto(p.id, need) : null,
          ),
      ],
    ]);
  }
}

/// «Лицо / Оборот» — как переключатель сторон сайта.
class _SideSwitch extends StatelessWidget {
  const _SideSwitch({required this.back, required this.onChanged});
  final bool back;
  final ValueChanged<bool> onChanged;

  @override
  Widget build(BuildContext context) {
    final c = context.c;
    Widget item(String label, bool value) => GestureDetector(
          onTap: () => onChanged(value),
          child: AnimatedContainer(
            duration: const Duration(milliseconds: 180),
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
            decoration: BoxDecoration(color: back == value ? c.surfaceRaised : Colors.transparent, borderRadius: BorderRadius.circular(10), boxShadow: back == value ? [BoxShadow(color: Colors.black.withValues(alpha: 0.06), blurRadius: 4)] : null),
            child: Text(label, style: TextStyle(fontSize: 13.5, fontWeight: FontWeight.w500, color: back == value ? c.text : c.textMuted)),
          ),
        );
    return Container(
      padding: const EdgeInsets.all(3),
      decoration: BoxDecoration(color: c.surface, borderRadius: BorderRadius.circular(12)),
      child: Row(mainAxisSize: MainAxisSize.min, children: [item('Лицо', false), item('Оборот', true)]),
    );
  }
}

/// Вкладки панели: подчёркнутая винным активная, как StudioTabs сайта.
class _Tabs extends StatelessWidget {
  const _Tabs({required this.tabs, required this.value, required this.onChanged});
  final List<(String, String)> tabs;
  final String value;
  final ValueChanged<String> onChanged;

  @override
  Widget build(BuildContext context) {
    final c = context.c;
    return Container(
      decoration: BoxDecoration(border: Border(bottom: BorderSide(color: c.border))),
      child: Row(children: [
        for (final t in tabs)
          InkWell(
            onTap: () => onChanged(t.$1),
            child: Container(
              padding: const EdgeInsets.fromLTRB(4, 10, 4, 10),
              margin: const EdgeInsets.only(right: 18),
              decoration: BoxDecoration(border: Border(bottom: BorderSide(color: t.$1 == value ? c.brand : Colors.transparent, width: 2))),
              child: Text(t.$2, style: TextStyle(fontSize: 15, fontWeight: t.$1 == value ? FontWeight.w600 : FontWeight.w500, color: t.$1 == value ? c.text : c.textMuted)),
            ),
          ),
      ]),
    );
  }
}

class _Chip extends StatelessWidget {
  const _Chip({required this.label, required this.on, required this.onTap});
  final String label;
  final bool on;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final c = context.c;
    return Material(
      color: on ? c.text : c.surfaceRaised,
      shape: StadiumBorder(side: BorderSide(color: on ? c.text : c.border)),
      child: InkWell(
        customBorder: const StadiumBorder(),
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 9),
          child: Text(label, style: TextStyle(fontSize: 13.5, fontWeight: FontWeight.w500, color: on ? c.bg : c.text)),
        ),
      ),
    );
  }
}

/// Обложка в галерее: крупно, лицом к читателю; выбранная — с винной рамкой и «На обложке».
class _DesignTile extends StatelessWidget {
  const _DesignTile({required this.t, required this.url, required this.on, required this.needsPhoto, required this.mood, required this.onTap});
  final v1api.CoverTemplate t;
  final String url;
  final bool on;
  final bool needsPhoto;
  final String mood;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final c = context.c;
    final backend = context.read<ClientSession>().backend;
    return GestureDetector(
      onTap: onTap,
      behavior: HitTestBehavior.opaque,
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        AspectRatio(
          aspectRatio: 1 / 1.43,
          child: Container(
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(3),
              border: on ? Border.all(color: c.brand, width: 2) : null,
              boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: on ? 0.10 : 0.16), blurRadius: 10, offset: const Offset(0, 4))],
            ),
            padding: on ? const EdgeInsets.all(2) : EdgeInsets.zero,
            child: ClipRRect(
              borderRadius: BorderRadius.circular(2),
              child: Stack(fit: StackFit.expand, children: [
                // Рисованные обложки — SVG, на снимках и с фото — WebP.
                if (Uri.parse(url).path.endsWith('.svg'))
                  SvgPicture.network(backend.url(url), fit: BoxFit.cover, placeholderBuilder: (_) => ColoredBox(color: c.surface))
                else
                  Image.network(
                    backend.url(url),
                    headers: url.startsWith('/api/books/') ? backend.imageHeaders : null,
                    fit: BoxFit.cover,
                    cacheWidth: 360,
                    gaplessPlayback: true,
                    frameBuilder: (_, child, frame, sync) => sync || frame != null ? child : ColoredBox(color: c.surface),
                    errorBuilder: (_, _, _) => ColoredBox(color: c.surface),
                  ),
                if (needsPhoto)
                  Positioned(
                    left: 6,
                    bottom: 6,
                    child: Container(
                      width: 24,
                      height: 24,
                      decoration: BoxDecoration(color: Colors.black.withValues(alpha: 0.45), shape: BoxShape.circle),
                      child: const Icon(LucideIcons.imagePlus, size: 14, color: Colors.white),
                    ),
                  ),
              ]),
            ),
          ),
        ),
        const SizedBox(height: 9),
        Text(t.name, maxLines: 1, overflow: TextOverflow.ellipsis, style: AppText.serif(context, size: 17, weight: FontWeight.w500)),
        on
            ? Row(children: [
                Icon(LucideIcons.check, size: 13, color: c.brand),
                const SizedBox(width: 3),
                Text('На обложке', style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: c.brand)),
              ])
            : Text(mood, maxLines: 1, style: TextStyle(fontSize: 12, color: c.textMuted)),
      ]),
    );
  }
}

class _LayoutCard extends StatelessWidget {
  const _LayoutCard({required this.name, required this.hint, required this.on, required this.onTap});
  final String name;
  final String hint;
  final bool on;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final c = context.c;
    return Material(
      color: on ? c.bubbleOut : c.surfaceRaised,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(Cab.ctl), side: BorderSide(color: on ? c.brand : c.border, width: on ? 1.5 : 1)),
      child: InkWell(
        borderRadius: BorderRadius.circular(Cab.ctl),
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(12, 10, 12, 11),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(name, style: TextStyle(fontSize: 14.5, fontWeight: FontWeight.w600, color: on ? c.brand : c.text)),
            const SizedBox(height: 2),
            Text(hint, maxLines: 2, style: TextStyle(fontSize: 12.5, height: 1.3, color: c.textMuted)),
          ]),
        ),
      ),
    );
  }
}

/// Фото книги сеткой; выбранные — с винной рамкой и номером места.
class _PhotoGrid extends StatelessWidget {
  const _PhotoGrid({required this.photos, required this.badge, required this.onTap});
  final List<v1api.CabPhoto> photos;
  final String? Function(String id) badge;
  final ValueChanged<v1api.CabPhoto>? onTap;

  @override
  Widget build(BuildContext context) {
    final c = context.c;
    final backend = context.read<ClientSession>().backend;
    return GridView.count(
      crossAxisCount: 4,
      shrinkWrap: true,
      physics: const NeverScrollableScrollPhysics(),
      mainAxisSpacing: 6,
      crossAxisSpacing: 6,
      children: [
        for (final p in photos)
          Builder(builder: (_) {
            final b = badge(p.id);
            return GestureDetector(
              onTap: onTap == null ? null : () => onTap!(p),
              child: Container(
                decoration: BoxDecoration(borderRadius: BorderRadius.circular(8), border: Border.all(color: b != null ? c.brand : Colors.transparent, width: 2.5)),
                child: ClipRRect(
                  borderRadius: BorderRadius.circular(6),
                  child: Stack(fit: StackFit.expand, children: [
                    Image.network(backend.url(p.thumbUrl), headers: backend.imageHeaders, fit: BoxFit.cover, cacheWidth: 240, gaplessPlayback: true, errorBuilder: (_, _, _) => ColoredBox(color: c.surface)),
                    if (b != null)
                      Positioned(
                        right: 4,
                        top: 4,
                        child: Container(
                          width: 20,
                          height: 20,
                          alignment: Alignment.center,
                          decoration: BoxDecoration(color: c.brand, shape: BoxShape.circle),
                          child: b.isEmpty ? const Icon(LucideIcons.check, size: 12, color: Colors.white) : Text(b, style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: Colors.white)),
                        ),
                      ),
                  ]),
                ),
              ),
            );
          }),
      ],
    );
  }
}

class _Field extends StatelessWidget {
  const _Field({required this.label, required this.controller, required this.max, required this.onChanged, this.hint, this.lines = 1, this.enabled = true});
  final String label;
  final String? hint;
  final TextEditingController controller;
  final int max;
  final int lines;
  final bool enabled;
  final ValueChanged<String> onChanged;

  @override
  Widget build(BuildContext context) {
    final c = context.c;
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Text(label, style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: c.textMuted)),
      const SizedBox(height: 6),
      TextField(
        controller: controller,
        enabled: enabled,
        maxLength: max,
        minLines: lines,
        maxLines: lines == 1 ? 1 : lines + 3,
        textCapitalization: TextCapitalization.sentences,
        decoration: InputDecoration(hintText: hint, counterText: ''),
        onChanged: onChanged,
      ),
    ]);
  }
}

class _Check extends StatelessWidget {
  const _Check({required this.value, required this.title, required this.onChanged, this.hint});
  final bool value;
  final String title;
  final String? hint;
  final ValueChanged<bool>? onChanged;

  @override
  Widget build(BuildContext context) {
    final c = context.c;
    return InkWell(
      onTap: onChanged == null ? null : () => onChanged!(!value),
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 8),
        child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
          SizedBox(width: 24, height: 24, child: Checkbox(value: value, onChanged: onChanged == null ? null : (b) => onChanged!(b ?? false), activeColor: c.brand)),
          const SizedBox(width: 10),
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Padding(padding: const EdgeInsets.only(top: 2), child: Text(title, style: const TextStyle(fontSize: 14.5))),
              if (hint != null) Padding(padding: const EdgeInsets.only(top: 3), child: Text(hint!, style: TextStyle(fontSize: 12.5, height: 1.35, color: c.textMuted))),
            ]),
          ),
        ]),
      ),
    );
  }
}

class _Note extends StatelessWidget {
  const _Note({required this.icon, required this.text});
  final IconData icon;
  final String text;

  @override
  Widget build(BuildContext context) {
    final c = context.c;
    return Container(
      padding: const EdgeInsets.fromLTRB(14, 12, 14, 12),
      decoration: BoxDecoration(color: c.bubbleOut, borderRadius: BorderRadius.circular(Cab.panel)),
      child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Icon(icon, size: 16, color: c.brand),
        const SizedBox(width: 10),
        Expanded(child: Text(text, style: TextStyle(fontSize: 13.5, height: 1.4, color: c.text))),
      ]),
    );
  }
}
