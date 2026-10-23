import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../models/work.dart';
import 'api.dart';
import 'live.dart';
import 'notifier.dart';

/// Задачи и «Мой день»: загрузка, действия (выполнить, отложить, создать, изменить, удалить) и напоминания на телефоне.
class TasksStore extends ChangeNotifier {
  TasksStore(this.api, this.live, this.notifier, {required this.myId}) {
    _sub = live.events.listen((e) {
      if (e.type == 'notify' || e.type == 'tick' || e.type == 'chat') _soon(e.type == 'chat' ? const Duration(seconds: 3) : const Duration(milliseconds: 600));
    });
  }

  final ApiClient api;
  final LiveService live;
  final Notifier notifier;
  final String myId;
  StreamSubscription<LiveEvent>? _sub;
  Timer? _debounce;

  TodayData? today;
  List<CrmTask> open = [];
  List<CrmTask> done = [];
  bool loaded = false;
  bool doneLoaded = false;
  String? error;

  /// Число для бейджа вкладки: задачи на сегодня.
  int get badge => today?.counts.tasks ?? 0;
  int get overdueCount => today?.counts.overdue ?? 0;

  void _soon(Duration d) {
    _debounce?.cancel();
    _debounce = Timer(d, () => load(silent: true));
  }

  Future<void> load({bool silent = false}) async {
    try {
      final results = await Future.wait([api.get('/api/mobile/today'), api.get('/api/mobile/tasks')]);
      today = TodayData.fromJson(results[0] as Map<String, dynamic>);
      open = [for (final t in ((results[1] as Map<String, dynamic>)['tasks'] as List)) CrmTask.fromJson(t as Map<String, dynamic>)];
      error = null;
      loaded = true;
      unawaited(_syncReminders());
    } on ApiException catch (e) {
      if (!silent || !loaded) error = e.message;
    }
    notifyListeners();
  }

  Future<void> loadDone() async {
    try {
      final r = await api.get('/api/mobile/tasks', query: {'done': '1'}) as Map<String, dynamic>;
      done = [for (final t in (r['tasks'] as List)) CrmTask.fromJson(t as Map<String, dynamic>)];
      doneLoaded = true;
      notifyListeners();
    } on ApiException {
      // Список выполненных подождёт.
    }
  }

  Future<String?> toggle(CrmTask t) async {
    final was = t.done;
    t.done = !was;
    notifyListeners();
    try {
      await api.post('/api/mobile/tasks/${t.id}/toggle');
      await load(silent: true);
      if (doneLoaded) unawaited(loadDone());
      return null;
    } on ApiException catch (e) {
      t.done = was;
      notifyListeners();
      return e.message;
    }
  }

  /// by: hour — через час, tomorrow — завтра (срок считает сервер).
  Future<String?> snooze(CrmTask t, String by) async {
    try {
      await api.post('/api/mobile/tasks/${t.id}/snooze', body: {'by': by});
      await load(silent: true);
      return null;
    } on ApiException catch (e) {
      return e.message;
    }
  }

  Future<String?> create({required String title, DateTime? due, bool withTime = true, String kind = 'task', int? remindBeforeMin, TaskTarget? target}) async {
    try {
      await api.post('/api/mobile/tasks', body: {
        'title': title,
        'kind': kind,
        if (due != null) 'dueAt': _date(due),
        if (due != null && withTime) 'dueTime': _time(due),
        if (remindBeforeMin != null) 'remindBeforeMin': remindBeforeMin < 0 ? 'none' : remindBeforeMin,
        ...?target?.toJson(),
      });
      await load(silent: true);
      return null;
    } on ApiException catch (e) {
      return e.message;
    }
  }

  Future<String?> update(CrmTask t, {String? title, String? kind, DateTime? due, bool clearDue = false, bool withTime = true, int? remindBeforeMin}) async {
    try {
      await api.patch('/api/mobile/tasks/${t.id}', body: {
        'title': ?title,
        'kind': ?kind,
        if (clearDue) 'dueAt': '' else if (due != null) 'dueAt': withTime ? '${_date(due)}T${_time(due)}' : _date(due),
        if (remindBeforeMin != null) 'remindBeforeMin': remindBeforeMin < 0 ? 'none' : '$remindBeforeMin',
      });
      await load(silent: true);
      return null;
    } on ApiException catch (e) {
      return e.message;
    }
  }

  Future<String?> remove(CrmTask t) async {
    try {
      await api.delete('/api/mobile/tasks/${t.id}');
      open.removeWhere((x) => x.id == t.id);
      notifyListeners();
      await load(silent: true);
      return null;
    } on ApiException catch (e) {
      return e.message;
    }
  }

  static String _date(DateTime d) => '${d.year.toString().padLeft(4, '0')}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';
  static String _time(DateTime d) => '${d.hour.toString().padLeft(2, '0')}:${d.minute.toString().padLeft(2, '0')}';

  // ─── напоминания на телефоне ────────────────────────────────────────────────

  static int _reminderId(String taskId) => taskId.hashCode & 0x3fffffff;

  /// Ставит напоминания на ближайшие свои задачи со сроком — на время «срок минус напоминание». Если сервер сам шлёт push
  /// на этот телефон, расписание не нужно (иначе пришло бы два уведомления) — старое снимаем.
  Future<void> _syncReminders() async {
    final prefs = await SharedPreferences.getInstance();
    final previous = {...?prefs.getStringList('task_reminder_ids')};
    final wanted = <int, CrmTask>{};
    if (!notifier.serverPush && notifier.enabled) {
      final now = DateTime.now();
      final mine = open.where((t) => !t.done && t.dueAt != null && t.remindBeforeMin != null && (t.assigneeId == myId) && t.dueAt!.subtract(Duration(minutes: t.remindBeforeMin!)).isAfter(now)).toList()..sort((a, b) => a.dueAt!.compareTo(b.dueAt!));
      for (final t in mine.take(40)) {
        wanted[_reminderId(t.id)] = t;
      }
    }
    for (final id in previous) {
      final n = int.tryParse(id);
      if (n != null && !wanted.containsKey(n)) await notifier.cancelReminder(n);
    }
    for (final e in wanted.entries) {
      final t = e.value;
      final lead = t.remindBeforeMin!;
      final when = t.dueAt!.subtract(Duration(minutes: lead));
      await notifier.scheduleReminder(
        id: e.key,
        at: when,
        title: lead > 0 ? 'Через $lead мин: ${t.title}' : 'Срок задачи: ${t.title}',
        body: t.context?.label ?? '',
        payload: t.context?.type == 'deal' ? '/admin/deals/${t.context!.id}' : t.context?.type == 'client' ? '/admin/clients/${t.context!.id}' : '/admin/tasks',
      );
    }
    await prefs.setStringList('task_reminder_ids', [for (final k in wanted.keys) '$k']);
  }

  @override
  void dispose() {
    _sub?.cancel();
    _debounce?.cancel();
    super.dispose();
  }
}
