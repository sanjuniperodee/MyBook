import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:provider/provider.dart';

import '../../api/mybook_api.g.dart' as v1api;
import '../../core/api.dart';
import '../../core/auth.dart';
import '../../core/v1.dart';
import '../../ui/kit.dart';
import '../../ui/tokens.dart';
import 'board_common.dart';
import 'card_screen.dart';

/// Доска: колонки — страницами (листаются вбок, вкладки сверху), карточки — списком. Долгое нажатие на карточку —
/// перенести в другую колонку или отметить выполненной; «+ Карточка» внизу колонки; «Мои» — где я исполнитель.
/// Данные — API v1 (boardDetail, cardMove, cardDone, cardCreate); после своих действий доска перечитывается.
class BoardScreen extends StatefulWidget {
  const BoardScreen({super.key, required this.boardId, required this.title});
  final String boardId;
  final String title;

  @override
  State<BoardScreen> createState() => _BoardScreenState();
}

class _BoardScreenState extends State<BoardScreen> {
  v1api.BoardDetail? _b;
  String? _error;
  bool _mine = false;
  int _page = 0;
  final _pages = PageController(viewportFraction: 0.92);

  ApiClient get _api => context.read<AuthState>().api;
  String get _me => context.read<AuthState>().staff!.id;

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _pages.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    try {
      final b = await v1(_api, (c) => c.boardDetail(boardId: widget.boardId));
      if (mounted) setState(() { _b = b; _error = null; });
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    }
  }

  void _toast(String text) {
    if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(text)));
  }

  List<v1api.CardSummary> _cardsIn(String columnId) {
    final list = _b!.cards.where((c) => c.columnId == columnId && !c.archived && (!_mine || c.assigneeIds.contains(_me))).toList();
    list.sort((a, b) => (a.position ?? 0).compareTo(b.position ?? 0));
    return list;
  }

  Future<void> _open(v1api.CardSummary card) async {
    await Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => CardScreen(cardId: card.id, staff: _b!.staff)));
    _load();
  }

  /// Перенос в конец выбранной колонки (beforeId — последняя карточка там).
  Future<void> _move(v1api.CardSummary card, v1api.BoardColumn to) async {
    final target = _b!.cards.where((c) => c.columnId == to.id && !c.archived && c.id != card.id).toList()..sort((a, b) => (a.position ?? 0).compareTo(b.position ?? 0));
    try {
      await v1(_api, (c) => c.cardMove(cardId: card.id, body: v1api.CardMove(columnId: to.id, beforeId: target.isEmpty ? null : target.last.id)));
      HapticFeedback.selectionClick();
      _toast('«${card.title}» → ${to.name}');
      await _load();
    } on ApiException catch (e) {
      _toast(e.message);
    }
  }

  Future<void> _cardMenu(v1api.CardSummary card) async {
    final b = _b!;
    final done = card.doneAt != null;
    final r = await showAppSheet<String>(context, title: card.title, builder: (sheet) {
      return SingleChildScrollView(
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          GroupCard(padding: const EdgeInsets.fromLTRB(16, 4, 16, 12), children: [
            GroupTile(title: done ? 'Вернуть в работу' : 'Выполнено', icon: done ? LucideIcons.rotateCcw : LucideIcons.circleCheck, iconColor: done ? null : sheet.c.success, onTap: () => Navigator.pop(sheet, 'done')),
            GroupTile(title: 'Открыть карточку', icon: LucideIcons.panelTop, onTap: () => Navigator.pop(sheet, 'open')),
          ]),
          GroupCard(title: 'Перенести в колонку', padding: const EdgeInsets.fromLTRB(16, 0, 16, 24), children: [
            for (final col in b.columns)
              GroupTile(
                title: col.name,
                subtitle: col.done ? 'выполненные' : null,
                icon: col.id == card.columnId ? LucideIcons.check : LucideIcons.arrowRight,
                onTap: col.id == card.columnId ? null : () => Navigator.pop(sheet, 'col:${col.id}'),
              ),
          ]),
        ]),
      );
    });
    if (r == null || !mounted) return;
    if (r == 'open') return _open(card);
    if (r == 'done') {
      try {
        await v1(_api, (c) => c.cardDone(cardId: card.id, body: v1api.CardDone(done: !done)));
        HapticFeedback.mediumImpact();
        await _load();
      } on ApiException catch (e) {
        _toast(e.message);
      }
      return;
    }
    if (r.startsWith('col:')) await _move(card, b.columns.firstWhere((c) => c.id == r.substring(4)));
  }

  Future<void> _add(v1api.BoardColumn col) async {
    final title = await promptText(context, title: 'Новая карточка · ${col.name}', hint: 'что сделать', ok: 'Добавить');
    if (title == null) return;
    try {
      await v1(_api, (c) => c.cardCreate(body: v1api.CardCreate(boardId: widget.boardId, columnId: col.id, title: title, assigneeIds: _mine ? [_me] : null)));
      HapticFeedback.selectionClick();
      await _load();
    } on ApiException catch (e) {
      _toast(e.message);
    }
  }

  @override
  Widget build(BuildContext context) {
    final c = context.c;
    final b = _b;
    return Scaffold(
      backgroundColor: c.surface,
      appBar: AppBar(
        backgroundColor: c.bg,
        surfaceTintColor: Colors.transparent,
        title: Text(b?.board.name ?? widget.title, style: AppText.headline(context)),
        actions: [
          Padding(
            padding: const EdgeInsets.only(right: 12),
            child: FilterPill(label: 'Мои', selected: _mine, onTap: () => setState(() => _mine = !_mine)),
          ),
        ],
      ),
      body: b == null
          ? (_error != null ? EmptyState(icon: LucideIcons.wifiOff, title: 'Не удалось открыть доску', hint: _error, action: 'Повторить', onAction: _load) : const Center(child: CircularProgressIndicator()))
          : Column(children: [
              // Вкладки колонок: где ты и сколько карточек; нажатие — к колонке.
              SizedBox(
                height: 48,
                child: ListView(
                  scrollDirection: Axis.horizontal,
                  padding: const EdgeInsets.fromLTRB(16, 8, 16, 4),
                  children: [
                    for (var i = 0; i < b.columns.length; i++)
                      Padding(
                        padding: const EdgeInsets.only(right: 8),
                        child: FilterPill(
                          label: b.columns[i].name,
                          count: _cardsIn(b.columns[i].id).length,
                          selected: i == _page,
                          dot: b.columns[i].done ? c.success : null,
                          onTap: () => _pages.animateToPage(i, duration: const Duration(milliseconds: 260), curve: Curves.easeOutCubic),
                        ),
                      ),
                  ],
                ),
              ),
              Expanded(
                child: PageView.builder(
                  controller: _pages,
                  itemCount: b.columns.length,
                  onPageChanged: (i) => setState(() => _page = i),
                  itemBuilder: (context, i) => _column(context, b, b.columns[i]),
                ),
              ),
            ]),
    );
  }

  Widget _column(BuildContext context, v1api.BoardDetail b, v1api.BoardColumn col) {
    final c = context.c;
    final cards = _cardsIn(col.id);
    final labels = {for (final l in b.labels) l.id: l};
    final staff = {for (final s in b.staff) s.id: s.label};
    final over = col.wipLimit != null && cards.length > col.wipLimit!;
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 4),
      child: Container(
        margin: const EdgeInsets.fromLTRB(0, 6, 0, 12),
        decoration: BoxDecoration(color: c.bg, borderRadius: BorderRadius.circular(Rd.lg), border: Border.all(color: c.border, width: 0.6)),
        child: Column(children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(14, 12, 10, 6),
            child: Row(children: [
              if (col.done) Padding(padding: const EdgeInsets.only(right: 6), child: Icon(LucideIcons.circleCheck, size: 17, color: c.success)),
              Expanded(child: Text(col.name, style: AppText.headline(context))),
              Text(col.wipLimit == null ? '${cards.length}' : '${cards.length} / ${col.wipLimit}', style: AppText.caption(context).copyWith(color: over ? c.danger : null, fontWeight: FontWeight.w600)),
            ]),
          ),
          Expanded(
            child: RefreshIndicator(
              color: c.brand,
              onRefresh: _load,
              child: ListView.separated(
                physics: const AlwaysScrollableScrollPhysics(),
                padding: const EdgeInsets.fromLTRB(10, 4, 10, 10),
                itemCount: cards.length + 1,
                separatorBuilder: (_, _) => const SizedBox(height: 8),
                itemBuilder: (context, i) {
                  if (i == cards.length) {
                    return TextButton.icon(
                      onPressed: () => _add(col),
                      icon: Icon(LucideIcons.plus, size: 18, color: c.brandDeep),
                      label: Text('Карточка', style: TextStyle(color: c.brandDeep, fontWeight: FontWeight.w600)),
                    );
                  }
                  final card = cards[i];
                  return CardTile(card: card, labels: labels, staff: staff, onTap: () => _open(card), onLongPress: card.editable ? () => _cardMenu(card) : null);
                },
              ),
            ),
          ),
        ]),
      ),
    );
  }
}
