import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:http/http.dart' as http;
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:provider/provider.dart';

import '../../api/mybook_api.g.dart' as v1api;
import '../../core/api.dart';
import '../../ui/kit.dart';
import '../../ui/tokens.dart';
import '../data/backend.dart';
import '../data/session.dart';
import '../ui/book_chrome.dart';
import '../ui/cabinet.dart';
import 'book_stages.dart';

/// «Страницы» — вторая половина шага «Оформить», как на сайте (/books/[id]/pages, PagesEditor): сверху переключатель
/// «Обложка · Страницы», сцена — разворот книги (Глава, Титул, Оглавление, Фото) картинкой той же вёрстки, что печать,
/// ниже вкладки «Состав книги», «Стили», «Шрифты». Все подписи, каталоги и числа — с сервера (API v1 pagesGet).
/// Правка сохраняется сразу (текст — через 600 мс, как автосохранение сайта), сервер отдаёт новые развороты.
class PagesScreen extends StatefulWidget {
  const PagesScreen({super.key, required this.hub});
  final v1api.CabinetBook hub;

  @override
  State<PagesScreen> createState() => _PagesScreenState();
}

/// Задержка автосохранения текста — как useAutosave(…, 600) у PagesEditor сайта.
const _autosave = Duration(milliseconds: 600);

class _PagesScreenState extends State<PagesScreen> {
  late final ClientBackend _backend = context.read<ClientSession>().backend;
  v1api.PagesView? _v;
  String? _error;
  String _spread = 'chapter';
  String _tab = 'content';
  String? _open;
  bool _saving = false;
  String? _notice;
  Timer? _textTimer;
  final _dedication = TextEditingController();
  final _endText = TextEditingController();

  /// «Своя фраза» остаётся выбранной, даже пока поле пустое (как endMode сайта).
  String? _endMode;

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _textTimer?.cancel();
    _dedication.dispose();
    _endText.dispose();
    super.dispose();
  }

  void _apply(v1api.PagesView v) {
    _v = v;
    _error = null;
    if (_dedication.text != v.state.dedication && !_textTimer.isActiveOrFalse) _dedication.text = v.state.dedication;
    if (_endText.text != (v.state.endText ?? '') && !_textTimer.isActiveOrFalse) _endText.text = v.state.endText ?? '';
    _endMode ??= v.state.endText == null ? 'default' : (v.state.endText!.trim().isEmpty ? 'none' : 'custom');
    if (!v.spreads.any((s) => s.kind == _spread)) _spread = v.spreads.first.kind;
  }

  Future<void> _load() async {
    try {
      final v = await _backend.call(() => _backend.contract.pagesGet(bookId: widget.hub.id));
      if (mounted) setState(() => _apply(v));
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    }
  }

  Future<void> _save(v1api.PagesPatch patch) async {
    final v = _v;
    if (v == null || !v.editable) return;
    final hadCustom = v.state.customCount > 0;
    setState(() => _saving = true);
    try {
      final next = await _backend.call(() => _backend.contract.pagesUpdate(bookId: widget.hub.id, body: patch));
      if (!mounted) return;
      setState(() {
        // Смена стиля сбросила свои настройки — сказать, как сайт.
        _notice = patch.interior != null && hadCustom && next.state.customCount == 0 ? next.labels.styles.reset : _notice;
        _apply(next);
      });
    } on ApiException catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  void _saveText(v1api.PagesPatch Function() patch) {
    _textTimer?.cancel();
    _textTimer = Timer(_autosave, () => _save(patch()));
  }

  String _img(String url, int width) => _backend.url('$url&w=$width');

  @override
  Widget build(BuildContext context) {
    final c = context.c;
    final h = widget.hub;
    final v = _v;
    return Scaffold(
      backgroundColor: c.bg,
      appBar: BookHeader(bookId: h.id, title: h.title, kind: h.kind, coverUrl: h.coverThumbUrl),
      body: Column(children: [
        BookStageTabs(hub: h, active: 'design'),
        Expanded(
          child: v == null
              ? (_error == null
                  ? const Center(child: CircularProgressIndicator())
                  : EmptyState(icon: LucideIcons.wifiOff, title: _error!, action: MaterialLocalizations.of(context).refreshIndicatorSemanticLabel, onAction: _load))
              : _body(v),
        ),
      ]),
    );
  }

  Widget _body(v1api.PagesView v) {
    final c = context.c;
    final big = v.imageWidths.last;
    final spread = v.spreads.firstWhere((s) => s.kind == _spread, orElse: () => v.spreads.first);
    final media = MediaQuery.of(context);
    // Сцена и вкладки закреплены сверху, как на телефоне у сайта (StudioFrame: sticky), — правку видно на развороте.
    // С клавиатурой разворот ниже, чтобы поле ввода оставалось на экране.
    final full = (media.size.width - 32) / v.spreadAspect;
    final imageH = media.viewInsets.bottom > 0 ? full.clamp(0.0, 150.0) : full;
    const segH = 40.0, tabsH = 46.0, gap = 10.0;
    final stage = Container(
      color: c.bg,
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 0),
      child: Column(children: [
        SizedBox(height: segH, child: _Segmented(options: [for (final s in v.spreads) (s.kind, s.label)], value: spread.kind, onChanged: (k) => setState(() => _spread = k))),
        const SizedBox(height: gap),
        SizedBox(
          height: imageH,
          child: Center(child: AspectRatio(aspectRatio: v.spreadAspect, child: _SpreadImage(url: _img(spread.imageUrl, big), headers: _backend.imageHeaders, aspect: v.spreadAspect))),
        ),
        const SizedBox(height: gap),
        SizedBox(
          height: tabsH,
          child: _Tabs(
            tabs: [('content', v.labels.tabs.content), ('styles', v.labels.tabs.styles), ('fonts', v.labels.tabs.fonts)],
            value: _tab,
            onChanged: (t) => setState(() => _tab = t),
          ),
        ),
      ]),
    );
    return CustomScrollView(
      keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
      slivers: [
        SliverPadding(
          padding: const EdgeInsets.fromLTRB(16, 16, 16, 8),
          sliver: SliverToBoxAdapter(
            child: Row(children: [
              Expanded(child: DesignSwitch(hub: widget.hub, active: 'pages', cover: v.labels.designSwitch.cover, pages: v.labels.designSwitch.pages)),
              if (_saving) SizedBox.square(dimension: 16, child: CircularProgressIndicator(strokeWidth: 2, color: c.textMuted)),
            ]),
          ),
        ),
        SliverPersistentHeader(pinned: true, delegate: _Pinned(extent: 8 + segH + gap + imageH + gap + tabsH, child: stage)),
        SliverPadding(
          padding: const EdgeInsets.fromLTRB(16, 18, 16, 48),
          sliver: SliverToBoxAdapter(
            child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
              if (_notice != null) ...[
                Container(
                  padding: const EdgeInsets.all(14),
                  decoration: BoxDecoration(color: c.surface, borderRadius: BorderRadius.circular(14)),
                  child: Text(_notice!, style: TextStyle(fontSize: 14, height: 1.4, color: c.text.withValues(alpha: 0.85))),
                ),
                const SizedBox(height: 16),
              ],
              IgnorePointer(
                ignoring: !v.editable,
                child: Opacity(
                  opacity: v.editable ? 1 : 0.6,
                  child: switch (_tab) {
                    'styles' => _StylesTab(view: v, img: _img, headers: _backend.imageHeaders, onPick: (id) => _save(v1api.PagesPatch(interior: id))),
                    'fonts' => _FontsTab(view: v, backend: _backend, onPick: (id) => _save(v1api.PagesPatch(fontPair: id))),
                    _ => _content(v),
                  },
                ),
              ),
            ]),
          ),
        ),
      ],
    );
  }

  /// «Состав книги» — лента сайта: титул и посвящение, оглавление, последняя страница; правило фото — одной строкой.
  Widget _content(v1api.PagesView v) {
    final c = context.c;
    final l = v.labels.content;
    final s = v.state;
    final endMeta = _endMode == 'custom' ? (s.endText?.trim().isNotEmpty == true ? s.endText!.trim() : l.endModes.firstWhere((m) => m.id == 'custom').label) : l.endModes.firstWhere((m) => m.id == _endMode).label;
    Widget hint(String t) => Text(t, style: TextStyle(fontSize: 12.5, height: 1.4, color: c.textMuted));
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      _GroupTitle(l.start),
      _RibbonItem(
        title: l.front,
        meta: _dedication.text.trim().isNotEmpty ? l.frontSet : l.frontEmpty,
        open: _open == 'front',
        onToggle: () => setState(() {
          _open = _open == 'front' ? null : 'front';
          if (_open == 'front') _spread = 'front';
        }),
        children: [
          Text(l.dedication, style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w500)),
          const SizedBox(height: 6),
          TextField(
            controller: _dedication,
            minLines: 3,
            maxLines: 6,
            maxLength: v.limits.dedication,
            onTap: () => setState(() => _spread = 'front'),
            onChanged: (t) {
              setState(() {});
              _saveText(() => v1api.PagesPatch(dedication: _dedication.text));
            },
            decoration: InputDecoration(hintText: l.dedicationPlaceholder, counterText: ''),
          ),
          const SizedBox(height: 6),
          hint(l.dedicationText),
        ],
      ),
      _RibbonItem(
        title: l.toc,
        meta: s.showToc ? l.tocOn : l.tocOff,
        open: _open == 'toc',
        onToggle: () => setState(() {
          _open = _open == 'toc' ? null : 'toc';
          if (_open == 'toc') _spread = 'toc';
        }),
        children: [
          _Check(
            value: s.showToc,
            label: l.tocLabel,
            onChanged: (on) {
              setState(() => _spread = 'toc');
              _save(v1api.PagesPatch(showToc: on));
            },
          ),
          if (s.showToc) hint(l.tocApprox),
        ],
      ),
      _RibbonItem(
        title: l.endTitle,
        meta: endMeta,
        open: _open == 'end',
        onToggle: () => setState(() {
          _open = _open == 'end' ? null : 'end';
          if (_open == 'end') _spread = 'toc';
        }),
        children: [
          for (final m in l.endModes)
            _Radio(
              selected: _endMode == m.id,
              label: m.label,
              onTap: () {
                setState(() {
                  _endMode = m.id;
                  _spread = 'toc';
                });
                // Своя фраза начинается с прежней (или с «Продолжение следует…»), чтобы её было что править.
                final text = m.id == 'default' ? null : (m.id == 'none' ? '' : (s.endText?.trim().isNotEmpty == true ? s.endText!.trim() : l.endDefault));
                if (text != null) _endText.text = text;
                _save(text == null ? const v1api.PagesPatch(nulls: {'endText'}) : v1api.PagesPatch(endText: text));
              },
            ),
          if (_endMode == 'custom') ...[
            const SizedBox(height: 8),
            Text(l.endLabel, style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w500)),
            const SizedBox(height: 6),
            TextField(
              controller: _endText,
              maxLength: v.limits.endText,
              onTap: () => setState(() => _spread = 'toc'),
              onChanged: (_) => _saveText(() => v1api.PagesPatch(endText: _endText.text)),
              decoration: InputDecoration(hintText: l.endPlaceholder, counterText: ''),
            ),
            const SizedBox(height: 6),
            hint(l.endHint),
          ] else if (_endMode == 'none') ...[
            const SizedBox(height: 4),
            hint(l.endNoneHint),
          ],
        ],
      ),
      const SizedBox(height: 22),
      _GroupTitle(l.photos),
      Text(l.photosSummary, style: TextStyle(fontSize: 14.5, height: 1.45, color: c.text.withValues(alpha: 0.85))),
      TextButton(
        style: TextButton.styleFrom(padding: EdgeInsets.zero, foregroundColor: c.brand),
        onPressed: () => openBookStage(context, widget.hub, 'photos', from: 'design'),
        child: Text(l.photosLink, style: const TextStyle(fontWeight: FontWeight.w500)),
      ),
    ]);
  }
}

/// Закреплённая сцена: высота задана (min = max), содержимое — разворот и вкладки.
class _Pinned extends SliverPersistentHeaderDelegate {
  _Pinned({required this.extent, required this.child});
  final double extent;
  final Widget child;

  @override
  double get minExtent => extent;
  @override
  double get maxExtent => extent;
  @override
  Widget build(BuildContext context, double shrinkOffset, bool overlapsContent) => SizedBox(height: extent, child: child);
  @override
  bool shouldRebuild(_Pinned old) => true;
}

extension on Timer? {
  bool get isActiveOrFalse => this?.isActive ?? false;
}

/// Картинка разворота: пока новая версия грузится, остаётся прежняя (gaplessPlayback) — сцена не мигает.
class _SpreadImage extends StatelessWidget {
  const _SpreadImage({required this.url, required this.headers, required this.aspect});
  final String url;
  final Map<String, String> headers;
  final double aspect;

  @override
  Widget build(BuildContext context) {
    final c = context.c;
    return AspectRatio(
      aspectRatio: aspect,
      child: DecoratedBox(
        decoration: BoxDecoration(borderRadius: BorderRadius.circular(3), boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.14), blurRadius: 18, offset: const Offset(0, 8))]),
        child: ClipRRect(
          borderRadius: BorderRadius.circular(3),
          child: Image.network(
            url,
            headers: headers,
            fit: BoxFit.cover,
            gaplessPlayback: true,
            loadingBuilder: (_, child, p) => Stack(fit: StackFit.expand, children: [
              ColoredBox(color: c.surface),
              child,
              if (p != null) Center(child: SizedBox.square(dimension: 22, child: CircularProgressIndicator(strokeWidth: 2, color: c.textMuted))),
            ]),
            errorBuilder: (_, _, _) => ColoredBox(color: c.surface),
          ),
        ),
      ),
    );
  }
}

/// Библиотека стилей (StylesTab сайта): направления, поиск, миниатюры — разворот «Глава» на тексте книги в стиле;
/// нажатие выбирает стиль, кнопка в углу — крупный просмотр всех разворотов с «Выбрать этот стиль».
class _StylesTab extends StatefulWidget {
  const _StylesTab({required this.view, required this.img, required this.headers, required this.onPick});
  final v1api.PagesView view;
  final String Function(String url, int width) img;
  final Map<String, String> headers;
  final ValueChanged<String> onPick;

  @override
  State<_StylesTab> createState() => _StylesTabState();
}

class _StylesTabState extends State<_StylesTab> {
  String _filter = 'all';
  String _query = '';
  bool _all = false;

  @override
  Widget build(BuildContext context) {
    final c = context.c;
    final v = widget.view;
    final l = v.labels.styles;
    final current = v.state.interior;
    final q = _query.trim().toLowerCase();
    final shown = v.styles.items.where((d) {
      if (_filter == 'cover' && !d.forCover) return false;
      if (_filter != 'all' && _filter != 'cover' && d.direction != _filter) return false;
      return q.isEmpty || '${d.name} ${d.description} ${d.directionLabel}'.toLowerCase().contains(q);
    }).toList();
    final collapsed = _filter == 'all' && q.isEmpty && !_all && shown.length > v.styles.shown;
    final visible = collapsed ? [for (var i = 0; i < shown.length; i++) if (i < v.styles.shown || shown[i].id == current) shown[i]] : shown;
    // Миниатюра на всю ширину телефона — крупная картинка (мелкая расплывается на экране @3x).
    final width = MediaQuery.sizeOf(context).width * MediaQuery.devicePixelRatioOf(context) > v.imageWidths.first ? v.imageWidths.last : v.imageWidths.first;
    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      TextField(
        onChanged: (t) => setState(() => _query = t),
        decoration: InputDecoration(hintText: l.search, prefixIcon: Icon(LucideIcons.search, size: 18, color: c.textMuted), isDense: true),
      ),
      const SizedBox(height: 12),
      SingleChildScrollView(
        scrollDirection: Axis.horizontal,
        child: Row(children: [
          for (final f in v.styles.filters)
            Padding(
              padding: const EdgeInsets.only(right: 6),
              child: _Chip(label: f.label, on: _filter == f.id, icon: f.id == 'cover' ? LucideIcons.sparkles : null, onTap: () => setState(() => _filter = f.id)),
            ),
        ]),
      ),
      const SizedBox(height: 18),
      if (visible.isEmpty) Text(l.empty, style: TextStyle(fontSize: 14, color: c.textMuted)),
      for (final d in visible) ...[
        _StyleCard(
          style: d,
          active: d.id == current,
          labels: l,
          url: widget.img(d.imageUrl, width),
          headers: widget.headers,
          aspect: v.spreadAspect,
          onPick: () => widget.onPick(d.id),
          onOpen: () => _preview(d),
        ),
        const SizedBox(height: 26),
      ],
      if (collapsed)
        OutlinedButton(onPressed: () => setState(() => _all = true), child: Text(l.showAll)),
    ]);
  }

  /// Крупный просмотр стиля: все развороты на содержимом книги, внизу — «Выбрать этот стиль».
  void _preview(v1api.PagesStyle d) {
    final v = widget.view;
    final active = d.id == v.state.interior;
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: context.c.bg,
      builder: (ctx) {
        final c = ctx.c;
        return DraggableScrollableSheet(
          expand: false,
          initialChildSize: 0.92,
          maxChildSize: 0.96,
          builder: (_, scroll) => ListView(
            controller: scroll,
            padding: const EdgeInsets.fromLTRB(16, 20, 16, 32),
            children: [
              Text(d.previewTitle, style: AppText.serif(ctx, size: 26, weight: FontWeight.w500)),
              const SizedBox(height: 4),
              Text(d.description, style: TextStyle(fontSize: 14, color: c.textMuted)),
              const SizedBox(height: 2),
              Text(v.labels.styles.previewText, style: TextStyle(fontSize: 12.5, color: c.textMuted)),
              const SizedBox(height: 18),
              for (final s in v.spreads) ...[
                _SpreadImage(url: widget.img(s.imageUrl.replaceFirst('kind=${s.kind}', 'kind=${s.kind}&design=${d.id}'), v.imageWidths.last), headers: widget.headers, aspect: v.spreadAspect),
                const SizedBox(height: 18),
              ],
              CabinetButton(
                label: active ? v.labels.styles.current : v.labels.styles.apply,
                icon: active ? LucideIcons.check : null,
                large: false,
                onPressed: active
                    ? null
                    : () {
                        Navigator.of(ctx).pop();
                        widget.onPick(d.id);
                      },
              ),
            ],
          ),
        );
      },
    );
  }
}

class _StyleCard extends StatelessWidget {
  const _StyleCard({required this.style, required this.active, required this.labels, required this.url, required this.headers, required this.aspect, required this.onPick, required this.onOpen});
  final v1api.PagesStyle style;
  final bool active;
  final v1api.PagesViewLabelsStyles labels;
  final String url;
  final Map<String, String> headers;
  final double aspect;
  final VoidCallback onPick;
  final VoidCallback onOpen;

  @override
  Widget build(BuildContext context) {
    final c = context.c;
    return GestureDetector(
      behavior: HitTestBehavior.opaque,
      onTap: active ? null : onPick,
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Stack(children: [
          Container(
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(3),
              border: Border.all(color: active ? c.brand : c.border, width: active ? 2 : 1),
            ),
            padding: EdgeInsets.all(active ? 2 : 0),
            child: ClipRRect(
              borderRadius: BorderRadius.circular(2),
              child: AspectRatio(
                aspectRatio: aspect,
                child: Image.network(url, headers: headers, fit: BoxFit.cover, gaplessPlayback: true, errorBuilder: (_, _, _) => ColoredBox(color: c.surface), loadingBuilder: (_, child, p) => p == null ? child : ColoredBox(color: c.surface)),
              ),
            ),
          ),
          if (style.forCover)
            Positioned(
              top: 6,
              left: 6,
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                decoration: BoxDecoration(color: Colors.white.withValues(alpha: 0.9), borderRadius: BorderRadius.circular(99)),
                child: Row(mainAxisSize: MainAxisSize.min, children: [
                  Icon(LucideIcons.sparkles, size: 10, color: c.brand),
                  const SizedBox(width: 4),
                  Text(labels.pairBadge, style: TextStyle(fontSize: 10, fontWeight: FontWeight.w500, color: c.brand)),
                ]),
              ),
            ),
          Positioned(
            top: 6,
            right: 6,
            child: Semantics(
              button: true,
              label: '${labels.open}: ${style.name}',
              child: GestureDetector(
                onTap: onOpen,
                child: Container(
                  width: 32,
                  height: 32,
                  decoration: BoxDecoration(color: Colors.white.withValues(alpha: 0.95), shape: BoxShape.circle, boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.1), blurRadius: 6)]),
                  child: Icon(LucideIcons.maximize2, size: 14, color: c.text),
                ),
              ),
            ),
          ),
        ]),
        const SizedBox(height: 12),
        Row(crossAxisAlignment: CrossAxisAlignment.baseline, textBaseline: TextBaseline.alphabetic, children: [
          Expanded(child: Text(style.name, maxLines: 1, overflow: TextOverflow.ellipsis, style: AppText.serif(context, size: 19, weight: FontWeight.w500).copyWith(color: active ? c.text : c.text.withValues(alpha: 0.85)))),
          const SizedBox(width: 12),
          if (active)
            Row(mainAxisSize: MainAxisSize.min, children: [
              Icon(LucideIcons.check, size: 14, color: c.brand),
              const SizedBox(width: 4),
              Text(labels.inBook, style: TextStyle(fontSize: 12, fontWeight: FontWeight.w500, color: c.brand)),
            ])
          else
            Text(style.directionLabel, style: TextStyle(fontSize: 12, color: c.textMuted)),
        ]),
        if (style.openerPhoto != null)
          Padding(
            padding: const EdgeInsets.only(top: 2),
            child: Row(children: [
              Icon(LucideIcons.image, size: 12, color: c.brand),
              const SizedBox(width: 4),
              Expanded(child: Text(style.openerPhoto!, style: TextStyle(fontSize: 11, fontWeight: FontWeight.w500, color: c.brand))),
            ]),
          ),
        const SizedBox(height: 2),
        Text(style.description, maxLines: 2, overflow: TextOverflow.ellipsis, style: TextStyle(fontSize: 12, height: 1.35, color: c.textMuted)),
      ]),
    );
  }
}

/// Готовые пары шрифтов (FontsTab сайта): название — шрифтом заголовков пары, ниже — название книги основным шрифтом.
/// Файлы шрифтов — с сервера (/api/fonts), грузятся по мере показа.
class _FontsTab extends StatelessWidget {
  const _FontsTab({required this.view, required this.backend, required this.onPick});
  final v1api.PagesView view;
  final ClientBackend backend;
  final ValueChanged<String> onPick;

  @override
  Widget build(BuildContext context) {
    final c = context.c;
    final f = view.fonts;
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      _GroupTitle(view.labels.fonts.pairs),
      Text(view.labels.fonts.pairsText, style: TextStyle(fontSize: 12.5, height: 1.4, color: c.textMuted)),
      const SizedBox(height: 12),
      // Карточка по содержимому (как p-3 сайта): название и две строки образца.
      GridView(
        gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(crossAxisCount: 2, mainAxisSpacing: 8, crossAxisSpacing: 8, mainAxisExtent: 96),
        shrinkWrap: true,
        physics: const NeverScrollableScrollPhysics(),
        children: [
          for (final p in f.pairs)
            GestureDetector(
              onTap: p.active ? null : () => onPick(p.id),
              child: Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: Colors.white,
                  borderRadius: BorderRadius.circular(16),
                  border: Border.all(color: p.active ? c.brand : c.border, width: p.active ? 1.5 : 1),
                ),
                child: Stack(children: [
                  Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    _FontText(
                      text: p.upper ? p.name.toUpperCase() : p.name,
                      face: p.display,
                      backend: backend,
                      style: TextStyle(fontSize: 22, height: 1.15, color: c.text, letterSpacing: p.tracking * 22),
                    ),
                    const SizedBox(height: 4),
                    _FontText(text: f.sample, face: p.body, backend: backend, maxLines: 2, style: TextStyle(fontSize: 12, height: 1.35, color: c.textMuted)),
                  ]),
                  if (p.active) Positioned(top: 0, right: 0, child: Icon(LucideIcons.check, size: 16, color: c.brand)),
                ]),
              ),
            ),
        ],
      ),
    ]);
  }
}

/// Текст в шрифте книги: файл начертания грузится один раз (FontLoader), до этого — шрифт приложения.
class _FontText extends StatefulWidget {
  const _FontText({required this.text, required this.face, required this.backend, required this.style, this.maxLines = 1});
  final String text;
  final v1api.PagesFontFace face;
  final ClientBackend backend;
  final TextStyle style;
  final int maxLines;

  @override
  State<_FontText> createState() => _FontTextState();
}

class _FontTextState extends State<_FontText> {
  static final _loaded = <String, Future<bool>>{};

  String get _family => 'book-${widget.face.url.split('/').last}';

  @override
  void initState() {
    super.initState();
    final family = _family;
    _loaded.putIfAbsent(family, () async {
      try {
        final res = await http.get(Uri.parse(widget.backend.url(widget.face.url)));
        if (res.statusCode != 200) return false;
        final loader = FontLoader(family)..addFont(Future.value(ByteData.sublistView(res.bodyBytes)));
        await loader.load();
        return true;
      } catch (_) {
        return false;
      }
    }).then((ok) {
      if (ok && mounted) setState(() {});
    });
  }

  @override
  Widget build(BuildContext context) {
    final ready = _loaded[_family] != null;
    return FutureBuilder<bool>(
      future: _loaded[_family],
      builder: (_, snap) => Text(
        widget.text,
        maxLines: widget.maxLines,
        overflow: TextOverflow.ellipsis,
        style: widget.style.copyWith(
          fontFamily: ready && snap.data == true ? _family : null,
          fontWeight: FontWeight.values[(widget.face.weight ~/ 100 - 1).clamp(0, 8)],
          fontStyle: widget.face.italic ? FontStyle.italic : FontStyle.normal,
        ),
      ),
    );
  }
}

/// «Обложка · Страницы» — заголовок шага «Оформить» и переключатель его половин (DesignSwitch сайта): открытая —
/// тушью, вторая — приглушённой ссылкой; переход меняет половину на месте, лента этапов остаётся.
class DesignSwitch extends StatelessWidget {
  const DesignSwitch({super.key, required this.hub, required this.active, required this.cover, required this.pages});
  final v1api.CabinetBook hub;

  /// 'cover' или 'pages'.
  final String active;
  final String cover;
  final String pages;

  @override
  Widget build(BuildContext context) {
    final c = context.c;
    Widget item(String key, String label) {
      final on = key == active;
      final text = Text(label, style: AppText.serif(context, size: 28, weight: FontWeight.w500).copyWith(height: 1, color: on ? c.text : c.textMuted.withValues(alpha: 0.7)));
      if (on) return Semantics(header: true, selected: true, child: text);
      return GestureDetector(
        behavior: HitTestBehavior.opaque,
        onTap: () => openDesignHalf(context, hub, key),
        child: text,
      );
    }

    return Wrap(spacing: 18, crossAxisAlignment: WrapCrossAlignment.end, children: [item('cover', cover), item('pages', pages)]);
  }
}

class _Segmented extends StatelessWidget {
  const _Segmented({required this.options, required this.value, required this.onChanged});
  final List<(String, String)> options;
  final String value;
  final ValueChanged<String> onChanged;

  @override
  Widget build(BuildContext context) {
    final c = context.c;
    return Container(
      padding: const EdgeInsets.all(3),
      decoration: BoxDecoration(color: c.surface, borderRadius: BorderRadius.circular(12)),
      child: Row(children: [
        for (final (id, label) in options)
          Expanded(
            child: GestureDetector(
              onTap: () => onChanged(id),
              child: AnimatedContainer(
                duration: const Duration(milliseconds: 180),
                padding: const EdgeInsets.symmetric(vertical: 8),
                decoration: BoxDecoration(
                  color: value == id ? c.surfaceRaised : Colors.transparent,
                  borderRadius: BorderRadius.circular(10),
                  boxShadow: value == id ? [BoxShadow(color: Colors.black.withValues(alpha: 0.06), blurRadius: 4)] : null,
                ),
                child: Text(label, maxLines: 1, overflow: TextOverflow.ellipsis, textAlign: TextAlign.center, style: TextStyle(fontSize: 13, fontWeight: FontWeight.w500, color: value == id ? c.text : c.textMuted)),
              ),
            ),
          ),
      ]),
    );
  }
}

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
      // Длинные подписи (другие языки) — лента листается, а не вылезает за край.
      child: SingleChildScrollView(scrollDirection: Axis.horizontal, child: Row(children: [
        for (final (id, label) in tabs)
          InkWell(
            onTap: () => onChanged(id),
            child: Container(
              padding: const EdgeInsets.fromLTRB(4, 10, 4, 10),
              margin: const EdgeInsets.only(right: 20),
              decoration: BoxDecoration(border: Border(bottom: BorderSide(color: value == id ? c.brand : Colors.transparent, width: 2))),
              child: Text(label, style: TextStyle(fontSize: 15.5, fontWeight: FontWeight.w500, color: value == id ? c.text : c.textMuted)),
            ),
          ),
      ])),
    );
  }
}

class _GroupTitle extends StatelessWidget {
  const _GroupTitle(this.text);
  final String text;

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.only(bottom: 10),
        child: Text(text.toUpperCase(), style: TextStyle(fontSize: 12, letterSpacing: 0.8, fontWeight: FontWeight.w600, color: context.c.textMuted)),
      );
}

/// Строка ленты книги (RibbonItem сайта): название и что сейчас; раскрыта — настройки под ней.
class _RibbonItem extends StatelessWidget {
  const _RibbonItem({required this.title, required this.meta, required this.open, required this.onToggle, required this.children});
  final String title;
  final String meta;
  final bool open;
  final VoidCallback onToggle;
  final List<Widget> children;

  @override
  Widget build(BuildContext context) {
    final c = context.c;
    return Container(
      margin: const EdgeInsets.only(bottom: 6),
      decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(14), border: Border.all(color: c.border)),
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        InkWell(
          borderRadius: BorderRadius.circular(14),
          onTap: onToggle,
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
            child: Row(children: [
              Expanded(
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text(title, style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w500)),
                  const SizedBox(height: 2),
                  Text(meta, maxLines: 1, overflow: TextOverflow.ellipsis, style: TextStyle(fontSize: 12.5, color: c.textMuted)),
                ]),
              ),
              AnimatedRotation(turns: open ? 0.5 : 0, duration: const Duration(milliseconds: 180), child: Icon(LucideIcons.chevronDown, size: 18, color: c.textMuted)),
            ]),
          ),
        ),
        if (open)
          Padding(
            padding: const EdgeInsets.fromLTRB(14, 0, 14, 14),
            child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: children),
          ),
      ]),
    );
  }
}

class _Check extends StatelessWidget {
  const _Check({required this.value, required this.label, required this.onChanged});
  final bool value;
  final String label;
  final ValueChanged<bool> onChanged;

  @override
  Widget build(BuildContext context) => InkWell(
        onTap: () => onChanged(!value),
        child: ConstrainedBox(
          constraints: const BoxConstraints(minHeight: 44),
          child: Row(children: [
            Checkbox(value: value, onChanged: (v) => onChanged(v ?? false), activeColor: context.c.brand),
            Expanded(child: Text(label, style: const TextStyle(fontSize: 14))),
          ]),
        ),
      );
}

class _Radio extends StatelessWidget {
  const _Radio({required this.selected, required this.label, required this.onTap});
  final bool selected;
  final String label;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final c = context.c;
    return InkWell(
      onTap: onTap,
      child: ConstrainedBox(
        constraints: const BoxConstraints(minHeight: 44),
        child: Row(children: [
          Icon(selected ? Icons.radio_button_checked : Icons.radio_button_off, size: 20, color: selected ? c.brand : c.textMuted),
          const SizedBox(width: 12),
          Expanded(child: Text(label, style: const TextStyle(fontSize: 14))),
        ]),
      ),
    );
  }
}

class _Chip extends StatelessWidget {
  const _Chip({required this.label, required this.on, required this.onTap, this.icon});
  final String label;
  final bool on;
  final VoidCallback onTap;
  final IconData? icon;

  @override
  Widget build(BuildContext context) {
    final c = context.c;
    return GestureDetector(
      onTap: onTap,
      child: Container(
        constraints: const BoxConstraints(minHeight: 40),
        padding: const EdgeInsets.symmetric(horizontal: 14),
        decoration: BoxDecoration(color: on ? c.text : Colors.white, borderRadius: BorderRadius.circular(99), border: Border.all(color: on ? c.text : c.border)),
        child: Row(mainAxisSize: MainAxisSize.min, children: [
          if (icon != null) ...[Icon(icon, size: 14, color: on ? c.bg : c.brand), const SizedBox(width: 6)],
          Text(label, style: TextStyle(fontSize: 14, color: on ? c.bg : c.text)),
        ]),
      ),
    );
  }
}
