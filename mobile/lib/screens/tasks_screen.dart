import 'package:flutter/cupertino.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:provider/provider.dart';

import '../core/auth.dart';
import '../core/contact_actions.dart';
import '../core/format.dart';
import '../core/nav.dart';
import '../core/notifications_store.dart';
import '../core/tasks_store.dart';
import '../models/work.dart';
import '../ui/kit.dart';
import '../ui/tokens.dart';
import 'calls_screen.dart';
import 'chat_screen.dart';
import 'notifications_screen.dart';
import 'task_editor.dart';

enum _Seg { today, all, done }

/// «Мой день»: что горит (просрочено, ждут ответа, пропущенные звонки, заявки), прогресс плана и список задач.
class TasksScreen extends StatefulWidget {
  const TasksScreen({super.key});

  @override
  State<TasksScreen> createState() => _TasksScreenState();
}

class _TasksScreenState extends State<TasksScreen> {
  _Seg _seg = _Seg.today;

  @override
  void initState() {
    super.initState();
    final s = context.read<TasksStore>();
    if (!s.loaded) s.load();
  }

  Future<void> _refresh() async {
    final s = context.read<TasksStore>();
    await s.load();
    if (_seg == _Seg.done) await s.loadDone();
  }

  void _setSeg(_Seg s) {
    setState(() => _seg = s);
    final store = context.read<TasksStore>();
    if (s == _Seg.done && !store.doneLoaded) store.loadDone();
  }

  @override
  Widget build(BuildContext context) {
    final c = context.c;
    final store = context.watch<TasksStore>();
    final staff = context.watch<AuthState>().staff!;
    final today = store.today;
    final top = MediaQuery.of(context).padding.top;
    final unread = context.watch<NotificationsStore>().unread;

    Widget body;
    if (!store.loaded && store.error == null) {
      body = const SliverFillRemaining(hasScrollBody: false, child: SizedBox(height: 480, child: ChatListSkeleton(rows: 6)));
    } else if (!store.loaded) {
      body = SliverFillRemaining(hasScrollBody: false, child: EmptyState(icon: LucideIcons.wifiOff, title: 'Не удалось загрузить', hint: store.error, action: 'Повторить', onAction: store.load));
    } else {
      body = _list(context, store);
    }

    return Scaffold(
      backgroundColor: c.surface,
      floatingActionButton: Padding(
        padding: const EdgeInsets.only(bottom: 84),
        child: FloatingActionButton(
          backgroundColor: c.brandDeep,
          foregroundColor: Colors.white,
          elevation: 3,
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(18)),
          onPressed: () async {
            HapticFeedback.selectionClick();
            await showTaskEditor(context);
          },
          child: const Icon(LucideIcons.plus, size: 26),
        ),
      ),
      body: CustomScrollView(
        physics: const BouncingScrollPhysics(parent: AlwaysScrollableScrollPhysics()),
        slivers: [
          CupertinoSliverRefreshControl(onRefresh: _refresh),
          SliverToBoxAdapter(
            child: Container(
              color: c.bg,
              padding: EdgeInsets.fromLTRB(20, top + 10, 12, 0),
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Row(children: [
                  Expanded(
                    child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      Text('Мой день', style: AppText.largeTitle(context)),
                      Text(_dateLine(staff.name), style: AppText.sub(context)),
                    ]),
                  ),
                  Stack(clipBehavior: Clip.none, children: [
                    RoundIconButton(icon: LucideIcons.bell, size: 44, onTap: () => Navigator.of(context).push(CupertinoPageRoute<void>(builder: (_) => const NotificationsScreen()))),
                    if (unread > 0) Positioned(right: 0, top: 2, child: CountBadge(unread, color: c.danger)),
                  ]),
                ]),
                const SizedBox(height: 14),
                if (today != null && store.loaded) _Summary(data: today, onSeg: () => _setSeg(_Seg.today)),
                if (today?.plan != null) Padding(padding: const EdgeInsets.fromLTRB(0, 4, 8, 14), child: _PlanCard(plan: today!.plan!)),
                Padding(
                  padding: const EdgeInsets.only(right: 8, top: 4),
                  child: Row(children: [
                    FilterPill(label: 'Сегодня', count: today?.counts.tasks, selected: _seg == _Seg.today, onTap: () => _setSeg(_Seg.today)),
                    const SizedBox(width: 8),
                    FilterPill(label: 'Все', count: store.loaded ? store.open.length : null, selected: _seg == _Seg.all, onTap: () => _setSeg(_Seg.all)),
                    const SizedBox(width: 8),
                    FilterPill(label: 'Готово', selected: _seg == _Seg.done, onTap: () => _setSeg(_Seg.done)),
                  ]),
                ),
                const SizedBox(height: 14),
                Divider(color: c.border),
              ]),
            ),
          ),
          const SliverToBoxAdapter(child: SizedBox(height: 12)),
          body,
          const SliverToBoxAdapter(child: SizedBox(height: 120)),
        ],
      ),
    );
  }

  String _dateLine(String name) {
    final first = name.trim().split(RegExp(r'\s+')).first;
    final h = DateTime.now().hour;
    final hello = h < 5 ? 'Доброй ночи' : h < 12 ? 'Доброе утро' : h < 18 ? 'Добрый день' : 'Добрый вечер';
    return first.isEmpty ? hello : '$hello, $first';
  }

  Widget _list(BuildContext context, TasksStore store) {
    switch (_seg) {
      case _Seg.today:
        final tasks = store.today?.tasks ?? const <CrmTask>[];
        if (tasks.isEmpty) {
          return const SliverFillRemaining(hasScrollBody: false, child: EmptyState(icon: LucideIcons.partyPopper, title: 'На сегодня всё', hint: 'Задач на сегодня нет. Загляните во вкладку «Все» или создайте новую'));
        }
        return _groups(context, [(null, tasks)]);
      case _Seg.all:
        if (store.open.isEmpty) {
          return SliverFillRemaining(hasScrollBody: false, child: EmptyState(icon: LucideIcons.squareCheck, title: 'Открытых задач нет', hint: 'Создайте задачу кнопкой «+»', action: 'Новая задача', onAction: () => showTaskEditor(context)));
        }
        final now = DateTime.now();
        final startOfToday = DateTime(now.year, now.month, now.day);
        final endOfToday = startOfToday.add(const Duration(days: 1));
        final overdue = <CrmTask>[], todayL = <CrmTask>[], later = <CrmTask>[], none = <CrmTask>[];
        for (final t in store.open) {
          if (t.dueAt == null) {
            none.add(t);
          } else if (t.overdue) {
            overdue.add(t);
          } else if (t.dueAt!.isBefore(endOfToday)) {
            todayL.add(t);
          } else {
            later.add(t);
          }
        }
        return _groups(context, [('Просрочено', overdue), ('Сегодня', todayL), ('Позже', later), ('Без срока', none)]);
      case _Seg.done:
        if (!store.doneLoaded) return const SliverFillRemaining(hasScrollBody: false, child: SizedBox(height: 300, child: Center(child: CircularProgressIndicator())));
        if (store.done.isEmpty) return const SliverFillRemaining(hasScrollBody: false, child: EmptyState(icon: LucideIcons.history, title: 'Пока ничего не выполнено'));
        return _groups(context, [(null, store.done)]);
    }
  }

  Widget _groups(BuildContext context, List<(String?, List<CrmTask>)> groups) {
    final children = <Widget>[];
    for (final g in groups) {
      if (g.$2.isEmpty) continue;
      children.add(GroupCard(
        title: g.$1 == null ? null : '${g.$1} · ${g.$2.length}',
        padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
        children: [for (final t in g.$2) TaskTile(task: t)],
      ));
    }
    return SliverList(delegate: SliverChildListDelegate(children));
  }
}

// ─── плитки сверху ───────────────────────────────────────────────────────────

class _Summary extends StatelessWidget {
  const _Summary({required this.data, required this.onSeg});
  final TodayData data;
  final VoidCallback onSeg;

  @override
  Widget build(BuildContext context) {
    final c = context.c;
    final k = data.counts;
    final staff = context.read<AuthState>().staff!;
    final tiles = <_TileData>[
      if (k.overdue > 0) _TileData(LucideIcons.alarmClock, 'Просрочено', k.overdue, c.danger, onSeg),
      if (k.waiting > 0) _TileData(LucideIcons.messageCircleMore, 'Ждут ответа', k.waiting, c.warn, () => _waiting(context)),
      if (k.missed > 0 && staff.can('calls.view')) _TileData(LucideIcons.phoneMissed, 'Пропущенные', k.missed, c.danger, () => Navigator.of(context).push(CupertinoPageRoute<void>(builder: (_) => const CallsScreen()))),
      if (k.unsorted > 0) _TileData(LucideIcons.inbox, 'Новые заявки', k.unsorted, c.violet, () => tabRequest.value = 'deals'),
      if (k.noNextStep > 0) _TileData(LucideIcons.circleAlert, 'Сделки без шага', k.noNextStep, c.warn, () => tabRequest.value = 'deals'),
      if (staff.can('calls.view') && k.missed == 0) _TileData(LucideIcons.phone, 'Звонки', null, c.textMuted, () => Navigator.of(context).push(CupertinoPageRoute<void>(builder: (_) => const CallsScreen()))),
    ];
    if (tiles.isEmpty) return const SizedBox.shrink();
    return Padding(
      padding: const EdgeInsets.only(bottom: 14),
      child: SizedBox(
        height: 78,
        child: ListView.separated(
          scrollDirection: Axis.horizontal,
          clipBehavior: Clip.none,
          itemCount: tiles.length,
          separatorBuilder: (_, _) => const SizedBox(width: 10),
          itemBuilder: (_, i) => _Tile(tiles[i]),
        ),
      ),
    );
  }

  void _waiting(BuildContext context) {
    showAppSheet<void>(
      context,
      title: 'Ждут ответа',
      icon: LucideIcons.messageCircleMore,
      builder: (sheet) {
        final c = sheet.c;
        return ListView(shrinkWrap: true, padding: const EdgeInsets.fromLTRB(16, 0, 16, 24), children: [
          for (final w in data.waiting)
            InkWell(
              borderRadius: BorderRadius.circular(Rd.md),
              onTap: () {
                Navigator.pop(sheet);
                Navigator.of(context).push(CupertinoPageRoute<void>(builder: (_) => ChatScreen(chatId: w.id, title: w.title)));
              },
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 11),
                child: Row(children: [
                  Expanded(
                    child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      Text(w.title, style: AppText.headline(sheet).copyWith(fontSize: 16.5)),
                      if (w.preview.isNotEmpty) Text(w.preview, maxLines: 1, overflow: TextOverflow.ellipsis, style: AppText.sub(sheet)),
                    ]),
                  ),
                  if (w.waitLabel != null) Tag(w.waitLabel!, fg: w.overdue ? c.danger : c.warn, bg: w.overdue ? c.danger.withValues(alpha: 0.12) : c.warnBg),
                ]),
              ),
            ),
          if (data.counts.waiting > data.waiting.length)
            Padding(
              padding: const EdgeInsets.only(top: 8),
              child: TextButton(
                onPressed: () {
                  Navigator.pop(sheet);
                  tabRequest.value = 'chats';
                },
                child: Text('Все диалоги (${data.counts.waiting})', style: TextStyle(color: c.brandDeep, fontWeight: FontWeight.w600)),
              ),
            ),
        ]);
      },
    );
  }
}

class _TileData {
  _TileData(this.icon, this.label, this.count, this.color, this.onTap);
  final IconData icon;
  final String label;
  final int? count;
  final Color color;
  final VoidCallback onTap;
}

class _Tile extends StatelessWidget {
  const _Tile(this.d);
  final _TileData d;

  @override
  Widget build(BuildContext context) {
    final c = context.c;
    return Material(
      color: d.color.withValues(alpha: context.isDark ? 0.18 : 0.1),
      borderRadius: BorderRadius.circular(Rd.lg),
      child: InkWell(
        borderRadius: BorderRadius.circular(Rd.lg),
        onTap: d.onTap,
        child: Container(
          width: 116,
          padding: const EdgeInsets.fromLTRB(12, 10, 10, 10),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
            Row(children: [
              Icon(d.icon, size: 18, color: d.color),
              const Spacer(),
              if (d.count != null) Text('${d.count}', style: TextStyle(fontSize: 22, fontWeight: FontWeight.w800, letterSpacing: -0.5, color: d.color, height: 1)),
            ]),
            Text(d.label, maxLines: 1, overflow: TextOverflow.ellipsis, style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: c.text, letterSpacing: -0.15)),
          ]),
        ),
      ),
    );
  }
}

class _PlanCard extends StatelessWidget {
  const _PlanCard({required this.plan});
  final PlanProgress plan;

  @override
  Widget build(BuildContext context) {
    final c = context.c;
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(color: c.surface, borderRadius: BorderRadius.circular(Rd.lg)),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(children: [
          Icon(LucideIcons.target, size: 17, color: c.brandDeep),
          const SizedBox(width: 8),
          Text('План месяца', style: TextStyle(fontSize: 14, fontWeight: FontWeight.w700, color: c.text)),
          const Spacer(),
          Text('${(plan.ratio * 100).round()}%', style: TextStyle(fontSize: 14, fontWeight: FontWeight.w800, color: c.brandDeep)),
        ]),
        const SizedBox(height: 10),
        ClipRRect(borderRadius: BorderRadius.circular(4), child: LinearProgressIndicator(value: plan.ratio, minHeight: 7, backgroundColor: c.border, valueColor: AlwaysStoppedAnimation(c.brand))),
        const SizedBox(height: 8),
        Text('${money(plan.factAmount)} из ${money(plan.planAmount)}', style: AppText.caption(context).copyWith(fontSize: 13)),
      ]),
    );
  }
}

// ─── строка задачи и её действия ─────────────────────────────────────────────

class TaskTile extends StatelessWidget {
  const TaskTile({super.key, required this.task, this.dense = false});
  final CrmTask task;
  final bool dense;

  @override
  Widget build(BuildContext context) {
    final c = context.c;
    final t = task;
    final store = context.read<TasksStore>();
    final contact = t.contact;
    final canCall = contact != null && (contact.phone != null || contact.pbx);
    final canChat = contact != null && contact.chat;
    return InkWell(
      onTap: () => showTaskActions(context, t),
      child: Padding(
        padding: const EdgeInsets.fromLTRB(14, 12, 10, 12),
        child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
          GestureDetector(
            behavior: HitTestBehavior.opaque,
            onTap: () async {
              HapticFeedback.mediumImpact();
              final err = await store.toggle(t);
              if (err != null && context.mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(err)));
            },
            child: Padding(
              padding: const EdgeInsets.only(right: 12, top: 1, bottom: 8),
              child: AnimatedContainer(
                duration: const Duration(milliseconds: 150),
                width: 26,
                height: 26,
                decoration: BoxDecoration(shape: BoxShape.circle, color: t.done ? c.brand : Colors.transparent, border: Border.all(color: t.done ? c.brand : (t.overdue ? c.danger : c.textFaint), width: 1.7)),
                child: t.done ? Icon(LucideIcons.check, size: 16, color: c.onBrand) : null,
              ),
            ),
          ),
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(t.title, maxLines: 3, overflow: TextOverflow.ellipsis, style: TextStyle(fontSize: 16.5, fontWeight: FontWeight.w500, letterSpacing: -0.2, color: t.done ? c.textFaint : c.text, decoration: t.done ? TextDecoration.lineThrough : null)),
              const SizedBox(height: 5),
              Wrap(spacing: 8, runSpacing: 4, crossAxisAlignment: WrapCrossAlignment.center, children: [
                if (t.dueAt != null)
                  Row(mainAxisSize: MainAxisSize.min, children: [
                    Icon(taskKindIcon(t.kind), size: 13.5, color: t.overdue ? c.danger : c.textMuted),
                    const SizedBox(width: 4),
                    Text(dueLabel(t.dueAt!), style: TextStyle(fontSize: 13.5, fontWeight: t.overdue ? FontWeight.w700 : FontWeight.w500, color: t.overdue ? c.danger : c.textMuted)),
                  ])
                else
                  Row(mainAxisSize: MainAxisSize.min, children: [Icon(taskKindIcon(t.kind), size: 13.5, color: c.textFaint), const SizedBox(width: 4), Text('без срока', style: TextStyle(fontSize: 13.5, color: c.textFaint))]),
                if (t.context != null && t.context!.label.isNotEmpty) Text('· ${t.context!.label}', maxLines: 1, overflow: TextOverflow.ellipsis, style: TextStyle(fontSize: 13.5, color: c.textMuted)),
                if (t.fromBot) Tag('от бота', fg: c.violet, bg: c.violetBg),
              ]),
            ]),
          ),
          if (!t.done && !dense && (canCall || canChat)) ...[
            if (canCall) RoundIconButton(icon: LucideIcons.phone, size: 40, iconSize: 20, color: c.brandDeep, fill: c.brand.withValues(alpha: 0.12), onTap: () => ContactActions(context).call(phone: contact.phone, target: t.target)),
            if (canCall && canChat) const SizedBox(width: 6),
            if (canChat) RoundIconButton(icon: LucideIcons.messageCircle, size: 40, iconSize: 20, color: c.brandDeep, fill: c.brand.withValues(alpha: 0.12), onTap: () => ContactActions(context).chat(target: t.target)),
          ],
        ]),
      ),
    );
  }
}

/// Лист действий по задаче: связаться, открыть, отложить, изменить, удалить.
Future<void> showTaskActions(BuildContext context, CrmTask t) {
  final store = context.read<TasksStore>();
  final actions = ContactActions(context);
  final staff = context.read<AuthState>().staff!;
  void toast(String? err) {
    if (err != null && context.mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(err)));
  }

  return showAppSheet<void>(
    context,
    title: t.title,
    icon: taskKindIcon(t.kind),
    builder: (sheet) {
      final c = sheet.c;
      final hasTarget = t.target.dealId != null || t.target.orderId != null || t.target.clientId != null;
      final canWrite = t.editable && !t.done;
      return ListView(shrinkWrap: true, padding: const EdgeInsets.only(bottom: 20), children: [
        if (t.dueAt != null) Padding(padding: const EdgeInsets.fromLTRB(20, 0, 20, 10), child: Text(dueLabel(t.dueAt!), style: TextStyle(fontSize: 15, fontWeight: FontWeight.w600, color: t.overdue ? c.danger : c.textMuted))),
        GroupCard(padding: const EdgeInsets.fromLTRB(16, 0, 16, 12), children: [
          if (hasTarget && (t.contact?.phone != null || staff.can('calls.make')))
            GroupTile(icon: LucideIcons.phone, title: 'Позвонить', onTap: () {
              Navigator.pop(sheet);
              actions.call(phone: t.contact?.phone, target: t.target);
            }),
          if (hasTarget && staff.can('chats.send'))
            GroupTile(icon: LucideIcons.messageCircle, title: 'Написать в WhatsApp', onTap: () {
              Navigator.pop(sheet);
              actions.chat(target: t.target);
            }),
          if (t.context != null)
            GroupTile(icon: t.context!.type == 'deal' ? LucideIcons.handshake : LucideIcons.user, title: t.context!.type == 'deal' ? 'Открыть сделку' : t.context!.type == 'order' ? 'Открыть заказ' : 'Открыть клиента', subtitle: t.context!.label, onTap: t.context!.type == 'order'
                ? null
                : () {
                    Navigator.pop(sheet);
                    actions.openContext(t.context!);
                  }),
        ]),
        GroupCard(padding: const EdgeInsets.fromLTRB(16, 0, 16, 12), children: [
          GroupTile(
            icon: t.done ? LucideIcons.undo2 : LucideIcons.circleCheck,
            iconColor: t.done ? c.textMuted : c.success,
            title: t.done ? 'Вернуть в работу' : 'Выполнено',
            onTap: () async {
              Navigator.pop(sheet);
              toast(await store.toggle(t));
            },
          ),
          if (canWrite) ...[
            GroupTile(icon: LucideIcons.clock, iconColor: c.warn, title: 'Отложить на час', onTap: () async {
              Navigator.pop(sheet);
              toast(await store.snooze(t, 'hour'));
            }),
            GroupTile(icon: LucideIcons.sunrise, iconColor: c.warn, title: 'Отложить на завтра', onTap: () async {
              Navigator.pop(sheet);
              toast(await store.snooze(t, 'tomorrow'));
            }),
            GroupTile(icon: LucideIcons.pencil, iconColor: c.textMuted, title: 'Изменить', onTap: () {
              Navigator.pop(sheet);
              showTaskEditor(context, task: t, contextLabel: t.context?.label);
            }),
            GroupTile(icon: LucideIcons.trash2, title: 'Удалить', destructive: true, onTap: () async {
              Navigator.pop(sheet);
              if (await confirm(context, title: 'Удалить задачу?', message: t.title, ok: 'Удалить', destructive: true)) toast(await store.remove(t));
            }),
          ],
        ]),
      ]);
    },
  );
}
