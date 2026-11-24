import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:provider/provider.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../api/mybook_api.g.dart' as v1api;
import '../../core/api.dart';
import '../../core/cache.dart';
import '../../ui/kit.dart';
import '../../ui/tokens.dart';
import '../data/models.dart';
import '../data/session.dart';
import '../data/stores.dart';
import '../ui/book_chrome.dart';
import '../ui/cabinet.dart';
import '../ui/motion.dart';
import 'answer_screen.dart';
import 'help_sheet.dart';
import 'photos_screen.dart';

/// Штаб книги — как страница книги на сайте (src/app/(app)/books/[id]/page.tsx): книга, следующий шаг, срок к празднику,
/// путь книги, замечания, главы и письма. Модель экрана — с сервера (cabinetBook, та же функция, что у страницы),
/// главы и вопросы для редактора — модель редактора (bookEditor).
class BookScreen extends StatefulWidget {
  const BookScreen({
    super.key,
    required this.summary,
    this.writeSectionId,
    this.openFrom,
  });
  final BookSummary summary;

  /// Где на полке открылась книга: страница вырастает оттуда в лист редактора.
  final Rect? openFrom;

  /// «Продолжить писать» с полки: сразу открыть этот раздел ('' — первый без ответа).
  final String? writeSectionId;

  @override
  State<BookScreen> createState() => _BookScreenState();
}

class _BookScreenState extends State<BookScreen> {
  late final ClientSession _session = context.read<ClientSession>();
  late final BookStore _store = _session.book(widget.summary.id);
  final _book = Book3DController();
  late v1api.CabinetBook? _hub = _session.hubs[widget.summary.id];
  String? _error;
  bool _allChapters = false;

  /// Пришли с полки «Продолжить писать»: штаб не показываем, пока поверх не встанет редактор.
  late bool _writing = widget.writeSectionId != null;

  String get _cacheKey => 'hub-${widget.summary.id}';

  @override
  void initState() {
    super.initState();
    LocalCache.read(_cacheKey).then((j) {
      if (j != null && _hub == null && mounted) {
        try {
          setState(() => _hub = v1api.CabinetBook.fromJson(j));
        } catch (_) {}
      }
    });
    final want = widget.writeSectionId;
    if (want != null) {
      // «Продолжить писать» с полки: книга загружена заранее (preload) — редактор вырастает из открытой книги сразу.
      final ready = _store.book != null ? Future<void>.value() : _store.load();
      // Следующим кадром: сначала встаёт (прозрачный) экран книги, потом — редактор поверх.
      ready.then(
        (_) => WidgetsBinding.instance.addPostFrameCallback((_) {
          if (mounted) {
            _write(want.isEmpty ? null : want, animate: false, from: widget.openFrom);
          }
        }),
      );
      _loadHub();
    } else {
      _loadHub();
      _store.load();
    }
  }

  Future<void> _loadHub() async {
    try {
      final hub = await _session.backend.hub(widget.summary.id);
      LocalCache.write(_cacheKey, hub.toJson());
      _session.hubs[widget.summary.id] = hub;
      if (mounted) {
        setState(() {
          _hub = hub;
          _error = null;
        });
      }
    } on ApiException catch (e) {
      if (mounted && !(e.status == 0 && _hub != null))
        setState(() => _error = e.message);
    }
  }

  Future<void> _refresh() async {
    await Future.wait([_loadHub(), _store.load()]);
  }

  /// Открыть раздел в редакторе; animate — книга сначала открывается на месте (OpenBookLink).
  Future<void> _write(
    String? sectionId, {
    bool animate = true,
    Rect? from,
  }) async {
    final qs = _store.book?.questions ?? const <Question>[];
    if (qs.isEmpty) return;
    final q =
        qs.where((x) => x.id == sectionId).firstOrNull ??
        qs.where((x) => !x.answered).firstOrNull ??
        qs.first;
    if (animate) await _book.open();
    if (!mounted) return;
    Widget page(BuildContext _) =>
        AnswerScreen(store: _store, questionId: q.id, hub: _hub);
    // Открытая книга: её страница вырастает в лист редактора; иначе — обычная смена страницы.
    final leafFrom = animate ? _book.rect : from;
    final done = Navigator.of(context).push(
      leafFrom != null
          ? LeafRoute<void>(builder: page, from: leafFrom)
          : CabinetRoute<void>(builder: page),
    );
    // Штаб — под редактором: показываем, когда лист закрыл экран.
    if (_writing)
      Future<void>.delayed(
        const Duration(milliseconds: 480),
        () => mounted ? setState(() => _writing = false) : null,
      );
    await done;
    _book.reset();
    _loadHub();
  }

  void _photos() async {
    await Navigator.of(context).push(
      CabinetRoute<void>(
        builder: (_) => PhotosScreen(
          store: _store,
          inBook: widget.summary.photos,
          hub: _hub,
        ),
      ),
    );
    _loadHub();
  }

  /// Ссылка сайта → экран приложения. null — этого раздела в приложении ещё нет: кнопку не показываем.
  VoidCallback? _target(String href, {bool animate = false}) {
    final u = Uri.parse(href);
    final parts = u.pathSegments;
    if (parts.length >= 3 && parts[0] == 'books' && parts[2] == 'questions')
      return () => _write(u.queryParameters['s'], animate: animate);
    if (parts.length >= 3 && parts[0] == 'books' && parts[2] == 'photos')
      return _photos;
    return null;
  }

  List<BookStep> _steps(v1api.CabinetBook h) => [
    for (final s in h.steps)
      if (s.key == 'write' || s.key == 'photos')
        BookStep(
          key: s.key,
          label: s.title,
          status: s.status,
          fraction: s.fraction,
        ),
  ];

  @override
  Widget build(BuildContext context) {
    final c = context.c;
    final h = _hub;
    // Пока поверх не встал редактор (пришли с «Продолжить писать»), экран прозрачен: под вырастающим листом — полка.
    if (_writing) return const SizedBox.expand();
    return Scaffold(
      backgroundColor: c.bg,
      // Помощник по книге — как на сайте: квадрат со спасательным кругом справа внизу.
      floatingActionButton: h == null ? null : HelpButton(bookId: widget.summary.id, section: 'overview'),
      appBar: BookHeader(
        bookId: widget.summary.id,
        title: h?.title ?? widget.summary.title,
        kind: h?.kind ?? '',
        coverUrl: h?.coverThumbUrl ?? '',
      ),
      body: h == null
          ? (_error == null
                ? const Center(child: CircularProgressIndicator())
                : EmptyState(
                    icon: LucideIcons.wifiOff,
                    title: 'Книга не открылась',
                    hint: _error,
                    action: 'Повторить',
                    onAction: _loadHub,
                  ))
          : Column(
              children: [
                StepTabs(
                  steps: _steps(h),
                  active: 'hub',
                  onTap: (k) => k == 'write'
                      ? _write(null)
                      : (k == 'photos' ? _photos() : null),
                ),
                Expanded(
                  child: RefreshIndicator(
                    color: c.brand,
                    onRefresh: _refresh,
                    child: ListView(
                      physics: const AlwaysScrollableScrollPhysics(
                        parent: BouncingScrollPhysics(),
                      ),
                      padding: const EdgeInsets.fromLTRB(16, 24, 16, 48),
                      children: [
                        Enter(
                          key: const ValueKey('title'),
                          i: 0,
                          child: _BookTitle(h: h, book: _book),
                        ),
                        if (h.card != null) ...[
                          const SizedBox(height: 26),
                          Enter(
                            key: const ValueKey('card'),
                            i: 1,
                            child: _NextCard(
                              card: h.card!,
                              target: _target,
                              language: h.language,
                            ),
                          ),
                        ],
                        if (h.deadline != null) ...[
                          const SizedBox(height: 26),
                          Enter(
                            key: const ValueKey('deadline'),
                            i: 2,
                            child: _Deadline(d: h.deadline!),
                          ),
                        ],
                        const SizedBox(height: 30),
                        Enter(
                          key: const ValueKey('path'),
                          i: 3,
                          child: _Path(h: h, target: _target),
                        ),
                        if (h.needs.isNotEmpty) ...[
                          const SizedBox(height: 30),
                          _Needs(h: h, target: _target),
                        ],
                        const SizedBox(height: 40),
                        _Chapters(
                          h: h,
                          all: _allChapters,
                          onAll: () =>
                              setState(() => _allChapters = !_allChapters),
                          onOpen: (id) => _write(id),
                        ),
                        const SizedBox(height: 32),
                        _Letters(h: h),
                        const SizedBox(height: 18),
                        _Help(h: h),
                      ],
                    ),
                  ),
                ),
              ],
            ),
    );
  }
}

/// Книга: объёмная обложка слева от названия (на телефоне — как в шапке штаба сайта).
class _BookTitle extends StatelessWidget {
  const _BookTitle({required this.h, required this.book});
  final v1api.CabinetBook h;
  final Book3DController book;

  @override
  Widget build(BuildContext context) {
    final c = context.c;
    return Row(
      children: [
        Hero(
          tag: coverHeroTag(h.id),
          child: Book3D(
            bookId: h.id,
            controller: book,
            width: 92,
            cover: CoverPicture(url: h.coverUrl),
          ),
        ),
        const SizedBox(width: 18),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                h.title,
                style: AppText.serif(
                  context,
                  size: 29,
                  weight: FontWeight.w500,
                ).copyWith(height: 1.08),
              ),
              if (h.subtitle.isNotEmpty) ...[
                const SizedBox(height: 4),
                Text(
                  h.subtitle,
                  style: AppText.serif(
                    context,
                    size: 18,
                  ).copyWith(fontStyle: FontStyle.italic, color: c.textMuted),
                ),
              ],
            ],
          ),
        ),
      ],
    );
  }
}

/// «Следующий шаг» — одно главное действие (вопрос засечками, обложка, заказ или состояние заказа).
class _NextCard extends StatelessWidget {
  const _NextCard({
    required this.card,
    required this.target,
    required this.language,
  });
  final v1api.HubCard card;
  final VoidCallback? Function(String href, {bool animate}) target;
  final String language;

  @override
  Widget build(BuildContext context) {
    final c = context.c;
    final primary = target(card.primary.href, animate: card.primaryWrite);
    final secondary = card.secondary == null
        ? null
        : target(card.secondary!.href);
    final more = card.more == null ? null : target(card.more!.href);
    return Panel(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            card.eyebrow,
            style: TextStyle(fontSize: 13, color: c.textMuted),
          ),
          const SizedBox(height: 8),
          if (card.serif)
            GestureDetector(
              onTap: primary,
              child: Text(
                card.title,
                maxLines: 3,
                overflow: TextOverflow.ellipsis,
                style: AppText.serif(context, size: 23).copyWith(height: 1.3),
              ),
            )
          else
            Text(
              card.title,
              style: AppText.serif(
                context,
                size: 27,
                weight: FontWeight.w500,
              ).copyWith(height: 1.15),
            ),
          if (card.text != null) ...[
            const SizedBox(height: 8),
            Text(
              card.text!,
              style: TextStyle(
                fontSize: 15.5,
                height: 1.55,
                color: c.text.withValues(alpha: 0.85),
              ),
            ),
          ],
          if (primary != null) ...[
            const SizedBox(height: 20),
            CabinetButton(
              label: card.primary.label,
              icon: card.primaryWrite ? LucideIcons.penLine : null,
              onPressed: primary,
              large: false,
            ),
          ],
          if (secondary != null) ...[
            const SizedBox(height: 10),
            CabinetButton(
              label: card.secondary!.label,
              onPressed: secondary,
              kind: CabBtn.outline,
              large: false,
            ),
          ],
          if (card.more != null && more != null) ...[
            const SizedBox(height: 16),
            Divider(color: c.border, height: 1),
            const SizedBox(height: 12),
            GestureDetector(
              onTap: more,
              child: Text.rich(
                TextSpan(
                  children: [
                    if (card.moreText != null)
                      TextSpan(
                        text: '${card.moreText}. ',
                        style: TextStyle(color: c.textMuted),
                      ),
                    TextSpan(
                      text: card.more!.label,
                      style: TextStyle(
                        color: c.brand,
                        fontWeight: FontWeight.w500,
                      ),
                    ),
                  ],
                ),
                style: const TextStyle(fontSize: 14),
              ),
            ),
          ],
        ],
      ),
    );
  }
}

/// Отсчёт до праздника (DeadlineBanner): дни в квадрате, заголовок, строка срока и темпа.
class _Deadline extends StatelessWidget {
  const _Deadline({required this.d});
  final v1api.HubDeadline d;

  @override
  Widget build(BuildContext context) {
    final c = context.c;
    final (bg, border) = switch (d.tone) {
      'warm' => (c.warnBg, c.warn.withValues(alpha: 0.25)),
      'hot' => (c.bubbleOut, c.brand.withValues(alpha: 0.3)),
      _ => (c.surfaceRaised, c.border),
    };
    final hot = d.tone == 'hot';
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: bg,
        borderRadius: BorderRadius.circular(Cab.panel),
        border: Border.all(color: border),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            width: 46,
            height: 46,
            decoration: BoxDecoration(
              color: hot ? c.brand : c.surface,
              borderRadius: BorderRadius.circular(Cab.ctl),
            ),
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Text(
                  '${d.days}',
                  style: AppText.serif(
                    context,
                    size: 19,
                    weight: FontWeight.w500,
                  ).copyWith(color: hot ? Colors.white : c.text, height: 1),
                ),
                Text(
                  d.daysShort,
                  style: TextStyle(
                    fontSize: 10,
                    color: (hot ? Colors.white : c.text).withValues(
                      alpha: 0.75,
                    ),
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(width: 14),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  d.headline,
                  style: const TextStyle(
                    fontSize: 15,
                    fontWeight: FontWeight.w500,
                    height: 1.5,
                  ),
                ),
                Text.rich(
                  TextSpan(
                    children: [
                      if (d.icon != null)
                        WidgetSpan(
                          alignment: PlaceholderAlignment.middle,
                          child: Padding(
                            padding: const EdgeInsets.only(right: 4),
                            child: Icon(
                              d.icon == 'zap'
                                  ? LucideIcons.zap
                                  : LucideIcons.clock,
                              size: 14,
                              color: d.icon == 'zap'
                                  ? c.brand
                                  : c.text.withValues(alpha: 0.8),
                            ),
                          ),
                        ),
                      TextSpan(text: d.line),
                    ],
                  ),
                  style: TextStyle(
                    fontSize: 15,
                    height: 1.6,
                    color: c.text.withValues(alpha: 0.85),
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _BlockTitle extends StatelessWidget {
  const _BlockTitle({required this.title, this.aside});
  final String title;
  final Widget? aside;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.only(bottom: 12),
    child: Row(
      crossAxisAlignment: CrossAxisAlignment.baseline,
      textBaseline: TextBaseline.alphabetic,
      children: [
        Expanded(
          child: Text(
            title,
            style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w600),
          ),
        ),
        ?aside,
      ],
    ),
  );
}

/// Путь книги: шаги и их состояние.
class _Path extends StatelessWidget {
  const _Path({required this.h, required this.target});
  final v1api.CabinetBook h;
  final VoidCallback? Function(String href, {bool animate}) target;

  @override
  Widget build(BuildContext context) {
    final c = context.c;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        _BlockTitle(title: h.pathTitle),
        Panel(
          padding: EdgeInsets.zero,
          child: Column(
            children: [
              for (var i = 0; i < h.steps.length; i++) ...[
                if (i > 0) Divider(height: 1, color: c.border),
                _PathRow(
                  step: h.steps[i],
                  n: i + 1,
                  onTap: target(h.steps[i].href),
                ),
              ],
            ],
          ),
        ),
      ],
    );
  }
}

class _PathRow extends StatelessWidget {
  const _PathRow({required this.step, required this.n, required this.onTap});
  final v1api.HubStep step;
  final int n;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final c = context.c;
    return InkWell(
      onTap: onTap,
      child: Container(
        color: step.active ? c.bubbleOut.withValues(alpha: 0.4) : null,
        constraints: const BoxConstraints(minHeight: 68),
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
        child: Row(
          children: [
            StepNode(
              status: step.status,
              fraction: step.fraction,
              n: n,
              large: true,
              current: step.active,
            ),
            const SizedBox(width: 14),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    step.title,
                    style: const TextStyle(
                      fontSize: 16,
                      fontWeight: FontWeight.w500,
                    ),
                  ),
                  Text(
                    step.value,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(
                      fontSize: 14.5,
                      color: step.status == 'attention' ? c.warn : c.textMuted,
                    ),
                  ),
                  if (step.bar != null && step.status != 'done') ...[
                    const SizedBox(height: 6),
                    ConstrainedBox(
                      constraints: const BoxConstraints(maxWidth: 224),
                      child: ClipRRect(
                        borderRadius: BorderRadius.circular(2),
                        child: Stack(
                          children: [
                            Container(height: 3, color: c.border),
                            FractionallySizedBox(
                              widthFactor: (step.bar!.clamp(2, 100)) / 100,
                              child: BarGrow(
                                child: Container(height: 3, color: c.brand),
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                  ],
                ],
              ),
            ),
            if (onTap != null)
              Icon(LucideIcons.chevronRight, size: 17, color: c.textMuted),
          ],
        ),
      ),
    );
  }
}

/// «До заказа не хватает» / «Стоит проверить».
class _Needs extends StatelessWidget {
  const _Needs({required this.h, required this.target});
  final v1api.CabinetBook h;
  final VoidCallback? Function(String href, {bool animate}) target;

  @override
  Widget build(BuildContext context) {
    final c = context.c;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        _BlockTitle(title: h.needsTitle, aside: CountBadge(h.needs.length)),
        Panel(
          padding: EdgeInsets.zero,
          child: Column(
            children: [
              for (var i = 0; i < h.needs.length; i++) ...[
                if (i > 0) Divider(height: 1, color: c.border),
                Padding(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 16,
                    vertical: 12,
                  ),
                  child: Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Padding(
                        padding: const EdgeInsets.only(top: 2),
                        child: Icon(
                          h.needs[i].level == 'error'
                              ? LucideIcons.circleAlert
                              : LucideIcons.triangleAlert,
                          size: 16,
                          color: h.needs[i].level == 'error'
                              ? c.danger
                              : c.warn,
                        ),
                      ),
                      const SizedBox(width: 12),
                      Expanded(
                        child: Text(
                          h.needs[i].text,
                          style: TextStyle(
                            fontSize: 14.5,
                            color: c.text.withValues(alpha: 0.85),
                          ),
                        ),
                      ),
                      if (h.needs[i].href != null &&
                          target(h.needs[i].href!) != null)
                        GestureDetector(
                          onTap: target(h.needs[i].href!),
                          child: Text(
                            h.needsFix,
                            style: TextStyle(
                              fontSize: 14.5,
                              fontWeight: FontWeight.w500,
                              color: c.brand,
                            ),
                          ),
                        ),
                    ],
                  ),
                ),
              ],
            ],
          ),
        ),
      ],
    );
  }
}

/// Главы: первые шесть на виду, остальные — под «Все главы».
class _Chapters extends StatelessWidget {
  const _Chapters({
    required this.h,
    required this.all,
    required this.onAll,
    required this.onOpen,
  });
  final v1api.CabinetBook h;
  final bool all;
  final VoidCallback onAll;
  final ValueChanged<String?> onOpen;

  @override
  Widget build(BuildContext context) {
    final c = context.c;
    final shown = all ? h.chapters : h.chapters.take(6).toList();
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        _BlockTitle(
          title: h.chaptersTitle,
          aside: h.chaptersAside == null
              ? null
              : Text(
                  h.chaptersAside!,
                  style: TextStyle(fontSize: 14.5, color: c.textMuted),
                ),
        ),
        for (var i = 0; i < shown.length; i++)
          InkWell(
            onTap: () => onOpen(shown[i].sectionId),
            borderRadius: BorderRadius.circular(Cab.ctl),
            child: Padding(
              padding: const EdgeInsets.symmetric(vertical: 11),
              child: Column(
                children: [
                  Row(
                    crossAxisAlignment: CrossAxisAlignment.baseline,
                    textBaseline: TextBaseline.alphabetic,
                    children: [
                      SizedBox(
                        width: 22,
                        child: Text(
                          '${i + 1}',
                          textAlign: TextAlign.right,
                          style: TextStyle(
                            fontSize: 13,
                            color: c.textMuted,
                            fontFeatures: const [FontFeature.tabularFigures()],
                          ),
                        ),
                      ),
                      const SizedBox(width: 14),
                      Expanded(
                        child: Text(
                          shown[i].title,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(fontSize: 16.5),
                        ),
                      ),
                      Text(
                        shown[i].label,
                        style: TextStyle(
                          fontSize: 13.5,
                          color: shown[i].done ? c.success : c.textMuted,
                          fontWeight: shown[i].done
                              ? FontWeight.w500
                              : FontWeight.w400,
                          fontFeatures: const [FontFeature.tabularFigures()],
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 7),
                  Padding(
                    padding: const EdgeInsets.only(left: 36),
                    child: ClipRRect(
                      borderRadius: BorderRadius.circular(2),
                      child: Stack(
                        children: [
                          Container(height: 3, color: c.border),
                          FractionallySizedBox(
                            widthFactor: shown[i].percent / 100,
                            child: BarGrow(
                              child: Container(
                                height: 3,
                                color: shown[i].done ? c.success : c.brand,
                              ),
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ),
        if (h.chapters.length > 6)
          Align(
            alignment: Alignment.centerLeft,
            child: TextButton.icon(
              onPressed: onAll,
              icon: AnimatedRotation(
                turns: all ? 0.25 : 0,
                duration: const Duration(milliseconds: 200),
                child: Icon(LucideIcons.chevronRight, size: 17, color: c.brand),
              ),
              label: Text(
                h.allChaptersLabel,
                style: TextStyle(
                  fontSize: 15,
                  color: c.brand,
                  fontWeight: FontWeight.w500,
                ),
              ),
            ),
          ),
      ],
    );
  }
}

/// Письма близких (кнопка — когда письма появятся в приложении; пока — состояние).
class _Letters extends StatelessWidget {
  const _Letters({required this.h});
  final v1api.CabinetBook h;

  @override
  Widget build(BuildContext context) {
    final c = context.c;
    return Panel(
      padding: const EdgeInsets.all(18),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(LucideIcons.mail, size: 17, color: c.brand),
              const SizedBox(width: 9),
              Text(
                h.letters.title,
                style: const TextStyle(
                  fontSize: 16,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ],
          ),
          const SizedBox(height: 8),
          Text(
            h.letters.text,
            style: TextStyle(fontSize: 15, height: 1.6, color: c.textMuted),
          ),
        ],
      ),
    );
  }
}

/// «Нужна помощь? Напишите нам в WhatsApp».
class _Help extends StatelessWidget {
  const _Help({required this.h});
  final v1api.CabinetBook h;

  @override
  Widget build(BuildContext context) {
    final c = context.c;
    return InkWell(
      onTap: () => launchUrl(
        Uri.parse(h.help.url),
        mode: LaunchMode.externalApplication,
      ),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 6),
        child: Row(
          children: [
            Container(
              width: 38,
              height: 38,
              decoration: BoxDecoration(
                color: c.surface,
                borderRadius: BorderRadius.circular(Cab.ctl),
              ),
              child: Icon(
                LucideIcons.messageCircle,
                size: 17,
                color: c.text.withValues(alpha: 0.8),
              ),
            ),
            const SizedBox(width: 12),
            Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  h.help.title,
                  style: const TextStyle(
                    fontSize: 15,
                    fontWeight: FontWeight.w500,
                  ),
                ),
                Text(
                  h.help.text,
                  style: TextStyle(fontSize: 14.5, color: c.textMuted),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}
