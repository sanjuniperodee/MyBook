import 'dart:async';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:provider/provider.dart';

import '../../api/mybook_api.g.dart' as v1api;
import '../../core/api.dart';
import '../../ui/kit.dart';
import '../../ui/tokens.dart';
import '../data/session.dart';
import 'book_stages.dart';
import 'pages_screen.dart';
import '../ui/book_chrome.dart';
import '../ui/cabinet.dart';
import 'cover_designer.dart';

/// Обложка — один в один с кабинетом сайта (/books/[id]/cover):
/// - Режим «Готовые дизайны»: лицо — «Дизайн» (настроение, обложки крупно, выбранная первой с «На обложке»),
///   «Фото» (места шаблона + кадр/масштаб фото), «Текст» (название, подзаголовок, имена, получатель, декоративные линии);
///   оборот — «Фон» («Как спереди» / «Свой цвет») и «Вариант» (цитата, письмо, фото, полароиды, лаконично + кадр фото).
/// - Режим «Конструктор»: полноценный нативный конструктор слоёв лица и оборота (тексты, фото книги/сток/загрузка,
///   фигуры и декоративные линии/рамки, декор, макеты, фон, слои, отмена/повтор) с сохранением в API v1.
/// - Вид сцены: «Плоско» (крышка или холст конструктора) и «Целиком» (развёртка: оборот + корешок + лицо).
/// Все надписи, палитры, шрифты, макеты, значки и пределы приходят с сервера в [v1api.CoverView].
class CoverScreen extends StatefulWidget {
  const CoverScreen({super.key, required this.hub});
  final v1api.CabinetBook hub;

  @override
  State<CoverScreen> createState() => _CoverScreenState();
}

class _CoverScreenState extends State<CoverScreen> {
  late final ClientSession _session = context.read<ClientSession>();
  v1api.CoverView? _view;
  v1api.CabinetPhotos? _photos;
  String? _error;
  bool _back = false;
  bool _designerMode = false;
  bool _spreadView = false;
  String _tab = 'designs';
  String _mood = 'all';
  bool _allDesigns = false;
  int _slot = 0;
  int _backFrameSlot = 0;
  int _saving = 0;
  String? _saveError;

  List<String> _backIds = [];

  final _title = TextEditingController();
  final _subtitle = TextEditingController();
  final _names = TextEditingController();
  final _author = TextEditingController();
  final _recordedBy = TextEditingController();
  final _recipient = TextEditingController();
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
    _author.dispose();
    _recordedBy.dispose();
    _recipient.dispose();
    _backText.dispose();
    super.dispose();
  }

  void _syncControllers(v1api.CoverView v) {
    _title.text = v.cover.title;
    _subtitle.text = v.cover.subtitle;
    _names.text = v.cover.namesOnCover;
    _author.text = v.cover.authorName;
    _recordedBy.text = v.cover.recordedBy;
    _recipient.text = v.cover.recipientName;
    _backText.text = v.cover.backText;
    _backIds = v.cover.backPhotoIds ?? [if (v.cover.backPhotoId != null) v.cover.backPhotoId!];
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
        _syncControllers(v);
      });
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
      if (mounted) {
        setState(() {
          _view = v;
          if (v.cover.backPhotoIds != null) _backIds = v.cover.backPhotoIds!;
        });
      }
    } on ApiException catch (e) {
      if (mounted) setState(() => _saveError = e.message);
    } finally {
      if (mounted) setState(() => _saving--);
    }
  }

  Future<void> _saveDesignBody(v1api.CoverDesignSaveBody body, {bool syncText = false}) async {
    setState(() {
      _saving++;
      _saveError = null;
    });
    try {
      final v = await _session.backend.call(() => _session.backend.contract.coverDesignSave(bookId: _bookId, body: body));
      if (mounted) {
        setState(() {
          _view = v;
          if (syncText) _syncControllers(v);
        });
      }
    } on ApiException catch (e) {
      if (mounted) setState(() => _saveError = e.message);
    } finally {
      if (mounted) setState(() => _saving--);
    }
  }

  Future<void> _initDesigner({required String side, String? layoutId, String? backLayout}) async {
    setState(() {
      _saving++;
      _saveError = null;
    });
    try {
      final v = await _session.backend.call(
        () => _session.backend.contract.coverDesignInit(
          bookId: _bookId,
          body: v1api.CoverDesignInitBody(side: side, layoutId: layoutId, backLayout: backLayout),
        ),
      );
      if (mounted) {
        setState(() {
          _view = v;
          _syncControllers(v);
        });
      }
    } on ApiException catch (e) {
      if (mounted) setState(() => _saveError = e.message);
    } finally {
      if (mounted) setState(() => _saving--);
    }
  }

  Future<void> _resetDesigner({
    required String side,
    String? coverTemplate,
    String? coverPhotoId,
    List<String>? coverPhotoExtra,
    bool clearPhotoId = false,
  }) async {
    setState(() {
      _saving++;
      _saveError = null;
    });
    try {
      final v = await _session.backend.call(
        () => _session.backend.contract.coverDesignReset(
          bookId: _bookId,
          body: v1api.CoverDesignResetBody(
            side: side,
            coverTemplate: coverTemplate,
            coverPhotoId: coverPhotoId,
            coverPhotoExtra: coverPhotoExtra,
            nulls: clearPhotoId ? {'coverPhotoId'} : const {},
          ),
        ),
      );
      if (mounted) {
        setState(() {
          _view = v;
          _syncControllers(v);
          _designerMode = false;
        });
      }
    } on ApiException catch (e) {
      if (mounted) setState(() => _saveError = e.message);
    } finally {
      if (mounted) setState(() => _saving--);
    }
  }

  Future<void> _openDesigner({bool? backSide}) async {
    _flushText();
    final targetBack = backSide ?? _back;
    final cover = _view?.cover;
    if (cover == null) return;
    final side = targetBack ? 'back' : 'front';
    final hasLayers = targetBack ? (cover.hasBackDesign ?? false) : cover.hasDesign;
    if (!hasLayers && !cover.editable) return;
    setState(() {
      _back = targetBack;
      _spreadView = false;
      _designerMode = true;
    });
    if (!hasLayers && cover.editable) {
      await _initDesigner(side: side);
    }
  }

  Future<v1api.CabPhoto?> _uploadPhotoForDesigner() async {
    final picker = ImagePicker();
    final picked = await picker.pickImage(source: ImageSource.gallery);
    if (picked == null) return null;
    try {
      final res = await _session.backend.uploadPhotos(_bookId, [File(picked.path)]);
      final refreshed = await _session.backend.photosTab(_bookId);
      if (mounted) setState(() => _photos = refreshed);
      if (res.photos.isNotEmpty) {
        final id = res.photos.first.id;
        for (final p in refreshed.photos) {
          if (p.id == id) return p;
        }
      }
      return refreshed.photos.isNotEmpty ? refreshed.photos.last : null;
    } on ApiException catch (e) {
      if (mounted) setState(() => _saveError = e.message);
      return null;
    }
  }

  /// Тексты сохраняются, когда автор перестал печатать (как поля сайта), и при уходе с экрана.
  void _text(v1api.CoverPatch patch) {
    final p = _pendingText;
    _pendingText = v1api.CoverPatch(
      title: patch.title ?? p?.title,
      subtitle: patch.subtitle ?? p?.subtitle,
      namesOnCover: patch.namesOnCover ?? p?.namesOnCover,
      authorName: patch.authorName ?? p?.authorName,
      recordedBy: patch.recordedBy ?? p?.recordedBy,
      recipientName: patch.recipientName ?? p?.recipientName,
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
    final v = _view!;
    final cover = v.cover;
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
    // Обложка из конструктора закрывает шаблон целиком: спрашиваем подтверждение и сбрасываем, как на сайте.
    if (cover.hasDesign) {
      final repl = v.designer?.labels.replace;
      if (repl != null) {
        final ok = await showDialog<bool>(
          context: context,
          builder: (ctx) => AlertDialog(
            title: Text(repl.titleTemplate.replaceAll('{name}', t.name)),
            content: Text(repl.text),
            actions: [
              TextButton(onPressed: () => Navigator.pop(ctx, false), child: Text(repl.cancel)),
              FilledButton(onPressed: () => Navigator.pop(ctx, true), child: Text(repl.ok)),
            ],
          ),
        );
        if (ok != true) return;
      }
      await _resetDesigner(
        side: 'front',
        coverTemplate: t.id,
        coverPhotoId: patch.containsKey('photo') ? patch['photo'] as String? : null,
        coverPhotoExtra: patch['extra'] as List<String>?,
        clearPhotoId: patch.containsKey('photo') && patch['photo'] == null,
      );
      return;
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

  v1api.CoverBackLayout? _backLayout(String id) {
    for (final l in _view?.backLayouts ?? const <v1api.CoverBackLayout>[]) {
      if (l.id == id) return l;
    }
    return null;
  }

  Future<void> _pickBackLayout(String layout) async {
    final need = _backLayout(layout)?.photos ?? 0;
    var ids = _backIds;
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

  v1api.CoverPhotoFrame _frameFor(String key) {
    for (final f in _view?.cover.photoFrames ?? const <v1api.CoverSlotFrame>[]) {
      if (f.key == key) return f.frame;
    }
    return const v1api.CoverPhotoFrame(zoom: 1, x: 0.5, y: 0.5);
  }

  Future<void> _updatePhotoFrame(String key, v1api.CoverPhotoFrame? next) async {
    final list = <v1api.CoverSlotFrame>[
      for (final f in _view?.cover.photoFrames ?? const <v1api.CoverSlotFrame>[])
        if (f.key != key) f,
    ];
    if (next != null && !(next.zoom == 1 && next.x == 0.5 && next.y == 0.5)) {
      list.add(v1api.CoverSlotFrame(key: key, frame: next));
    }
    await _saveDesignBody(v1api.CoverDesignSaveBody(photoFrames: list));
  }

  Future<void> _setBackFill(v1api.CoverBackground bg) async {
    final existing = _view!.cover.coverBack;
    final clear = bg.kind == 'template' && existing?.layers == null;
    await _saveDesignBody(
      v1api.CoverDesignSaveBody(
        coverBack: clear ? null : v1api.CoverBack(v: 1, background: bg, layers: existing?.layers),
        nulls: clear ? {'coverBack'} : const {},
      ),
    );
  }

  Future<void> _side(bool back) async {
    _flushText();
    setState(() {
      _back = back;
      _spreadView = false;
      _tab = back ? 'variant' : 'designs';
    });
    if (_designerMode && _view != null) {
      final hasLayers = back ? (_view!.cover.hasBackDesign ?? false) : _view!.cover.hasDesign;
      if (!hasLayers && _view!.cover.editable) {
        await _initDesigner(side: back ? 'back' : 'front');
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final c = context.c;
    final h = widget.hub;
    final v = _view;
    return Scaffold(
      backgroundColor: c.bg,
      appBar: BookHeader(
        bookId: h.id,
        title: h.title,
        kind: h.kind,
        coverUrl: v?.cover.imageUrl != null ? '${v!.cover.imageUrl}&w=240' : h.coverThumbUrl,
      ),
      body: v == null
          ? (_error == null
              ? const Center(child: CircularProgressIndicator())
              : EmptyState(
                  icon: LucideIcons.wifiOff,
                  title: _error!,
                  action: MaterialLocalizations.of(context).refreshIndicatorSemanticLabel,
                  onAction: _load,
                ))
          : Column(children: [
              BookStageTabs(hub: h, active: 'design'),
              Expanded(child: _body(v)),
            ]),
    );
  }

  Widget _body(v1api.CoverView v) {
    final c = context.c;
    final cover = v.cover;
    final designer = v.designer;
    final template = _template(cover.template);
    final slots = template?.photoSlots ?? 0;
    final l = v.labels;
    final backLayered = cover.hasBackDesign ?? false;
    final hasDesignerForSide = _back ? backLayered : cover.hasDesign;
    final canEnterDesigner = designer != null && (cover.editable || hasDesignerForSide);
    final showDesigner = _designerMode && designer != null && hasDesignerForSide;

    final tabs = _back
        ? [
            if (designer != null) ('fill', designer.labels.panels.fill),
            ('variant', l.tabs.variant),
          ]
        : [
            ('designs', l.tabs.designs),
            if (slots > 0 && !cover.hasDesign) ('photo', l.tabs.photo),
            ('text', l.tabs.text),
          ];
    final tab = tabs.any((t) => t.$1 == _tab) ? _tab : tabs.first.$1;

    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 48),
      keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
      children: [
        // Заголовок и переключатель «Лицо / Оборот»
        // «Обложка · Страницы» — заголовок шага и переключатель его половин, как на сайте.
        DesignSwitch(hub: widget.hub, active: 'cover', cover: l.designSwitch.cover, pages: l.designSwitch.pages),
        const SizedBox(height: 14),
        Row(children: [
          const Spacer(),
          _PillToggle(
            value: _back,
            leftLabel: l.sides.front,
            rightLabel: l.sides.back,
            onChanged: (b) => _side(b),
          ),
        ]),

        // Переключатель «Готовые дизайны / Конструктор» и вид «Плоско / Целиком»
        if (designer != null) ...[
          const SizedBox(height: 12),
          Row(children: [
            Expanded(
              child: _PillToggle(
                value: _designerMode,
                leftLabel: designer.labels.modes.template,
                rightLabel: designer.labels.modes.designer,
                rightEnabled: canEnterDesigner,
                onChanged: (d) {
                  if (d) {
                    _openDesigner();
                  } else {
                    setState(() => _designerMode = false);
                  }
                },
              ),
            ),
            if (cover.spreadImageUrl != null) ...[
              const SizedBox(width: 8),
              _PillToggle(
                value: _spreadView,
                leftLabel: designer.labels.views.flat,
                rightLabel: designer.labels.views.spread,
                onChanged: (s) => setState(() => _spreadView = s),
              ),
            ],
          ]),
        ],
        const SizedBox(height: 16),

        if (!cover.editable) ...[
          _Note(icon: LucideIcons.lock, text: _back && designer != null ? designer.labels.backCta.readonly : l.readonly),
          const SizedBox(height: 12),
        ],

        if (_designerMode && designer != null)
          showDesigner
              ? CoverDesignerView(
                  bookId: _bookId,
                  view: v,
                  catalog: designer,
                  side: _back ? 'back' : 'front',
                  photos: _photos?.photos ?? const [],
                  saving: _saving > 0,
                  saveError: _saveError,
                  stageSpread: _spreadView && cover.spreadImageUrl != null ? _spreadStage(v) : null,
                  onSaveDesign: (d) async {
                    if (_back) {
                      await _saveDesignBody(
                        v1api.CoverDesignSaveBody(
                          coverBack: v1api.CoverBack(v: 1, background: d.background, layers: d.layers),
                        ),
                      );
                    } else {
                      await _saveDesignBody(v1api.CoverDesignSaveBody(coverDesign: d));
                    }
                  },
                  onSaveBookText: (bind, value) async {
                    final body = switch (bind) {
                      'title' => v1api.CoverDesignSaveBody(title: value),
                      'subtitle' => v1api.CoverDesignSaveBody(subtitle: value),
                      _ => v1api.CoverDesignSaveBody(namesOnCover: value),
                    };
                    await _saveDesignBody(body, syncText: true);
                  },
                  onToggleCoverLines: (lines) => _saveDesignBody(v1api.CoverDesignSaveBody(coverLines: lines)),
                  onApplyLayout: ({layoutId, backLayout}) => _initDesigner(
                    side: _back ? 'back' : 'front',
                    layoutId: layoutId,
                    backLayout: backLayout,
                  ),
                  onReset: () => _resetDesigner(side: _back ? 'back' : 'front'),
                  onUploadPhoto: _uploadPhotoForDesigner,
                )
              : const Padding(
                  padding: EdgeInsets.symmetric(vertical: 48),
                  child: Center(child: CircularProgressIndicator()),
                )
        else ...[
          // Режим «Готовые дизайны»
          if (_spreadView && cover.spreadImageUrl != null)
            _spreadStage(v)
          else if (!_back)
            _stage(v, template)
          else
            _backStage(v),
          const SizedBox(height: 10),
          SizedBox(
            height: 20,
            child: Center(
              child: _saving > 0
                  ? Row(mainAxisSize: MainAxisSize.min, children: [
                      const SizedBox(width: 12, height: 12, child: CircularProgressIndicator(strokeWidth: 1.6)),
                      const SizedBox(width: 8),
                      Text(l.saving, style: TextStyle(fontSize: 13, color: c.textMuted)),
                    ])
                  : _saveError != null
                      ? Text(_saveError!, style: TextStyle(fontSize: 13, color: c.danger), textAlign: TextAlign.center)
                      : null,
            ),
          ),

          // Карточка «Сейчас на обложке — вариант из конструктора» с кнопками открыть и сбросить
          if (cover.hasDesign && !_back && designer != null) ...[
            const SizedBox(height: 8),
            _DesignerActiveBanner(
              text: l.designActive,
              openLabel: designer.labels.cta.openActive,
              resetLabel: cover.editable ? designer.labels.cta.reset : null,
              onOpen: () => _openDesigner(backSide: false),
              onReset: cover.editable ? () => _confirmResetFromTemplate(designer, backSide: false) : null,
            ),
          ],
          if (backLayered && _back && designer != null) ...[
            const SizedBox(height: 8),
            _DesignerActiveBanner(
              text: designer.labels.backCta.active,
              openLabel: designer.labels.backCta.openActive,
              resetLabel: cover.editable ? designer.labels.backCta.reset : null,
              onOpen: () => _openDesigner(backSide: true),
              onReset: cover.editable ? () => _confirmResetFromTemplate(designer, backSide: true) : null,
            ),
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
                'photo' => _coverPhotos(v, slots),
                'text' => _texts(v),
                'fill' => _backFill(v),
                _ => _variant(v),
              },
            ),
          ),
        ],
      ],
    );
  }

  Future<void> _confirmResetFromTemplate(v1api.CoverDesignerCatalog designer, {required bool backSide}) async {
    final title = backSide ? designer.labels.backCta.reset : designer.labels.cta.reset;
    final body = backSide ? designer.labels.backCta.confirmReset : designer.labels.cta.confirmReset;
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(title),
        content: Text(body),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: Text(designer.labels.replace.cancel)),
          FilledButton(
            style: FilledButton.styleFrom(backgroundColor: ctx.c.danger),
            onPressed: () => Navigator.pop(ctx, true),
            child: Text(title),
          ),
        ],
      ),
    );
    if (ok == true) {
      await _resetDesigner(side: backSide ? 'back' : 'front');
    }
  }

  String _moodName(v1api.CoverView v, String id) {
    for (final m in v.moods) {
      if (m.id == id) return m.label;
    }
    return '';
  }

  Widget _stage(v1api.CoverView v, v1api.CoverTemplate? t) {
    final c = context.c;
    final cover = v.cover;
    return Column(children: [
      Center(child: CoverImage(url: '${cover.imageUrl}&w=480', width: 200)),
      const SizedBox(height: 14),
      if (t != null && !cover.hasDesign) ...[
        Text(t.name, style: AppText.serif(context, size: 21, weight: FontWeight.w500)),
        Text(_moodName(v, t.mood), style: TextStyle(fontSize: 12.5, color: c.textMuted)),
      ],
    ]);
  }

  Widget _backStage(v1api.CoverView v) {
    final c = context.c;
    final l = v.labels.back;
    return Column(children: [
      Center(child: CoverImage(url: '${v.cover.backImageUrl}&w=480', width: 200, flat: true)),
      const SizedBox(height: 14),
      Text(l.title, style: AppText.serif(context, size: 21, weight: FontWeight.w500)),
      const SizedBox(height: 2),
      Text(l.text, textAlign: TextAlign.center, style: TextStyle(fontSize: 13, height: 1.4, color: c.textMuted)),
    ]);
  }

  /// Развёртка целиком (оборот + корешок + лицо) из серверного рендера печати: нажатие на левую/правую сторону выбирает её.
  Widget _spreadStage(v1api.CoverView v) {
    final c = context.c;
    final backend = context.read<ClientSession>().backend;
    final url = '${v.cover.spreadImageUrl!}&w=900';
    return Column(children: [
      ClipRRect(
        borderRadius: BorderRadius.circular(4),
        child: Stack(children: [
          Image.network(
            backend.url(url),
            headers: backend.imageHeaders,
            width: double.infinity,
            fit: BoxFit.contain,
            gaplessPlayback: true,
            errorBuilder: (_, _, _) => Container(height: 160, color: c.surface),
          ),
          Positioned.fill(
            child: Row(children: [
              Expanded(
                child: GestureDetector(
                  behavior: HitTestBehavior.translucent,
                  onTap: () => _side(true),
                  child: Container(
                    decoration: BoxDecoration(border: _back ? Border.all(color: c.brand, width: 2) : null),
                  ),
                ),
              ),
              Expanded(
                child: GestureDetector(
                  behavior: HitTestBehavior.translucent,
                  onTap: () => _side(false),
                  child: Container(
                    decoration: BoxDecoration(border: !_back ? Border.all(color: c.brand, width: 2) : null),
                  ),
                ),
              ),
            ]),
          ),
        ]),
      ),
      if (v.designer != null) ...[
        const SizedBox(height: 8),
        Text(v.designer!.labels.views.spreadHint, textAlign: TextAlign.center, style: TextStyle(fontSize: 12.5, color: c.textMuted)),
      ],
    ]);
  }

  Widget _designs(v1api.CoverView v) {
    final c = context.c;
    final cover = v.cover;
    final l = v.labels;
    final designer = v.designer;
    final all = v.templates;
    final moods = v.moods.where((m) => m.id == 'all' || all.any((t) => t.mood == m.id)).toList();
    var list = all.where((t) => _mood == 'all' || t.mood == _mood || t.id == cover.template).toList();
    list.sort((a, b) => (b.id == cover.template ? 1 : 0) - (a.id == cover.template ? 1 : 0));
    final more = _mood == 'all' && !_allDesigns && list.length > l.shown;
    if (more) list = list.take(l.shown).toList();
    final noPhotos = (_photos?.photos ?? const []).isEmpty;
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Text(l.variants, style: TextStyle(fontSize: 12.5, color: c.textMuted, fontFeatures: const [FontFeature.tabularFigures()])),
      const SizedBox(height: 10),
      SingleChildScrollView(
        scrollDirection: Axis.horizontal,
        child: Row(children: [
          for (final m in moods)
            Padding(
              padding: const EdgeInsets.only(right: 6),
              child: _Chip(label: m.label, on: _mood == m.id, onTap: () => setState(() => _mood = m.id)),
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
                onCover: l.onCover,
                needsPhoto: t.photoSlots > 0 && noPhotos,
                url: t.photoSlots > 0 && !noPhotos
                    ? '/api/books/$_bookId/cover-thumb/${t.id}?v=${Object.hash(Object.hashAll(cover.photoIds), cover.lines, (_photos?.photos ?? const []).length)}'
                    : t.previewUrl,
                mood: _moodName(v, t.mood),
                onTap: cover.editable && (cover.hasDesign || t.id != cover.template) ? () => _choose(t) : null,
              ),
            ),
        ]);
      }),
      if (more) ...[
        const SizedBox(height: 18),
        CabinetButton(label: l.showAll, kind: CabBtn.outline, large: false, onPressed: () => setState(() => _allDesigns = true)),
      ],
      if (designer != null && !cover.hasDesign && cover.editable) ...[
        const SizedBox(height: 22),
        _DesignerCtaCard(
          title: designer.labels.cta.title,
          text: designer.labels.cta.text,
          button: designer.labels.cta.open,
          onTap: () => _openDesigner(backSide: false),
        ),
      ],
    ]);
  }

  Widget _coverPhotos(v1api.CoverView v, int slots) {
    final c = context.c;
    final cover = v.cover;
    final l = v.labels.photo;
    final designer = v.designer;
    final photos = _photos?.photos ?? const <v1api.CabPhoto>[];
    final chosen = [...cover.photoIds];
    while (chosen.length < slots) {
      chosen.add(null);
    }
    final slot = _slot.clamp(0, slots - 1);
    final frameKey = 'cover:$slot';
    final hasChosenInSlot = slot < chosen.length && chosen[slot] != null;

    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Text(l.title, style: const TextStyle(fontSize: 13.5, fontWeight: FontWeight.w600)),
      if (slots > 1) ...[
        const SizedBox(height: 10),
        Wrap(spacing: 8, runSpacing: 8, children: [
          for (var i = 0; i < slots && i < l.slots.length; i++) _Chip(label: l.slots[i], on: slot == i, onTap: () => setState(() => _slot = i)),
        ]),
        const SizedBox(height: 8),
        Text(l.slotsHint, style: TextStyle(fontSize: 13, height: 1.4, color: c.textMuted)),
      ],
      const SizedBox(height: 12),
      if (photos.isEmpty)
        Text(l.uploadFirst, style: TextStyle(fontSize: 14, color: c.textMuted))
      else
        _PhotoGrid(
          photos: photos,
          badge: (id) {
            final i = chosen.indexOf(id);
            return i < 0 || i >= slots ? null : (slots > 1 ? '${i + 1}' : '');
          },
          onTap: cover.editable ? (p) => _pickCoverPhoto(p.id, slots) : null,
        ),
      if (hasChosenInSlot && designer != null && cover.editable) ...[
        const SizedBox(height: 16),
        _PhotoFrameCard(
          catalog: designer,
          frame: _frameFor(frameKey),
          onChanged: (f) => _updatePhotoFrame(frameKey, f),
        ),
      ],
      const SizedBox(height: 12),
      Text(l.note, style: TextStyle(fontSize: 12.5, height: 1.4, color: c.textFaint)),
    ]);
  }

  Widget _texts(v1api.CoverView v) {
    final c = context.c;
    final cover = v.cover;
    final l = v.labels.text;
    final designer = v.designer;
    final max = v.limits;
    final on = cover.editable && !cover.hasDesign;
    final autobiography = cover.kind == 'autobiography';
    final swapped = !autobiography && cover.authorName.trim().isNotEmpty && cover.recipientName.trim().isNotEmpty ? '${cover.recipientName.trim()} & ${cover.authorName.trim()}' : null;

    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      _Field(label: l.bookTitle, controller: _title, max: max.title, enabled: on, onChanged: (s) => _text(v1api.CoverPatch(title: s))),
      const SizedBox(height: 16),
      _Field(label: l.subtitle, hint: l.subtitlePlaceholder, controller: _subtitle, max: max.subtitle, enabled: on, onChanged: (s) => _text(v1api.CoverPatch(subtitle: s))),
      const SizedBox(height: 16),
      _Field(label: l.author, controller: _author, max: max.authorName, enabled: on, onChanged: (s) => _text(v1api.CoverPatch(authorName: s))),
      const SizedBox(height: 16),
      if (autobiography) ...[
        _Field(label: l.recordedBy, hint: l.recordedByPlaceholder, controller: _recordedBy, max: max.recordedBy, enabled: on, onChanged: (s) => _text(v1api.CoverPatch(recordedBy: s))),
        const SizedBox(height: 10),
        Text(l.recipientNone, style: TextStyle(fontSize: 13, color: c.textMuted)),
      ] else ...[
        _Field(label: cover.recipientLabel ?? '', controller: _recipient, max: max.recipientName, enabled: on, onChanged: (s) => _text(v1api.CoverPatch(recipientName: s))),
        _Check(value: cover.hideRecipientOnCover, title: l.hideRecipient, onChanged: on ? (b) => _save(v1api.CoverPatch(hideRecipientOnCover: b)) : null),
      ],
      const SizedBox(height: 14),
      _Field(label: l.namesOnCover, hint: cover.autoNames, controller: _names, max: max.namesOnCover, enabled: on, onChanged: (s) => _text(v1api.CoverPatch(namesOnCover: s))),
      const SizedBox(height: 6),
      Text(l.namesOnCoverText, style: TextStyle(fontSize: 12.5, color: c.textMuted)),
      if (designer != null && on) ...[
        Wrap(spacing: 8, children: [
          if (swapped != null && _names.text.trim() != swapped)
            TextButton(
              onPressed: () {
                _names.text = swapped;
                _save(v1api.CoverPatch(namesOnCover: swapped));
              },
              child: Text(designer.labels.namesSwap),
            ),
          if (_names.text.trim().isNotEmpty)
            TextButton(
              onPressed: () {
                _names.clear();
                _save(const v1api.CoverPatch(namesOnCover: ''));
              },
              child: Text(designer.labels.namesAuto),
            ),
        ]),
      ],
      const SizedBox(height: 10),
      _Check(value: cover.lines, title: l.coverLines, hint: l.coverLinesHint, onChanged: on ? (b) => _save(v1api.CoverPatch(coverLines: b)) : null),
    ]);
  }

  /// Вкладка «Фон» оборота: «Как спереди» или «Свой цвет» (палитра с цветами лица первыми + переход в конструктор).
  Widget _backFill(v1api.CoverView v) {
    final c = context.c;
    final cover = v.cover;
    final designer = v.designer!;
    final bf = designer.labels.backFill;
    final bg = cover.coverBack?.background ?? const v1api.CoverBackground(kind: 'template');
    final linked = bg.kind == 'template';
    final ownColor = bg.kind == 'color' ? bg.color : (bg.kind == 'gradient' ? bg.from : null);
    final swatches = designer.backSwatches;

    Widget radioCard({required bool active, required String label, required Color preview, required VoidCallback? onTap}) => InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(Cab.ctl),
          child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
            decoration: BoxDecoration(
              color: active ? c.bubbleOut : c.surfaceRaised,
              borderRadius: BorderRadius.circular(Cab.ctl),
              border: Border.all(color: active ? c.brand : c.border, width: active ? 1.5 : 1),
            ),
            child: Row(children: [
              Container(width: 24, height: 24, decoration: BoxDecoration(color: preview, borderRadius: BorderRadius.circular(6), border: Border.all(color: c.border))),
              const SizedBox(width: 10),
              Expanded(child: Text(label, style: TextStyle(fontSize: 14.5, fontWeight: active ? FontWeight.w600 : FontWeight.w500, color: active ? c.brand : c.text))),
              if (active) Icon(LucideIcons.check, size: 16, color: c.brand),
            ]),
          ),
        );

    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Text(bf.title, style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w600)),
      const SizedBox(height: 10),
      radioCard(
        active: linked,
        label: bf.likeFront,
        preview: CoverDesignerLogic.parseHex(cover.templateBaseColor, fallback: c.surface),
        onTap: cover.editable ? () => _setBackFill(const v1api.CoverBackground(kind: 'template')) : null,
      ),
      const SizedBox(height: 8),
      radioCard(
        active: !linked,
        label: bf.own,
        preview: CoverDesignerLogic.parseHex(ownColor ?? (swatches.isNotEmpty ? swatches.first : '#1F1A17')),
        onTap: cover.editable ? () => _setBackFill(v1api.CoverBackground(kind: 'color', color: ownColor ?? (swatches.isNotEmpty ? swatches.first : '#1F1A17'))) : null,
      ),
      const SizedBox(height: 10),
      Text(linked ? bf.likeFrontNote : bf.ownNote, style: TextStyle(fontSize: 13, color: c.textMuted)),
      if (!linked && cover.editable) ...[
        const SizedBox(height: 14),
        Text(bf.color, style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: c.textMuted)),
        const SizedBox(height: 8),
        Wrap(spacing: 8, runSpacing: 8, children: [
          for (final hex in swatches)
            GestureDetector(
              onTap: () => _setBackFill(v1api.CoverBackground(kind: 'color', color: hex)),
              child: Container(
                width: 32,
                height: 32,
                decoration: BoxDecoration(
                  color: CoverDesignerLogic.parseHex(hex),
                  shape: BoxShape.circle,
                  border: Border.all(color: ownColor?.toUpperCase() == hex.toUpperCase() ? c.brand : c.border, width: ownColor?.toUpperCase() == hex.toUpperCase() ? 3 : 1),
                ),
              ),
            ),
        ]),
        const SizedBox(height: 6),
        Text(bf.frontColors, style: TextStyle(fontSize: 12, color: c.textMuted)),
      ],
      if (cover.editable || (cover.hasBackDesign ?? false)) ...[
        const SizedBox(height: 14),
        TextButton(
          onPressed: () => _openDesigner(backSide: true),
          child: Text(bf.more, style: TextStyle(color: c.brand)),
        ),
      ],
    ]);
  }

  Widget _variant(v1api.CoverView v) {
    final c = context.c;
    final cover = v.cover;
    final designer = v.designer;
    final backLayered = cover.hasBackDesign ?? false;
    if (backLayered && designer != null) {
      return Text(designer.labels.backCta.active, style: TextStyle(fontSize: 14, color: c.textMuted));
    }
    final l = v.labels.back;
    final layouts = v.backLayouts;
    final layout = _backLayout(cover.backLayout) ?? layouts.first;
    final need = layout.photos;
    final photos = _photos?.photos ?? const <v1api.CabPhoto>[];
    final activeBackSlot = _backFrameSlot.clamp(0, _backIds.isEmpty ? 0 : _backIds.length - 1);

    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      LayoutBuilder(builder: (context, box) {
        const gap = 10.0;
        final w = (box.maxWidth - gap) / 2;
        return Wrap(spacing: gap, runSpacing: gap, children: [
          for (final x in layouts)
            SizedBox(
              width: w,
              child: _LayoutCard(name: x.name, hint: x.hint, on: x.id == layout.id, onTap: cover.editable && x.id != layout.id ? () => _pickBackLayout(x.id) : null),
            ),
        ]);
      }),
      const SizedBox(height: 18),
      if (layout.label == null)
        Text(layout.note ?? '', style: TextStyle(fontSize: 14, color: c.textMuted))
      else ...[
        _Field(
          label: layout.label!,
          hint: layout.placeholder,
          controller: _backText,
          max: v.limits.backText,
          lines: 3,
          enabled: cover.editable,
          onChanged: (s) => _text(v1api.CoverPatch(backText: s)),
        ),
        if (l.signed != null) Padding(padding: const EdgeInsets.only(top: 6), child: Text(l.signed!, style: TextStyle(fontSize: 12.5, color: c.textMuted))),
      ],
      if (need > 0) ...[
        const SizedBox(height: 18),
        Text(layout.photosLabel ?? '', style: const TextStyle(fontSize: 13.5, fontWeight: FontWeight.w600)),
        const SizedBox(height: 10),
        if (photos.isEmpty)
          Text(l.noPhotos, style: TextStyle(fontSize: 14, color: c.textMuted))
        else ...[
          _PhotoGrid(
            photos: photos,
            badge: (id) {
              final i = _backIds.indexOf(id);
              return i < 0 || i >= need ? null : (need > 1 ? '${i + 1}' : '');
            },
            onTap: cover.editable ? (p) => _toggleBackPhoto(p.id, need) : null,
          ),
          if (_backIds.isNotEmpty && designer != null && cover.editable) ...[
            const SizedBox(height: 14),
            if (_backIds.length > 1) ...[
              Wrap(spacing: 6, children: [
                for (var i = 0; i < _backIds.length && i < need; i++)
                  _Chip(
                    label: '${designer.labels.frame.slotPrefix} ${i + 1}',
                    on: activeBackSlot == i,
                    onTap: () => setState(() => _backFrameSlot = i),
                  ),
              ]),
              const SizedBox(height: 8),
            ],
            _PhotoFrameCard(
              catalog: designer,
              frame: _frameFor('back:$activeBackSlot'),
              onChanged: (f) => _updatePhotoFrame('back:$activeBackSlot', f),
            ),
          ],
        ],
      ],
      if (designer != null && cover.editable) ...[
        const SizedBox(height: 22),
        _DesignerCtaCard(
          title: designer.labels.backCta.title,
          text: designer.labels.backCta.text,
          button: designer.labels.backCta.open,
          onTap: () => _openDesigner(backSide: true),
        ),
      ],
    ]);
  }
}

/// Переключатель из двух сегментов («Лицо / Оборот», «Готовые дизайны / Конструктор», «Плоско / Целиком»).
class _PillToggle extends StatelessWidget {
  const _PillToggle({
    required this.value,
    required this.leftLabel,
    required this.rightLabel,
    required this.onChanged,
    this.rightEnabled = true,
  });

  final bool value;
  final String leftLabel;
  final String rightLabel;
  final bool rightEnabled;
  final ValueChanged<bool> onChanged;

  @override
  Widget build(BuildContext context) {
    final c = context.c;
    Widget item(String label, bool target, bool enabled) => GestureDetector(
          onTap: enabled ? () => onChanged(target) : null,
          child: AnimatedContainer(
            duration: const Duration(milliseconds: 180),
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
            decoration: BoxDecoration(
              color: value == target ? c.surfaceRaised : Colors.transparent,
              borderRadius: BorderRadius.circular(10),
              boxShadow: value == target ? [BoxShadow(color: Colors.black.withValues(alpha: 0.06), blurRadius: 4)] : null,
            ),
            child: Text(
              label,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              textAlign: TextAlign.center,
              style: TextStyle(
                fontSize: 13,
                fontWeight: FontWeight.w500,
                color: !enabled ? c.textFaint : (value == target ? c.text : c.textMuted),
              ),
            ),
          ),
        );
    return Container(
      padding: const EdgeInsets.all(3),
      decoration: BoxDecoration(color: c.surface, borderRadius: BorderRadius.circular(12)),
      child: Row(mainAxisSize: MainAxisSize.min, children: [
        Flexible(child: item(leftLabel, false, true)),
        Flexible(child: item(rightLabel, true, rightEnabled)),
      ]),
    );
  }
}

/// Карточка приглашения в конструктор (как designerCard в CoverEditor.tsx).
class _DesignerCtaCard extends StatelessWidget {
  const _DesignerCtaCard({required this.title, required this.text, required this.button, required this.onTap});
  final String title;
  final String text;
  final String button;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final c = context.c;
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(color: c.surfaceRaised, borderRadius: BorderRadius.circular(Cab.panel), border: Border.all(color: c.border)),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Container(
            width: 34,
            height: 34,
            decoration: BoxDecoration(color: c.bubbleOut, borderRadius: BorderRadius.circular(Cab.ctl)),
            child: Icon(LucideIcons.layers, size: 18, color: c.brand),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(title, style: const TextStyle(fontSize: 14.5, fontWeight: FontWeight.w600)),
              const SizedBox(height: 3),
              Text(text, style: TextStyle(fontSize: 13, height: 1.35, color: c.textMuted)),
            ]),
          ),
        ]),
        const SizedBox(height: 12),
        CabinetButton(label: button, kind: CabBtn.dark, large: false, onPressed: onTap),
      ]),
    );
  }
}

/// Плашка «обложка собрана в конструкторе» с действиями «Открыть» и «Сбросить».
class _DesignerActiveBanner extends StatelessWidget {
  const _DesignerActiveBanner({required this.text, required this.openLabel, required this.onOpen, this.resetLabel, this.onReset});
  final String text;
  final String openLabel;
  final String? resetLabel;
  final VoidCallback onOpen;
  final VoidCallback? onReset;

  @override
  Widget build(BuildContext context) {
    final c = context.c;
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(color: c.bubbleOut, borderRadius: BorderRadius.circular(Cab.panel)),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Icon(LucideIcons.layers, size: 17, color: c.brand),
          const SizedBox(width: 10),
          Expanded(child: Text(text, style: TextStyle(fontSize: 13.5, height: 1.4, color: c.text))),
        ]),
        const SizedBox(height: 10),
        Wrap(spacing: 8, runSpacing: 8, children: [
          FilledButton(onPressed: onOpen, child: Text(openLabel)),
          if (resetLabel != null && onReset != null) TextButton(onPressed: onReset, child: Text(resetLabel!)),
        ]),
      ]),
    );
  }
}

/// Кадрирование фото слота (масштаб и положение X/Y) в режиме «Готовые дизайны» и на обороте.
class _PhotoFrameCard extends StatefulWidget {
  const _PhotoFrameCard({required this.catalog, required this.frame, required this.onChanged});
  final v1api.CoverDesignerCatalog catalog;
  final v1api.CoverPhotoFrame frame;
  final ValueChanged<v1api.CoverPhotoFrame?> onChanged;

  @override
  State<_PhotoFrameCard> createState() => _PhotoFrameCardState();
}

class _PhotoFrameCardState extends State<_PhotoFrameCard> {
  late v1api.CoverPhotoFrame _local;

  @override
  void initState() {
    super.initState();
    _local = widget.frame;
  }

  @override
  void didUpdateWidget(covariant _PhotoFrameCard oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.frame.zoom != widget.frame.zoom || oldWidget.frame.x != widget.frame.x || oldWidget.frame.y != widget.frame.y) {
      _local = widget.frame;
    }
  }

  @override
  Widget build(BuildContext context) {
    final c = context.c;
    final fl = widget.catalog.labels.frame;
    final pl = widget.catalog.labels.props;
    final lim = widget.catalog.limits;
    final isDefault = _local.zoom == 1 && _local.x == 0.5 && _local.y == 0.5;
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(color: c.surfaceRaised, borderRadius: BorderRadius.circular(Cab.panel), border: Border.all(color: c.border)),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(children: [
          Expanded(child: Text(fl.title, style: const TextStyle(fontSize: 13.5, fontWeight: FontWeight.w600))),
          if (!isDefault)
            TextButton(
              onPressed: () {
                setState(() => _local = const v1api.CoverPhotoFrame(zoom: 1, x: 0.5, y: 0.5));
                widget.onChanged(null);
              },
              child: Text(fl.reset),
            ),
        ]),
        Text(fl.hint, style: TextStyle(fontSize: 12, color: c.textMuted)),
        const SizedBox(height: 6),
        Row(children: [
          Expanded(child: Text(fl.zoom, style: TextStyle(fontSize: 12.5, color: c.textMuted))),
          Text('${(_local.zoom * 100).round()}${pl.pct}', style: TextStyle(fontSize: 12, color: c.textMuted)),
        ]),
        Slider(
          value: _local.zoom.clamp(lim.frameZoomMin, lim.frameZoomMax),
          min: lim.frameZoomMin,
          max: lim.frameZoomMax,
          onChanged: (z) => setState(() => _local = v1api.CoverPhotoFrame(zoom: z, x: _local.x, y: _local.y)),
          onChangeEnd: (z) => widget.onChanged(v1api.CoverPhotoFrame(zoom: z, x: _local.x, y: _local.y)),
        ),
        Row(children: [
          Expanded(child: Text(pl.x, style: TextStyle(fontSize: 12.5, color: c.textMuted))),
          Text('${(_local.x * 100).round()}${pl.pct}', style: TextStyle(fontSize: 12, color: c.textMuted)),
        ]),
        Slider(
          value: _local.x.clamp(0, 1),
          min: 0,
          max: 1,
          onChanged: (x) => setState(() => _local = v1api.CoverPhotoFrame(zoom: _local.zoom, x: x, y: _local.y)),
          onChangeEnd: (x) => widget.onChanged(v1api.CoverPhotoFrame(zoom: _local.zoom, x: x, y: _local.y)),
        ),
        Row(children: [
          Expanded(child: Text(pl.y, style: TextStyle(fontSize: 12.5, color: c.textMuted))),
          Text('${(_local.y * 100).round()}${pl.pct}', style: TextStyle(fontSize: 12, color: c.textMuted)),
        ]),
        Slider(
          value: _local.y.clamp(0, 1),
          min: 0,
          max: 1,
          onChanged: (y) => setState(() => _local = v1api.CoverPhotoFrame(zoom: _local.zoom, x: _local.x, y: y)),
          onChangeEnd: (y) => widget.onChanged(v1api.CoverPhotoFrame(zoom: _local.zoom, x: _local.x, y: y)),
        ),
      ]),
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
  const _DesignTile({required this.t, required this.url, required this.on, required this.onCover, required this.needsPhoto, required this.mood, required this.onTap});
  final v1api.CoverTemplate t;
  final String onCover;
  final String url;
  final bool on;
  final bool needsPhoto;
  final String mood;
  final VoidCallback? onTap;

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
              border: on ? Border.all(color: c.brand, width: 2) : null,
              boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: on ? 0.10 : 0.16), blurRadius: 10, offset: const Offset(0, 4))],
            ),
            padding: on ? const EdgeInsets.all(2) : EdgeInsets.zero,
            child: ClipRRect(
              borderRadius: BorderRadius.circular(2),
              child: Stack(fit: StackFit.expand, children: [
                CoverArt(url: url),
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
                Flexible(child: Text(onCover, maxLines: 1, overflow: TextOverflow.ellipsis, style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: c.brand))),
              ])
            : Text(mood, maxLines: 1, overflow: TextOverflow.ellipsis, style: TextStyle(fontSize: 12, color: c.textMuted)),
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
