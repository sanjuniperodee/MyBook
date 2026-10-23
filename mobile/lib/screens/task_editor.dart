import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:provider/provider.dart';

import '../core/format.dart';
import '../core/tasks_store.dart';
import '../models/work.dart';
import '../ui/kit.dart';
import '../ui/tokens.dart';

const taskKinds = <String, ({String label, IconData icon})>{
  'task': (label: 'Задача', icon: LucideIcons.squareCheck),
  'call': (label: 'Звонок', icon: LucideIcons.phone),
  'message': (label: 'Написать', icon: LucideIcons.messageCircle),
  'meeting': (label: 'Встреча', icon: LucideIcons.users),
};

IconData taskKindIcon(String kind) => (taskKinds[kind] ?? taskKinds['task']!).icon;

/// Срок для подписи: «Сегодня 15:00», «Завтра», «Вчера 10:30», «12 окт».
String dueLabel(DateTime d, {bool withTime = true}) {
  final now = DateTime.now();
  final timed = d.hour != 0 || d.minute != 0;
  final time = withTime && timed ? ' ${hhmm(d)}' : '';
  if (sameDay(d, now)) return 'Сегодня$time';
  if (sameDay(d, now.add(const Duration(days: 1)))) return 'Завтра$time';
  if (sameDay(d, now.subtract(const Duration(days: 1)))) return 'Вчера$time';
  return '${dayLabel(d)}$time';
}

const _reminders = <({int value, String label})>[
  (value: -1, label: 'Без напоминания'),
  (value: 0, label: 'В срок'),
  (value: 15, label: 'За 15 минут'),
  (value: 60, label: 'За час'),
  (value: 1440, label: 'За день'),
];

/// Лист «Новая задача» / «Изменить задачу»: что сделать, тип, срок (дата и время), напоминание. Возвращает true, если сохранили.
Future<bool> showTaskEditor(BuildContext context, {CrmTask? task, TaskTarget? target, String? contextLabel}) async {
  final store = context.read<TasksStore>();
  final r = await showAppSheet<bool>(
    context,
    title: task == null ? 'Новая задача' : 'Изменить задачу',
    icon: task == null ? LucideIcons.listPlus : LucideIcons.pencil,
    full: true,
    builder: (_) => _TaskEditor(store: store, task: task, target: target, contextLabel: contextLabel),
  );
  return r == true;
}

class _TaskEditor extends StatefulWidget {
  const _TaskEditor({required this.store, this.task, this.target, this.contextLabel});
  final TasksStore store;
  final CrmTask? task;
  final TaskTarget? target;
  final String? contextLabel;

  @override
  State<_TaskEditor> createState() => _TaskEditorState();
}

class _TaskEditorState extends State<_TaskEditor> {
  late final _title = TextEditingController(text: widget.task?.title ?? '');
  late String _kind = widget.task?.kind ?? 'task';
  DateTime? _date;
  TimeOfDay? _time;
  late int _remind = widget.task == null ? -2 : (widget.task!.remindBeforeMin ?? -1); // -2 — как решит сервер, -1 — не напоминать
  bool _busy = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    final due = widget.task?.dueAt;
    if (due != null) {
      _date = DateTime(due.year, due.month, due.day);
      if (due.hour != 0 || due.minute != 0) _time = TimeOfDay(hour: due.hour, minute: due.minute);
    }
  }

  @override
  void dispose() {
    _title.dispose();
    super.dispose();
  }

  DateTime? get _due => _date == null ? null : DateTime(_date!.year, _date!.month, _date!.day, _time?.hour ?? 0, _time?.minute ?? 0);

  DateTime get _today {
    final n = DateTime.now();
    return DateTime(n.year, n.month, n.day);
  }

  Future<void> _pickDate() async {
    final d = await showDatePicker(context: context, initialDate: _date ?? _today, firstDate: _today.subtract(const Duration(days: 30)), lastDate: _today.add(const Duration(days: 730)));
    if (d != null) setState(() => _date = d);
  }

  Future<void> _pickTime() async {
    final t = await showTimePicker(context: context, initialTime: _time ?? const TimeOfDay(hour: 12, minute: 0));
    if (t != null) setState(() => _time = t);
  }

  Future<void> _save() async {
    final title = _title.text.trim();
    if (title.length < 2) {
      setState(() => _error = 'Опишите задачу');
      return;
    }
    setState(() {
      _busy = true;
      _error = null;
    });
    final due = _due;
    final withTime = _time != null;
    final remind = _remind == -2 ? null : _remind;
    final String? err;
    if (widget.task == null) {
      err = await widget.store.create(title: title, due: due, withTime: withTime, kind: _kind, remindBeforeMin: remind, target: widget.target);
    } else {
      err = await widget.store.update(widget.task!, title: title, kind: _kind, due: due, clearDue: due == null, withTime: withTime, remindBeforeMin: remind);
    }
    if (!mounted) return;
    if (err == null) {
      Navigator.pop(context, true);
    } else {
      setState(() {
        _busy = false;
        _error = err;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final c = context.c;
    final today = _today;
    bool isDay(int add) => _date != null && sameDay(_date!, today.add(Duration(days: add)));
    final custom = _date != null && !isDay(0) && !isDay(1) && !isDay(7);
    return SingleChildScrollView(
      padding: const EdgeInsets.fromLTRB(20, 4, 20, 24),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        if (widget.contextLabel != null)
          Padding(
            padding: const EdgeInsets.only(bottom: 12),
            child: Row(children: [Icon(LucideIcons.link, size: 15, color: c.textFaint), const SizedBox(width: 6), Expanded(child: Text(widget.contextLabel!, maxLines: 1, overflow: TextOverflow.ellipsis, style: AppText.caption(context).copyWith(fontSize: 13.5)))]),
          ),
        TextField(controller: _title, autofocus: widget.task == null, textCapitalization: TextCapitalization.sentences, minLines: 1, maxLines: 3, decoration: const InputDecoration(hintText: 'Что нужно сделать')),
        const SizedBox(height: 16),
        SizedBox(
          height: 36,
          child: ListView(scrollDirection: Axis.horizontal, children: [
            for (final e in taskKinds.entries)
              Padding(
                padding: const EdgeInsets.only(right: 8),
                child: _IconPill(icon: e.value.icon, label: e.value.label, selected: _kind == e.key, onTap: () => setState(() => _kind = e.key)),
              ),
          ]),
        ),
        const SizedBox(height: 20),
        Text('СРОК', style: AppText.label(context)),
        const SizedBox(height: 8),
        SizedBox(
          height: 36,
          child: ListView(scrollDirection: Axis.horizontal, children: [
            Padding(padding: const EdgeInsets.only(right: 8), child: FilterPill(label: 'Сегодня', selected: isDay(0), onTap: () => setState(() => _date = today))),
            Padding(padding: const EdgeInsets.only(right: 8), child: FilterPill(label: 'Завтра', selected: isDay(1), onTap: () => setState(() => _date = today.add(const Duration(days: 1))))),
            Padding(padding: const EdgeInsets.only(right: 8), child: FilterPill(label: 'Через неделю', selected: isDay(7), onTap: () => setState(() => _date = today.add(const Duration(days: 7))))),
            Padding(padding: const EdgeInsets.only(right: 8), child: FilterPill(label: custom ? dayLabel(_date!) : 'Другая дата', selected: custom, onTap: _pickDate)),
            FilterPill(label: 'Без срока', selected: _date == null, onTap: () => setState(() {
              _date = null;
              _time = null;
            })),
          ]),
        ),
        if (_date != null) ...[
          const SizedBox(height: 12),
          GestureDetector(
            onTap: _pickTime,
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
              decoration: BoxDecoration(color: c.surface, borderRadius: BorderRadius.circular(Rd.md)),
              child: Row(children: [
                Icon(LucideIcons.clock, size: 19, color: c.textMuted),
                const SizedBox(width: 10),
                Expanded(child: Text(_time == null ? 'Время не задано — до конца дня' : 'Время ${two(_time!.hour)}:${two(_time!.minute)}', style: TextStyle(fontSize: 16, color: _time == null ? c.textFaint : c.text))),
                if (_time != null) GestureDetector(onTap: () => setState(() => _time = null), child: Icon(LucideIcons.circleX, size: 18, color: c.textFaint)) else Icon(LucideIcons.chevronRight, size: 18, color: c.textFaint),
              ]),
            ),
          ),
          const SizedBox(height: 20),
          Text('НАПОМИНАНИЕ', style: AppText.label(context)),
          const SizedBox(height: 8),
          SizedBox(
            height: 36,
            child: ListView(scrollDirection: Axis.horizontal, children: [
              if (_remind == -2) Padding(padding: const EdgeInsets.only(right: 8), child: FilterPill(label: 'По умолчанию', selected: true, onTap: () {})),
              for (final r in _reminders) Padding(padding: const EdgeInsets.only(right: 8), child: FilterPill(label: r.label, selected: _remind == r.value, onTap: () => setState(() => _remind = r.value))),
            ]),
          ),
        ],
        if (_error != null) Padding(padding: const EdgeInsets.only(top: 14), child: Text(_error!, style: TextStyle(color: c.danger, fontWeight: FontWeight.w600))),
        const SizedBox(height: 22),
        PrimaryButton(label: widget.task == null ? 'Добавить задачу' : 'Сохранить', busy: _busy, onPressed: _save),
      ]),
    );
  }
}

class _IconPill extends StatelessWidget {
  const _IconPill({required this.icon, required this.label, required this.selected, required this.onTap});
  final IconData icon;
  final String label;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final c = context.c;
    final fg = selected ? c.brandDeep : c.textMuted;
    return GestureDetector(
      onTap: onTap,
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 160),
        padding: const EdgeInsets.symmetric(horizontal: 14),
        decoration: BoxDecoration(color: selected ? c.brand.withValues(alpha: context.isDark ? 0.22 : 0.14) : c.surface, borderRadius: BorderRadius.circular(18)),
        child: Row(mainAxisSize: MainAxisSize.min, children: [
          Icon(icon, size: 16, color: fg),
          const SizedBox(width: 6),
          Text(label, style: TextStyle(fontSize: 14.5, fontWeight: FontWeight.w600, color: fg, letterSpacing: -0.15)),
        ]),
      ),
    );
  }
}
