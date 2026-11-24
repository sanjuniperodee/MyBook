import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
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

/// Календарь задач — как «Задачи → Календарь» в CRM: месяц повесткой по дням (сегодня — первым на экране), «Мои» по
/// умолчанию. Нажатие — карточка; долгое нажатие — перенести срок. Данные — API v1 tasksCalendar и cardUpdate.
class TasksCalendarScreen extends StatefulWidget {
  const TasksCalendarScreen({super.key});

  @override
  State<TasksCalendarScreen> createState() => _TasksCalendarScreenState();
}

class _TasksCalendarScreenState extends State<TasksCalendarScreen> {
  late DateTime _month = DateTime(DateTime.now().year, DateTime.now().month);
  bool _mine = true;
  List<v1api.CardSummary>? _cards;
  String? _error;

  ApiClient get _api => context.read<AuthState>().api;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final from = _month;
    final to = DateTime(_month.year, _month.month + 1);
    setState(() => _cards = null);
    try {
      final r = await v1(_api, (c) => c.tasksCalendar(from: isoWithOffset(from), to: isoWithOffset(to), mine: _mine ? '1' : null));
      if (mounted) setState(() { _cards = r.cards; _error = null; });
    } on ApiException catch (e) {
      if (mounted) setState(() { _cards = const []; _error = e.message; });
    }
  }

  void _shift(int months) {
    _month = DateTime(_month.year, _month.month + months);
    _load();
  }

  Future<void> _reschedule(v1api.CardSummary card) async {
    final r = await pickDue(context, card.dueAt);
    if (r == null) return;
    try {
      await v1(_api, (c) => c.cardUpdate(cardId: card.id, body: r.cleared ? const v1api.CardPatch(nulls: {'dueAt'}) : v1api.CardPatch(dueAt: isoWithOffset(r.at!))));
      await _load();
    } on ApiException catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
    }
  }

  @override
  Widget build(BuildContext context) {
    final c = context.c;
    final cards = _cards;
    // Повестка: по дням срока; день без срока не бывает — календарь отдаёт только карточки со сроком в месяце.
    final byDay = <DateTime, List<v1api.CardSummary>>{};
    for (final card in cards ?? const <v1api.CardSummary>[]) {
      final d = DateTime.tryParse(card.dueAt ?? card.startAt ?? '')?.toLocal();
      if (d == null) continue;
      byDay.putIfAbsent(DateTime(d.year, d.month, d.day), () => []).add(card);
    }
    final days = byDay.keys.toList()..sort();
    final today = DateTime(DateTime.now().year, DateTime.now().month, DateTime.now().day);
    final title = toBeginningOfSentenceCase(DateFormat('LLLL y', 'ru').format(_month));
    return Scaffold(
      backgroundColor: c.surface,
      appBar: AppBar(
        backgroundColor: c.bg,
        surfaceTintColor: Colors.transparent,
        title: Text('Календарь задач', style: AppText.headline(context)),
        actions: [Padding(padding: const EdgeInsets.only(right: 12), child: FilterPill(label: 'Мои', selected: _mine, onTap: () => setState(() {
          _mine = !_mine;
          _load();
        })))],
      ),
      body: Column(children: [
        Container(
          color: c.bg,
          padding: const EdgeInsets.fromLTRB(8, 0, 8, 8),
          child: Row(children: [
            RoundIconButton(icon: LucideIcons.chevronLeft, onTap: () => _shift(-1), tooltip: 'Прошлый месяц'),
            Expanded(child: Text(title, textAlign: TextAlign.center, style: AppText.title(context))),
            RoundIconButton(icon: LucideIcons.chevronRight, onTap: () => _shift(1), tooltip: 'Следующий месяц'),
          ]),
        ),
        Expanded(
          child: cards == null
              ? const Center(child: CircularProgressIndicator())
              : _error != null
                  ? EmptyState(icon: LucideIcons.wifiOff, title: 'Не удалось загрузить', hint: _error, action: 'Повторить', onAction: _load)
                  : days.isEmpty
                      ? EmptyState(icon: LucideIcons.calendarDays, title: 'В этом месяце задач со сроком нет', hint: _mine ? 'Показаны только ваши — снимите «Мои», чтобы увидеть все' : null)
                      : RefreshIndicator(
                          color: c.brand,
                          onRefresh: _load,
                          child: ListView(
                            padding: const EdgeInsets.fromLTRB(16, 12, 16, 32),
                            children: [
                              for (final day in days) ...[
                                Padding(
                                  padding: const EdgeInsets.fromLTRB(4, 6, 4, 8),
                                  child: Text(
                                    '${day == today ? 'Сегодня · ' : ''}${toBeginningOfSentenceCase(DateFormat('EEEE, d MMMM', 'ru').format(day))}',
                                    style: AppText.label(context).copyWith(color: day == today ? c.brand : (day.isBefore(today) ? c.danger : null), fontSize: 12.5, letterSpacing: 0.2),
                                  ),
                                ),
                                for (final card in byDay[day]!)
                                  Padding(
                                    padding: const EdgeInsets.only(bottom: 8),
                                    child: CardTile(
                                      card: card,
                                      labels: const {},
                                      staff: const {},
                                      onTap: () async {
                                        await Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => CardScreen(cardId: card.id)));
                                        _load();
                                      },
                                      onLongPress: card.editable ? () => _reschedule(card) : null,
                                    ),
                                  ),
                                const SizedBox(height: 6),
                              ],
                            ],
                          ),
                        ),
        ),
      ]),
    );
  }
}
