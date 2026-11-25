import 'dart:io';

import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:provider/provider.dart';

import '../../api/mybook_api.g.dart' as v1api;
import '../../core/api.dart';
import '../../core/cache.dart';
import '../../ui/kit.dart';
import '../../ui/tokens.dart';
import '../data/session.dart';
import '../data/stores.dart';
import 'book_stages.dart';
import '../ui/book_chrome.dart';
import '../ui/cabinet.dart';
import 'help_sheet.dart';
import 'photo_editor_screen.dart';

/// Ключи особых мест фото (src/lib/book/toc.ts GALLERY_KEY, src/lib/book/layout.ts PHOTO_OFF_KEY).
const _galleryKey = '__gallery';
const _offKey = '__off';

/// Вкладка «Фото» — как на сайте (PhotosManager): заголовок и пояснение, итоги, фильтры, правило книги для фото без
/// места, сетка снимков с подписью «где в книге», «Добавить фото». Нажатие на фото — лист «Где стоит фото».
/// Модель — с сервера (cabinetPhotos, та же сборка, что у страницы сайта и PDF).
class PhotosScreen extends StatefulWidget {
  const PhotosScreen({super.key, required this.store, this.inBook = 0, this.hub});
  final BookStore store;
  final int inBook;
  final v1api.CabinetBook? hub;

  @override
  State<PhotosScreen> createState() => _PhotosScreenState();
}

class _PhotosScreenState extends State<PhotosScreen> {
  late final ClientSession _session = context.read<ClientSession>();
  final _picker = ImagePicker();
  v1api.CabinetPhotos? _tab;
  String? _error;
  String _filter = 'all';
  int _uploading = 0;

  String get _bookId => widget.store.bookId;
  String get _cacheKey => 'photos-$_bookId';

  @override
  void initState() {
    super.initState();
    LocalCache.read(_cacheKey).then((j) {
      if (j != null && _tab == null && mounted) {
        try {
          setState(() => _tab = v1api.CabinetPhotos.fromJson(j));
        } catch (_) {}
      }
    });
    _load();
  }

  Future<void> _load() async {
    try {
      final tab = await _session.backend.photosTab(_bookId);
      LocalCache.write(_cacheKey, tab.toJson());
      if (mounted) {
        setState(() {
          _tab = tab;
          _error = null;
        });
      }
    } on ApiException catch (e) {
      if (mounted && !(e.status == 0 && _tab != null)) setState(() => _error = e.message);
    }
  }

  bool _matches(v1api.CabPhoto p) => switch (_filter) {
        'auto' => p.place.auto && p.place.kind != 'off',
        'cover' => p.place.onCover != null,
        'off' => p.place.kind == 'off',
        'crop' => p.loss != null,
        _ => true,
      };

  Future<void> _add(ImageSource source) async {
    final tab = _tab;
    if (tab == null) return;
    final left = tab.maxPhotos - tab.photos.length;
    if (left <= 0) return _say('В книге уже ${tab.maxPhotos} фото — больше не поместится');
    final picked = source == ImageSource.camera ? [?await _picker.pickImage(source: source, imageQuality: 92)] : await _picker.pickMultiImage(imageQuality: 92, limit: left.clamp(2, 50));
    if (picked.isEmpty) return;
    setState(() => _uploading = picked.length);
    final errors = <String>[];
    try {
      // По 5 за раз: большой выбор с телефона не упирается в лимит запроса и показывает ход.
      for (var i = 0; i < picked.length; i += 5) {
        final part = picked.skip(i).take(5).map((x) => File(x.path)).toList();
        errors.addAll(await widget.store.upload(part));
        if (mounted) setState(() => _uploading -= part.length);
      }
    } on ApiException catch (e) {
      errors.add(e.message);
    } finally {
      if (mounted) setState(() => _uploading = 0);
    }
    await _load();
    if (errors.isNotEmpty) _say(errors.join('\n'));
  }

  void _say(String text) => ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(text)));

  void _choose() => showAppSheet<void>(context, title: _tab?.addLabel ?? 'Добавить фото', icon: LucideIcons.imagePlus, builder: (ctx) {
        return GroupCard(padding: EdgeInsets.zero, children: [
          GroupTile(title: 'Из галереи', icon: LucideIcons.images, onTap: () {
            Navigator.of(ctx).pop();
            _add(ImageSource.gallery);
          }),
          GroupTile(title: 'Снять камерой', icon: LucideIcons.camera, onTap: () {
            Navigator.of(ctx).pop();
            _add(ImageSource.camera);
          }),
        ]);
      });

  Future<void> _open(v1api.CabPhoto p) async {
    final tab = _tab!;
    final changed = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      backgroundColor: context.c.surfaceRaised,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(Cab.sheet))),
      builder: (_) => _PlaceSheet(tab: tab, photo: p, bookId: _bookId, session: _session),
    );
    if (changed == true) {
      await _load();
      widget.store.load();
    }
  }

  @override
  Widget build(BuildContext context) {
    final c = context.c;
    final tab = _tab;
    final h = widget.hub;
    return Scaffold(
      backgroundColor: c.bg,
      floatingActionButton: tab == null ? null : HelpButton(bookId: _bookId, section: 'photos'),
      bottomNavigationBar: tab == null || !tab.editable
          ? null
          : Container(
              padding: const EdgeInsets.fromLTRB(16, 10, 16, 10),
              decoration: BoxDecoration(color: c.bg, border: Border(top: BorderSide(color: c.border))),
              child: SafeArea(
                top: false,
                child: CabinetButton(label: _uploading > 0 ? 'Загружаем $_uploading…' : tab.addLabel, icon: LucideIcons.imagePlus, onPressed: _uploading > 0 ? null : _choose, large: false),
              ),
            ),
      appBar: BookHeader(bookId: _bookId, title: h?.title ?? widget.store.book?.title ?? '', kind: h?.kind ?? '', coverUrl: h?.coverThumbUrl ?? ''),
      body: tab == null
          ? (_error == null ? const Center(child: CircularProgressIndicator()) : EmptyState(icon: LucideIcons.wifiOff, title: 'Фото не открылись', hint: _error, action: 'Повторить', onAction: _load))
          : Column(children: [
              if (h != null)
                BookStageTabs(hub: h, active: 'photos'),
              Expanded(
                child: RefreshIndicator(
                  color: c.brand,
                  onRefresh: _load,
                  child: _body(tab),
                ),
              ),
            ]),
    );
  }

  Widget _body(v1api.CabinetPhotos tab) {
    final c = context.c;
    final shown = tab.photos.where(_matches).toList();
    return ListView(
      physics: const AlwaysScrollableScrollPhysics(parent: BouncingScrollPhysics()),
      padding: const EdgeInsets.fromLTRB(16, 24, 16, 32),
      children: [
        Enter(key: const ValueKey('title'), i: 0, child: Text(tab.title, style: AppText.serif(context, size: 34, weight: FontWeight.w500).copyWith(height: 1.1))),
        const SizedBox(height: 10),
        Text(tab.photos.isEmpty ? '' : tab.intro, style: TextStyle(fontSize: 16, height: 1.6, color: c.textMuted)),
        if (tab.photos.isEmpty) ...[
          const SizedBox(height: 40),
          EmptyState(icon: LucideIcons.images, title: 'Фото пока нет', hint: 'Загрузите самые тёплые кадры — потом решите, где каждый будет в книге.'),
        ] else ...[
          const SizedBox(height: 24),
          // Итоги: «Фото», «Размещено вами», «Встали сами», «Не печатаются» — две колонки, линии сверху и снизу.
          Container(
            padding: const EdgeInsets.symmetric(vertical: 12),
            decoration: BoxDecoration(border: Border.symmetric(horizontal: BorderSide(color: c.border))),
            child: Wrap(runSpacing: 8, children: [
              for (final s in tab.summary)
                FractionallySizedBox(
                  widthFactor: 0.5,
                  child: Row(crossAxisAlignment: CrossAxisAlignment.baseline, textBaseline: TextBaseline.alphabetic, children: [
                    Text('${s.count ?? 0}', style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w600, fontFeatures: [FontFeature.tabularFigures()])),
                    const SizedBox(width: 7),
                    Flexible(child: Text(s.label, style: TextStyle(fontSize: 14, color: c.textMuted))),
                  ]),
                ),
            ]),
          ),
          const SizedBox(height: 16),
          // Фильтры: тёмный — выбранный, белые с рамкой — остальные, со счётчиком.
          SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            child: Row(children: [
              for (final f in tab.filters)
                Padding(
                  padding: const EdgeInsets.only(right: 8),
                  child: Material(
                    color: _filter == f.key ? c.text : c.surfaceRaised,
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(Cab.ctl), side: BorderSide(color: _filter == f.key ? c.text : c.border)),
                    child: InkWell(
                      borderRadius: BorderRadius.circular(Cab.ctl),
                      onTap: () => setState(() => _filter = f.key),
                      child: Padding(
                        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 11),
                        child: Row(children: [
                          Text(f.label, style: TextStyle(fontSize: 15, color: _filter == f.key ? c.bg : c.text)),
                          const SizedBox(width: 7),
                          Text('${f.count ?? 0}', style: TextStyle(fontSize: 14, color: (_filter == f.key ? c.bg : c.textMuted).withValues(alpha: 0.75))),
                        ]),
                      ),
                    ),
                  ),
                ),
            ]),
          ),
          const SizedBox(height: 12),
          // Правило книги для фото без выбранного места.
          Panel(
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 11),
            child: Row(children: [
              Icon(LucideIcons.imagePlay, size: 19, color: c.brand),
              const SizedBox(width: 12),
              Expanded(
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text(tab.ruleTitle, style: TextStyle(fontSize: 13, color: c.textMuted)),
                  Text(tab.ruleName, style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w500)),
                ]),
              ),
            ]),
          ),
          const SizedBox(height: 16),
          if (shown.isEmpty)
            Padding(
              padding: const EdgeInsets.only(top: 24),
              child: EmptyState(icon: LucideIcons.images, title: tab.noMatch, action: 'Показать все фото', onAction: () => setState(() => _filter = 'all')),
            )
          else
            GridView.builder(
              shrinkWrap: true,
              physics: const NeverScrollableScrollPhysics(),
              gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(crossAxisCount: 2, mainAxisSpacing: 14, crossAxisSpacing: 12, childAspectRatio: 0.78),
              itemCount: shown.length,
              itemBuilder: (_, i) => _Tile(photo: shown[i], editedLabel: tab.sheet.editedLabel, onTap: () => _open(shown[i])),
            ),
        ],
      ],
    );
  }
}

/// Плитка фото: снимок с номером, подпись «где в книге» (значок места), отметка обрезки.
class _Tile extends StatelessWidget {
  const _Tile({required this.photo, this.editedLabel, required this.onTap});
  final v1api.CabPhoto photo;
  final String? editedLabel;
  final VoidCallback onTap;

  static IconData placeIcon(String kind) => switch (kind) {
        'answer' => LucideIcons.messageSquareText,
        'opener' => LucideIcons.bookOpen,
        'after' => LucideIcons.stickyNote,
        'album' => LucideIcons.images,
        _ => LucideIcons.eyeOff,
      };

  @override
  Widget build(BuildContext context) {
    final c = context.c;
    final backend = context.read<ClientSession>().backend;
    return GestureDetector(
      onTap: onTap,
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        Expanded(
          child: ClipRRect(
            borderRadius: BorderRadius.circular(Cab.ctl),
            child: Stack(fit: StackFit.expand, children: [
              ColoredBox(color: c.surface),
              Image.network(backend.url(photo.thumbUrl), headers: backend.imageHeaders, fit: BoxFit.cover, cacheWidth: 480, gaplessPlayback: true, errorBuilder: (_, _, _) => const SizedBox()),
              Positioned(
                left: 8,
                top: 8,
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 2),
                  decoration: BoxDecoration(color: Colors.black.withValues(alpha: 0.62), borderRadius: BorderRadius.circular(7)),
                  child: Text('${photo.n}', style: const TextStyle(color: Colors.white, fontSize: 12, fontWeight: FontWeight.w600)),
                ),
              ),
              if (photo.edited == true && editedLabel != null)
                Positioned(
                  left: 8,
                  bottom: 8,
                  child: Container(
                    padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 3),
                    decoration: BoxDecoration(color: c.brand, borderRadius: BorderRadius.circular(7)),
                    child: Text(editedLabel!, style: TextStyle(color: c.onBrand, fontSize: 11, fontWeight: FontWeight.w500)),
                  ),
                ),
              if (photo.loss != null)
                Positioned(
                  right: 8,
                  bottom: 8,
                  child: Container(
                    padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 3),
                    decoration: BoxDecoration(color: c.warnBg, borderRadius: BorderRadius.circular(7)),
                    child: Text(photo.loss!, style: TextStyle(color: c.warn, fontSize: 11.5, fontWeight: FontWeight.w500)),
                  ),
                ),
            ]),
          ),
        ),
        const SizedBox(height: 7),
        Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Padding(padding: const EdgeInsets.only(top: 2), child: Icon(photo.place.auto ? LucideIcons.sparkles : placeIcon(photo.place.kind), size: 14, color: photo.place.kind == 'off' ? c.textFaint : c.brand)),
          const SizedBox(width: 6),
          Expanded(child: Text(photo.place.label, maxLines: 2, overflow: TextOverflow.ellipsis, style: TextStyle(fontSize: 13, height: 1.3, color: c.text.withValues(alpha: 0.85)))),
        ]),
      ]),
    );
  }
}

/// Лист «Где стоит фото» (PlaceSheet): место — шаг 1, глава или ответ — шаг 2; вид на странице и подпись у фото на
/// страницах фото; удаление — с вариантом, который ничего не удаляет («Не печатать в книге»).
class _PlaceSheet extends StatefulWidget {
  const _PlaceSheet({required this.tab, required this.photo, required this.bookId, required this.session});
  final v1api.CabinetPhotos tab;
  final v1api.CabPhoto photo;
  final String bookId;
  final ClientSession session;

  @override
  State<_PlaceSheet> createState() => _PlaceSheetState();
}

class _PlaceSheetState extends State<_PlaceSheet> {
  String _step = 'place';
  bool _busy = false;
  bool _changed = false;
  late String _option = widget.photo.place.option;
  late String _layout = widget.photo.layout;
  late final TextEditingController _caption = TextEditingController(text: widget.photo.caption);

  v1api.CabinetPhotosSheet get t => widget.tab.sheet;

  @override
  void dispose() {
    _caption.dispose();
    super.dispose();
  }

  Future<void> _save(Map<String, Object?> patch) async {
    setState(() => _busy = true);
    try {
      await widget.session.backend.updatePhoto(widget.bookId, widget.photo.id, patch);
      _changed = true;
    } on ApiException catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _pick(String kind) async {
    if (kind == 'answer' || kind == 'after' || kind == 'opener') {
      setState(() => _step = kind);
      return;
    }
    final patch = switch (kind) {
      'album' => <String, Object?>{'questionId': null, 'chapter': _galleryKey},
      'off' => <String, Object?>{'questionId': null, 'chapter': _offKey},
      _ => <String, Object?>{'questionId': null, 'chapter': null},
    };
    await _save(patch);
    if (mounted) setState(() => _option = kind);
  }

  Future<void> _target(String kind, String value) async {
    final patch = switch (kind) {
      'answer' => <String, Object?>{'questionId': value},
      'opener' => <String, Object?>{'questionId': null, 'chapter': value, 'opener': true},
      _ => <String, Object?>{'questionId': null, 'chapter': value, 'opener': false},
    };
    await _save(patch);
    if (mounted) {
      setState(() {
        _option = kind;
        _step = 'place';
      });
    }
  }

  Future<void> _done() async {
    if (_caption.text != widget.photo.caption) await _save({'caption': _caption.text.trim()});
    if (mounted) Navigator.of(context).pop(_changed);
  }

  Future<void> _openEditor() async {
    final res = await Navigator.of(context).push<v1api.PhotoEditorResult>(
      MaterialPageRoute(builder: (_) => PhotoEditorScreen(bookId: widget.bookId, photoId: widget.photo.id)),
    );
    if (res != null && mounted) {
      Navigator.of(context).pop(true);
    }
  }

  Future<void> _delete() async {
    final c = context.c;
    final answer = await showDialog<String>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(t.deleteTitle),
        content: Text(t.deleteText),
        actions: [
          TextButton(onPressed: () => Navigator.of(ctx).pop('keep'), child: Text(t.deleteKeep)),
          TextButton(onPressed: () => Navigator.of(ctx).pop('delete'), child: Text(t.deleteConfirm, style: TextStyle(color: c.danger))),
          TextButton(onPressed: () => Navigator.of(ctx).pop(), child: Text(t.cancel)),
        ],
      ),
    );
    if (answer == 'keep') {
      await _pick('off');
    } else if (answer == 'delete') {
      setState(() => _busy = true);
      try {
        await widget.session.backend.deletePhoto(widget.bookId, widget.photo.id);
        if (mounted) Navigator.of(context).pop(true);
      } on ApiException catch (e) {
        if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
      } finally {
        if (mounted) setState(() => _busy = false);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final c = context.c;
    final backend = widget.session.backend;
    final p = widget.photo;
    final editable = widget.tab.editable;
    final onPage = _option == 'after' || _option == 'album';
    final title = _step == 'place' ? t.title : (_step == 'answer' ? t.stepAnswer : t.stepChapter);
    return Padding(
      padding: EdgeInsets.only(bottom: MediaQuery.viewInsetsOf(context).bottom),
      child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        const SizedBox(height: 8),
        Center(child: Container(width: 38, height: 4, decoration: BoxDecoration(color: c.border, borderRadius: BorderRadius.circular(2)))),
        Padding(
          padding: const EdgeInsets.fromLTRB(8, 6, 16, 0),
          child: Row(children: [
            if (_step != 'place') IconButton(icon: const Icon(LucideIcons.chevronLeft), onPressed: () => setState(() => _step = 'place')) else const SizedBox(width: 12),
            Expanded(child: Text(title, style: AppText.serif(context, size: 24, weight: FontWeight.w500))),
            if (_busy) const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2)),
          ]),
        ),
        Flexible(
          child: ListView(
            shrinkWrap: true,
            padding: const EdgeInsets.fromLTRB(20, 12, 20, 12),
            children: [
              if (_step == 'place') ...[
                Row(children: [
                  ClipRRect(borderRadius: BorderRadius.circular(Cab.ctl), child: Image.network(backend.url(p.thumbUrl), headers: backend.imageHeaders, width: 64, height: 64, fit: BoxFit.cover, errorBuilder: (_, _, _) => Container(width: 64, height: 64, color: c.surface))),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      Text(p.place.label, style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w500)),
                      if (p.place.onCover != null) Text(p.place.onCover == 'cover' ? t.coverNote : t.backNote, style: TextStyle(fontSize: 13.5, color: c.textMuted)),
                    ]),
                  ),
                ]),
                const SizedBox(height: 16),
                for (final o in t.options)
                  if (o.key != 'answer' || widget.tab.answers.isNotEmpty)
                    _Option(label: o.label, hint: o.hint, selected: _option == o.key, here: _option == o.key ? t.here : null, next: o.key == 'answer' || o.key == 'after' || o.key == 'opener', onTap: editable && !_busy ? () => _pick(o.key) : null),
                if (onPage) ...[
                  const SizedBox(height: 14),
                  Text(t.layoutTitle, style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w600)),
                  const SizedBox(height: 8),
                  Wrap(spacing: 8, runSpacing: 8, children: [
                    for (final l in t.layouts)
                      ChoiceChip(
                        label: Text(l.label),
                        selected: _layout == l.key,
                        onSelected: editable
                            ? (_) async {
                                setState(() => _layout = l.key);
                                await _save({'layout': l.key});
                              }
                            : null,
                      ),
                  ]),
                  const SizedBox(height: 14),
                  Text(t.caption, style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w600)),
                  const SizedBox(height: 6),
                  TextField(controller: _caption, readOnly: !editable, maxLength: 300, maxLines: 2, minLines: 1, decoration: const InputDecoration(counterText: '')),
                ],
                if (editable && t.editLabel != null) ...[
                  const SizedBox(height: 14),
                  SizedBox(
                    width: double.infinity,
                    child: FilledButton.icon(
                      style: FilledButton.styleFrom(
                        backgroundColor: c.text,
                        foregroundColor: c.bg,
                        minimumSize: const Size.fromHeight(46),
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(Cab.ctl)),
                      ),
                      onPressed: _busy ? null : _openEditor,
                      icon: const Icon(LucideIcons.slidersHorizontal, size: 17),
                      label: Text(t.editLabel!, style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w500)),
                    ),
                  ),
                ],
                if (editable) ...[
                  const SizedBox(height: 10),
                  Align(alignment: Alignment.centerLeft, child: TextButton.icon(onPressed: _busy ? null : _delete, icon: Icon(LucideIcons.trash2, size: 17, color: c.danger), label: Text(t.deleteLabel, style: TextStyle(color: c.danger)))),
                ],
              ] else if (_step == 'answer') ...[
                for (final ch in widget.tab.chapters)
                  if (widget.tab.answers.any((a) => a.chapterKey == ch.key)) ...[
                    Padding(padding: const EdgeInsets.fromLTRB(4, 12, 4, 6), child: Text(ch.title, style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: c.textMuted))),
                    for (final a in widget.tab.answers.where((a) => a.chapterKey == ch.key)) _Option(label: a.title, selected: widget.photo.questionId == a.id, here: widget.photo.questionId == a.id ? t.here : null, onTap: _busy ? null : () => _target('answer', a.id)),
                  ],
              ] else ...[
                for (final ch in widget.tab.chapters)
                  if (!ch.key.startsWith('__')) _Option(label: ch.title, selected: widget.photo.chapter == ch.key && _option == _step, here: widget.photo.chapter == ch.key && _option == _step ? t.here : null, onTap: _busy ? null : () => _target(_step, ch.key)),
              ],
            ],
          ),
        ),
        Padding(
          padding: const EdgeInsets.fromLTRB(20, 4, 20, 16),
          child: SafeArea(top: false, child: CabinetButton(label: t.done, onPressed: _busy ? null : _done, large: false)),
        ),
      ]),
    );
  }
}

class _Option extends StatelessWidget {
  const _Option({required this.label, this.hint, required this.selected, this.here, this.next = false, this.onTap});
  final String label;
  final String? hint;
  final bool selected;
  final String? here;
  final bool next;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final c = context.c;
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Material(
        color: selected ? c.bubbleOut.withValues(alpha: 0.5) : c.surfaceRaised,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(Cab.ctl), side: BorderSide(color: selected ? c.brand.withValues(alpha: 0.5) : c.border)),
        child: InkWell(
          borderRadius: BorderRadius.circular(Cab.ctl),
          onTap: onTap,
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
            child: Row(children: [
              Icon(selected ? LucideIcons.circleDot : LucideIcons.circle, size: 18, color: selected ? c.brand : c.textFaint),
              const SizedBox(width: 12),
              Expanded(
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text(label, style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w500)),
                  if (hint != null && hint!.isNotEmpty) Text(hint!, style: TextStyle(fontSize: 13, height: 1.35, color: c.textMuted)),
                  if (here != null) Text(here!, style: TextStyle(fontSize: 12.5, color: c.brand)),
                ]),
              ),
              if (next) Icon(LucideIcons.chevronRight, size: 17, color: c.textFaint),
            ]),
          ),
        ),
      ),
    );
  }
}

/// Миниатюра фото книги для других экранов (по токену автора).
class PhotoThumb extends StatelessWidget {
  const PhotoThumb({super.key, required this.url});
  final String url;

  @override
  Widget build(BuildContext context) {
    final backend = context.read<ClientSession>().backend;
    return Image.network(backend.url(url), headers: backend.imageHeaders, fit: BoxFit.cover, cacheWidth: 360, errorBuilder: (_, _, _) => const SizedBox());
  }
}
