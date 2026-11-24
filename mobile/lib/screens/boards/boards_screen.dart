import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:provider/provider.dart';

import '../../api/mybook_api.g.dart' as v1api;
import '../../core/api.dart';
import '../../core/auth.dart';
import '../../core/v1.dart';
import '../../ui/kit.dart';
import '../../ui/tokens.dart';
import 'board_common.dart';
import 'board_screen.dart';
import 'tasks_calendar_screen.dart';

/// Доски задач — как «Задачи → Доски» в CRM: отделы, проекты, личные; счётчик открытых карточек. Календарь — справа вверху.
class BoardsScreen extends StatefulWidget {
  const BoardsScreen({super.key});

  @override
  State<BoardsScreen> createState() => _BoardsScreenState();
}

class _BoardsScreenState extends State<BoardsScreen> {
  List<v1api.BoardInfo>? _boards;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final r = await v1(context.read<AuthState>().api, (c) => c.boardsList());
      if (mounted) setState(() { _boards = r.boards; _error = null; });
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    }
  }

  @override
  Widget build(BuildContext context) {
    final c = context.c;
    final boards = _boards;
    const groups = [('team', 'Отделы'), ('project', 'Проекты'), ('personal', 'Личные')];
    return Scaffold(
      backgroundColor: c.surface,
      // Крупный заголовок, как у других разделов (обёртка раздела в «Ещё» даёт только кнопку «назад»).
      appBar: PreferredSize(
        preferredSize: const Size.fromHeight(64),
        child: Container(
          color: c.bg,
          padding: EdgeInsets.fromLTRB(20, MediaQuery.of(context).padding.top + 6, 10, 8),
          child: Row(children: [
            Expanded(child: Text('Доски', style: AppText.largeTitle(context))),
            RoundIconButton(
              icon: LucideIcons.calendarDays,
              size: 44,
              iconSize: 22,
              tooltip: 'Календарь задач',
              onTap: () => Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => const TasksCalendarScreen())),
            ),
          ]),
        ),
      ),
      body: boards == null
          ? (_error != null ? EmptyState(icon: LucideIcons.wifiOff, title: 'Не удалось загрузить доски', hint: _error, action: 'Повторить', onAction: _load) : const Center(child: CircularProgressIndicator()))
          : RefreshIndicator(
              color: c.brand,
              onRefresh: _load,
              child: boards.isEmpty
                  ? ListView(children: const [SizedBox(height: 120), EmptyState(icon: LucideIcons.squareKanban, title: 'Досок пока нет', hint: 'Доски создаются в CRM на сайте: «Задачи» → «Доски»')])
                  : ListView(
                      physics: const AlwaysScrollableScrollPhysics(),
                      padding: const EdgeInsets.fromLTRB(16, 12, 16, 32),
                      children: [
                        for (final (kind, title) in groups)
                          if (boards.any((b) => b.kind == kind))
                            GroupCard(
                              title: title,
                              padding: const EdgeInsets.only(bottom: 18),
                              children: [
                                for (final b in boards.where((b) => b.kind == kind))
                                  GroupTile(
                                    title: b.name,
                                    subtitle: b.description?.isNotEmpty == true ? b.description : (b.isDefault ? 'доска по умолчанию' : null),
                                    icon: LucideIcons.squareKanban,
                                    iconColor: tokenColor(context, b.color),
                                    trailing: Row(mainAxisSize: MainAxisSize.min, children: [
                                      if ((b.openCards ?? 0) > 0) CountBadge(b.openCards!),
                                      const SizedBox(width: 4),
                                      Icon(LucideIcons.chevronRight, size: 18, color: c.textFaint),
                                    ]),
                                    onTap: () async {
                                      await Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => BoardScreen(boardId: b.id, title: b.name)));
                                      _load();
                                    },
                                  ),
                              ],
                            ),
                      ],
                    ),
            ),
    );
  }
}
