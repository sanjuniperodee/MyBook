import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:provider/provider.dart';

import '../../ui/kit.dart';
import '../../ui/tokens.dart';
import '../data/models.dart';
import '../data/session.dart';
import '../data/stores.dart';
import 'answer_screen.dart';
import 'photos_screen.dart';

/// Книга: ход работы, главы с вопросами и фото. Как главная страница книги в кабинете.
class BookScreen extends StatefulWidget {
  const BookScreen({super.key, required this.summary, this.writeSectionId});
  final BookSummary summary;

  /// «Продолжить писать» с полки: сразу открыть этот раздел ('' — первый без ответа).
  final String? writeSectionId;

  @override
  State<BookScreen> createState() => _BookScreenState();
}

class _BookScreenState extends State<BookScreen> {
  late final BookStore _store = BookStore(context.read<ClientSession>().backend, widget.summary.id);

  @override
  void initState() {
    super.initState();
    _store.load().then((_) {
      final want = widget.writeSectionId;
      final qs = _store.book?.questions ?? const <Question>[];
      if (want == null || !mounted || qs.isEmpty) return;
      final q = qs.where((x) => x.id == want).firstOrNull ?? qs.where((x) => !x.answered).firstOrNull ?? qs.first;
      _open(q);
    });
  }

  @override
  void dispose() {
    _store.dispose();
    super.dispose();
  }

  void _open(Question q) => Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => AnswerScreen(store: _store, questionId: q.id)));

  @override
  Widget build(BuildContext context) {
    final c = context.c;
    return ListenableBuilder(
      listenable: _store,
      builder: (context, _) {
        final book = _store.book;
        return Scaffold(
          backgroundColor: c.bg,
          appBar: AppBar(backgroundColor: c.bg, surfaceTintColor: Colors.transparent),
          body: book == null
              ? (_store.error == null
                  ? const Center(child: CircularProgressIndicator())
                  : EmptyState(icon: LucideIcons.wifiOff, title: 'Книга не открылась', hint: _store.error, action: 'Повторить', onAction: _store.load))
              : RefreshIndicator(
                  color: c.brand,
                  onRefresh: _store.load,
                  child: ListView(
                    physics: const AlwaysScrollableScrollPhysics(parent: BouncingScrollPhysics()),
                    padding: const EdgeInsets.fromLTRB(16, 8, 16, 40),
                    children: [
                      _Header(book: book),
                      if (!book.editable) ...[const SizedBox(height: 12), _Locked()],
                      const SizedBox(height: 20),
                      GroupCard(padding: EdgeInsets.zero, children: [
                        GroupTile(
                          title: 'Фото',
                          subtitle: book.photos.isNotEmpty
                              ? '${book.photos.length} из ${book.maxPhotos}'
                              : widget.summary.photos > 0
                                  ? 'В книге ${widget.summary.photos} фото — добавьте ещё'
                                  : 'Добавьте снимки — они встанут в книгу',
                          icon: LucideIcons.images,
                          iconColor: c.violet,
                          onTap: () => Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => PhotosScreen(store: _store, inBook: widget.summary.photos))),
                        ),
                      ]),
                      const SizedBox(height: 24),
                      for (final ch in book.chapters)
                        if (book.inChapter(ch.key).isNotEmpty) _ChapterBlock(chapter: ch, questions: book.inChapter(ch.key), onOpen: _open),
                      // Вопросы вне известных глав (своя книга без глав) — одним блоком.
                      if (book.questions.any((q) => !book.chapters.any((ch) => ch.key == q.chapter)))
                        _ChapterBlock(chapter: const Chapter(key: '', title: 'Вопросы'), questions: book.questions.where((q) => !book.chapters.any((ch) => ch.key == q.chapter)).toList(), onOpen: _open),
                    ],
                  ),
                ),
        );
      },
    );
  }
}

class _Header extends StatelessWidget {
  const _Header({required this.book});
  final BookModel book;

  @override
  Widget build(BuildContext context) {
    final c = context.c;
    final total = book.questions.length;
    return Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
      const SizedBox(width: 0),
      const SizedBox(width: 18),
      Expanded(
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(book.title, style: AppText.serif(context, size: 27, weight: FontWeight.w600).copyWith(height: 1.1)),
          const SizedBox(height: 10),
          Text('Отвечено ${book.answered} из $total', style: AppText.sub(context)),
          const SizedBox(height: 8),
          ClipRRect(borderRadius: BorderRadius.circular(3), child: LinearProgressIndicator(value: total == 0 ? 0 : book.answered / total, minHeight: 5, color: c.brand, backgroundColor: c.surface)),
        ]),
      ),
    ]);
  }
}

class _Locked extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    final c = context.c;
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(color: c.violetBg, borderRadius: BorderRadius.circular(10)),
      child: Row(children: [
        Icon(LucideIcons.lock, size: 17, color: c.violet),
        const SizedBox(width: 10),
        Expanded(child: Text('Книга заказана — тексты и фото больше не меняются. Её можно читать.', style: TextStyle(color: c.violet, fontSize: 14, height: 1.35))),
      ]),
    );
  }
}

class _ChapterBlock extends StatelessWidget {
  const _ChapterBlock({required this.chapter, required this.questions, required this.onOpen});
  final Chapter chapter;
  final List<Question> questions;
  final void Function(Question) onOpen;

  @override
  Widget build(BuildContext context) {
    final c = context.c;
    final done = questions.where((q) => q.answered).length;
    return Padding(
      padding: const EdgeInsets.only(bottom: 22),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(4, 0, 4, 8),
          child: Row(crossAxisAlignment: CrossAxisAlignment.baseline, textBaseline: TextBaseline.alphabetic, children: [
            Expanded(child: Text(chapter.title, style: AppText.serif(context, size: 22, weight: FontWeight.w600))),
            Text('$done / ${questions.length}', style: AppText.caption(context)),
          ]),
        ),
        Container(
          decoration: BoxDecoration(color: c.surfaceRaised, borderRadius: BorderRadius.circular(14), border: Border.all(color: c.border)),
          clipBehavior: Clip.antiAlias,
          child: Column(children: [
            for (var i = 0; i < questions.length; i++) ...[
              InkWell(
                onTap: () => onOpen(questions[i]),
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(14, 13, 12, 13),
                  child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Padding(
                      padding: const EdgeInsets.only(top: 1),
                      child: Icon(questions[i].answered ? LucideIcons.circleCheck : LucideIcons.circle, size: 19, color: questions[i].answered ? c.success : c.textFaint),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                        Text(questions[i].prompt.isNotEmpty ? questions[i].prompt : questions[i].title, style: AppText.body(context).copyWith(fontSize: 15.5, height: 1.35)),
                        if (questions[i].answered) ...[
                          const SizedBox(height: 4),
                          Text(questions[i].answer.trim().replaceAll(RegExp(r'\s+'), ' '), maxLines: 2, overflow: TextOverflow.ellipsis, style: AppText.serif(context, size: 15.5).copyWith(color: c.textMuted)),
                        ],
                      ]),
                    ),
                    Icon(LucideIcons.chevronRight, size: 17, color: c.textFaint),
                  ]),
                ),
              ),
              if (i < questions.length - 1) Divider(indent: 45, color: c.border),
            ],
          ]),
        ),
      ]),
    );
  }
}
