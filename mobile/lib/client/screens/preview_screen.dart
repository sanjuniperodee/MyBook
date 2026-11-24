import 'dart:async';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:path_provider/path_provider.dart';
import 'package:provider/provider.dart';
import 'package:share_plus/share_plus.dart';

import '../../api/mybook_api.g.dart' as v1api;
import '../../core/api.dart';
import '../../ui/kit.dart';
import '../../ui/tokens.dart';
import '../data/session.dart';
import '../ui/book_chrome.dart';
import '../ui/cabinet.dart';
import '../ui/motion.dart';
import 'book3d_view.dart';
import 'checkout_screen.dart';

/// Макет книги — как на сайте (/books/[id]/preview): «Читать» — полосы настоящего макета (экранная сборка того же PDF,
/// что уйдёт в типографию) с листанием и ползунком или все подряд; «3D-книга» — книга, которую можно крутить пальцем.
/// Пока страницы собираются — ход сборки; PDF — скачать и поделиться. У черновика — «Всё отлично — заказать».
class PreviewScreen extends StatefulWidget {
  const PreviewScreen({super.key, required this.hub});
  final v1api.CabinetBook hub;

  @override
  State<PreviewScreen> createState() => _PreviewScreenState();
}

class _PreviewScreenState extends State<PreviewScreen> {
  late final ClientSession _session = context.read<ClientSession>();
  v1api.BuildState? _state;
  v1api.BuildProgressProgress? _progress;
  String? _error;
  Timer? _poll;
  bool _book3d = false;
  bool _scroll = false;
  int _page = 0;
  bool _downloading = false;
  final _pager = PageController();

  String get _bookId => widget.hub.id;

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _poll?.cancel();
    _pager.dispose();
    super.dispose();
  }

  Future<void> _load({bool retry = false}) async {
    try {
      final s = await _session.backend.build(_bookId, retry: retry);
      if (!mounted) return;
      setState(() {
        _state = s;
        _error = null;
      });
      _poll?.cancel();
      if (s.status == 'building') {
        // Пока собирается — ход раз в секунду, потом снова сборка.
        _poll = Timer.periodic(const Duration(seconds: 1), (_) async {
          try {
            final p = await _session.backend.buildProgress(_bookId);
            if (!mounted) return;
            if (p.progress == null || p.progress!.state == 'done' || p.progress!.percent >= 100) {
              _poll?.cancel();
              _load();
            } else {
              setState(() => _progress = p.progress);
            }
          } on ApiException catch (_) {}
        });
      }
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    }
  }

  String _pageUrl(v1api.BookBuild b, int n, double px) {
    final widths = [...b.imageWidths]..sort();
    final w = widths.firstWhere((x) => x >= px, orElse: () => widths.isEmpty ? 800 : widths.last);
    return _session.backend.url('${b.imageBase}/$n?w=$w');
  }

  Future<void> _downloadPdf() async {
    final url = _state?.pdfUrl;
    if (url == null) return;
    setState(() => _downloading = true);
    try {
      final bytes = await _session.api.download(_session.backend.url(url));
      final dir = await getTemporaryDirectory();
      final file = File('${dir.path}/${widget.hub.title.replaceAll(RegExp(r'[^\w\s.-]', unicode: true), '').trim()}.pdf');
      await file.writeAsBytes(bytes);
      if (!mounted) return;
      // На iPad лист «Поделиться» — всплывающий: ему нужна точка привязки (иначе падает).
      final size = MediaQuery.sizeOf(context);
      await SharePlus.instance.share(ShareParams(files: [XFile(file.path, mimeType: 'application/pdf')], sharePositionOrigin: Rect.fromLTWH(size.width - 80, 120, 1, 1)));
    } on ApiException catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
    } finally {
      if (mounted) setState(() => _downloading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final c = context.c;
    final h = widget.hub;
    final s = _state;
    final build = s?.build;
    return Scaffold(
      backgroundColor: c.bg,
      appBar: BookHeader(bookId: h.id, title: h.title, kind: h.kind, coverUrl: h.coverThumbUrl),
      bottomNavigationBar: h.editable
          ? Container(
              padding: const EdgeInsets.fromLTRB(16, 10, 16, 10),
              decoration: BoxDecoration(color: c.bg, border: Border(top: BorderSide(color: c.border))),
              child: SafeArea(
                top: false,
                child: CabinetButton(
                  label: 'Всё отлично — заказать',
                  large: false,
                  onPressed: () => Navigator.of(context).push(CabinetRoute<void>(builder: (_) => CheckoutScreen(bookId: h.id, bookTitle: h.title))),
                ),
              ),
            )
          : null,
      body: Column(children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 18, 16, 12),
          child: Row(children: [
            Expanded(child: Text('Макет книги', style: AppText.serif(context, size: 30, weight: FontWeight.w500))),
            _Segmented(value: _book3d ? 1 : 0, labels: const ['Читать', '3D-книга'], icons: const [LucideIcons.bookOpen, LucideIcons.box], onChanged: (i) => setState(() => _book3d = i == 1)),
          ]),
        ),
        Expanded(
          child: _book3d
              ? (build == null
                  ? (s == null
                      ? (_error == null ? const Center(child: CircularProgressIndicator()) : EmptyState(icon: LucideIcons.wifiOff, title: 'Макет не открылся', hint: _error, action: 'Повторить', onAction: _load))
                      : _Building(state: s, progress: _progress, onRetry: () => _load(retry: true)))
                  : Book3DView(bookId: h.id, pageCount: build.pageCount, pageUrl: (n, px) => _pageUrl(build, n, px)))
              : s == null
                  ? (_error == null ? const Center(child: CircularProgressIndicator()) : EmptyState(icon: LucideIcons.wifiOff, title: 'Макет не открылся', hint: _error, action: 'Повторить', onAction: _load))
                  : build == null
                      ? _Building(state: s, progress: _progress, onRetry: () => _load(retry: true))
                      : Column(children: [
                          if (s.status == 'building') _Banner(text: 'Обновляем страницы после последних правок…${_progress != null ? ' ${_progress!.percent}%' : ''}', tone: 'info'),
                          if (s.status == 'failed') _Banner(text: 'Не удалось обновить страницы — показываем прошлую версию.', tone: 'warn'),
                          _Toolbar(
                            page: _page,
                            count: build.pages.length,
                            scroll: _scroll,
                            onScroll: (v) => setState(() => _scroll = v),
                            downloading: _downloading,
                            onPdf: s.status == 'ready' ? _downloadPdf : null,
                          ),
                          Expanded(child: _scroll ? _scrollReader(build) : _pagedReader(build)),
                        ]),
        ),
      ]),
    );
  }

  Widget _pagedReader(v1api.BookBuild b) {
    final c = context.c;
    final px = MediaQuery.sizeOf(context).width * MediaQuery.devicePixelRatioOf(context);
    final ratio = b.trimMm.w / b.trimMm.h;
    return Column(children: [
      Expanded(
        child: PageView.builder(
          controller: _pager,
          itemCount: b.pages.length,
          onPageChanged: (i) => setState(() => _page = i),
          itemBuilder: (_, i) => Padding(
            padding: const EdgeInsets.fromLTRB(20, 8, 20, 12),
            child: Center(
              child: AspectRatio(
                aspectRatio: ratio,
                child: _PageImage(url: _pageUrl(b, b.pages[i].n, px), headers: _session.backend.imageHeaders),
              ),
            ),
          ),
        ),
      ),
      // Ползунок страниц, как у читалки сайта.
      Padding(
        padding: const EdgeInsets.fromLTRB(12, 0, 12, 8),
        child: Slider(
          value: _page.toDouble(),
          max: (b.pages.length - 1).clamp(0, 100000).toDouble(),
          divisions: b.pages.length > 1 ? b.pages.length - 1 : null,
          activeColor: c.brand,
          onChanged: (v) {
            setState(() => _page = v.round());
            _pager.jumpToPage(v.round());
          },
        ),
      ),
    ]);
  }

  Widget _scrollReader(v1api.BookBuild b) {
    final px = MediaQuery.sizeOf(context).width * MediaQuery.devicePixelRatioOf(context);
    final ratio = b.trimMm.w / b.trimMm.h;
    return ListView.separated(
      padding: const EdgeInsets.fromLTRB(20, 8, 20, 32),
      itemCount: b.pages.length,
      separatorBuilder: (_, _) => const SizedBox(height: 14),
      itemBuilder: (_, i) => Column(children: [
        AspectRatio(aspectRatio: ratio, child: _PageImage(url: _pageUrl(b, b.pages[i].n, px), headers: _session.backend.imageHeaders)),
        const SizedBox(height: 4),
        Text('${b.pages[i].n}', style: TextStyle(fontSize: 12, color: context.c.textMuted)),
      ]),
    );
  }
}

class _Segmented extends StatelessWidget {
  const _Segmented({required this.value, required this.labels, required this.icons, required this.onChanged});
  final int value;
  final List<String> labels;
  final List<IconData> icons;
  final ValueChanged<int> onChanged;

  @override
  Widget build(BuildContext context) {
    final c = context.c;
    return Container(
      padding: const EdgeInsets.all(3),
      decoration: BoxDecoration(color: c.surface, borderRadius: BorderRadius.circular(12)),
      child: Row(mainAxisSize: MainAxisSize.min, children: [
        for (var i = 0; i < labels.length; i++)
          GestureDetector(
            onTap: () => onChanged(i),
            child: AnimatedContainer(
              duration: const Duration(milliseconds: 180),
              padding: const EdgeInsets.symmetric(horizontal: 11, vertical: 8),
              decoration: BoxDecoration(color: value == i ? c.surfaceRaised : Colors.transparent, borderRadius: BorderRadius.circular(10), boxShadow: value == i ? [BoxShadow(color: Colors.black.withValues(alpha: 0.06), blurRadius: 4)] : null),
              child: Row(children: [
                Icon(icons[i], size: 15, color: value == i ? c.text : c.textMuted),
                const SizedBox(width: 6),
                Text(labels[i], style: TextStyle(fontSize: 13.5, fontWeight: FontWeight.w500, color: value == i ? c.text : c.textMuted)),
              ]),
            ),
          ),
      ]),
    );
  }
}

class _Toolbar extends StatelessWidget {
  const _Toolbar({required this.page, required this.count, required this.scroll, required this.onScroll, required this.downloading, required this.onPdf});
  final int page;
  final int count;
  final bool scroll;
  final ValueChanged<bool> onScroll;
  final bool downloading;
  final VoidCallback? onPdf;

  @override
  Widget build(BuildContext context) {
    final c = context.c;
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 0, 8, 4),
      child: Row(children: [
        Text(scroll ? '$count стр.' : '${page + 1} из $count', style: TextStyle(fontSize: 14, color: c.textMuted, fontFeatures: const [FontFeature.tabularFigures()])),
        const Spacer(),
        TextButton.icon(
          onPressed: () => onScroll(!scroll),
          icon: Icon(scroll ? LucideIcons.bookOpen : LucideIcons.rows3, size: 16, color: c.text),
          label: Text(scroll ? 'По страницам' : 'Все подряд', style: TextStyle(fontSize: 13.5, color: c.text)),
        ),
        TextButton.icon(
          onPressed: downloading ? null : onPdf,
          icon: downloading ? const SizedBox(width: 14, height: 14, child: CircularProgressIndicator(strokeWidth: 2)) : Icon(LucideIcons.download, size: 16, color: onPdf == null ? c.textFaint : c.brand),
          label: Text('PDF', style: TextStyle(fontSize: 13.5, color: onPdf == null ? c.textFaint : c.brand)),
        ),
      ]),
    );
  }
}

/// Полоса макета: картинка экранной сборки с тенью листа.
class _PageImage extends StatelessWidget {
  const _PageImage({required this.url, required this.headers});
  final String url;
  final Map<String, String> headers;

  @override
  Widget build(BuildContext context) {
    final c = context.c;
    return Container(
      decoration: BoxDecoration(color: Colors.white, boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.14), blurRadius: 14, offset: const Offset(0, 4))]),
      child: Image.network(
        url,
        headers: headers,
        fit: BoxFit.contain,
        gaplessPlayback: true,
        frameBuilder: (_, child, frame, sync) => sync || frame != null ? child : ColoredBox(color: c.surface, child: const Center(child: SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2)))),
        errorBuilder: (_, _, _) => Center(child: Text('Страница не загрузилась', style: TextStyle(fontSize: 13, color: c.textMuted))),
      ),
    );
  }
}

class _Building extends StatelessWidget {
  const _Building({required this.state, required this.progress, required this.onRetry});
  final v1api.BuildState state;
  final v1api.BuildProgressProgress? progress;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    final c = context.c;
    if (state.status == 'failed') {
      return EmptyState(icon: LucideIcons.triangleAlert, title: 'Не удалось собрать страницы книги.', hint: state.error, action: state.retryInMs == null || state.retryInMs == 0 ? 'Повторить' : null, onAction: onRetry);
    }
    final p = progress;
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          Text('Собираем страницы книги…', style: AppText.serif(context, size: 24, weight: FontWeight.w500), textAlign: TextAlign.center),
          const SizedBox(height: 8),
          Text('Они появятся здесь сами, как только всё будет готово.', textAlign: TextAlign.center, style: TextStyle(fontSize: 15, color: c.textMuted)),
          const SizedBox(height: 22),
          ClipRRect(borderRadius: BorderRadius.circular(4), child: LinearProgressIndicator(value: p == null ? null : p.percent / 100, minHeight: 6, color: c.brand, backgroundColor: c.border)),
          if (p != null) ...[const SizedBox(height: 8), Text('${p.percent}%', style: TextStyle(fontSize: 13.5, color: c.textMuted))],
          if (p?.overrun ?? false) ...[const SizedBox(height: 12), Text('Сборка идёт дольше обычного — большая книга или очередь. Страницы появятся сами.', textAlign: TextAlign.center, style: TextStyle(fontSize: 13.5, color: c.textMuted))],
        ]),
      ),
    );
  }
}

class _Banner extends StatelessWidget {
  const _Banner({required this.text, required this.tone});
  final String text;
  final String tone;

  @override
  Widget build(BuildContext context) {
    final c = context.c;
    final (bg, fg) = tone == 'warn' ? (c.warnBg, c.warn) : (c.violetBg, c.violet);
    return Container(width: double.infinity, margin: const EdgeInsets.fromLTRB(16, 0, 16, 8), padding: const EdgeInsets.all(10), decoration: BoxDecoration(color: bg, borderRadius: BorderRadius.circular(Cab.ctl)), child: Text(text, style: TextStyle(fontSize: 13.5, color: fg)));
  }
}

/// 3D-книга: объёмная книга с настоящей обложкой; крутится пальцем (как модель на сайте), двойное нажатие — исходный ракурс.
