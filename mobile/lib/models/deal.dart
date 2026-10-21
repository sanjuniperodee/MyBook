class Stage {
  Stage({required this.id, required this.name, required this.color, required this.kind});
  final String id;
  final String name;
  final String color;
  final String kind;
  factory Stage.fromJson(Map<String, dynamic> j) => Stage(id: j['id'] as String, name: j['name'] as String, color: (j['color'] as String?) ?? '#888888', kind: (j['kind'] as String?) ?? 'open');
}

class DealRow {
  DealRow({
    required this.id,
    required this.number,
    required this.title,
    required this.contactName,
    required this.stageId,
    required this.amount,
    required this.paid,
    required this.source,
    required this.assignee,
    required this.unsorted,
    required this.unread,
    required this.daysInStage,
    required this.taskAt,
    required this.taskOverdue,
  });

  final String id;
  final int number;
  final String title;
  final String contactName;
  final String stageId;
  final int amount;
  final int paid;
  final String source;
  final String? assignee;
  final bool unsorted;
  final int unread;
  final int daysInStage;
  final DateTime? taskAt;
  final bool taskOverdue;

  factory DealRow.fromJson(Map<String, dynamic> j) {
    final task = j['nextTask'] as Map<String, dynamic>?;
    return DealRow(
      id: j['id'] as String,
      number: (j['number'] as num).toInt(),
      title: (j['title'] as String?) ?? '',
      contactName: (j['contactName'] as String?) ?? '',
      stageId: j['stageId'] as String,
      amount: (j['amount'] as num?)?.toInt() ?? 0,
      paid: (j['paid'] as num?)?.toInt() ?? 0,
      source: (j['source'] as String?) ?? '',
      assignee: j['assignee'] as String?,
      unsorted: j['unsorted'] == true,
      unread: (j['unread'] as num?)?.toInt() ?? 0,
      daysInStage: (j['daysInStage'] as num?)?.toInt() ?? 0,
      taskAt: task == null ? null : DateTime.parse(task['at'] as String).toLocal(),
      taskOverdue: task?['overdue'] == true,
    );
  }
}

class DealsData {
  DealsData({required this.stages, required this.deals, required this.pipelineName});
  final List<Stage> stages;
  final List<DealRow> deals;
  final String pipelineName;

  factory DealsData.fromJson(Map<String, dynamic> j) => DealsData(
        stages: [for (final s in (j['stages'] as List)) Stage.fromJson(s as Map<String, dynamic>)],
        deals: [for (final d in (j['deals'] as List)) DealRow.fromJson(d as Map<String, dynamic>)],
        pipelineName: ((j['pipeline'] as Map<String, dynamic>?)?['name'] as String?) ?? '',
      );
}

class TaskItem {
  TaskItem({required this.id, required this.title, required this.dueAt, required this.done});
  final String id;
  final String title;
  final DateTime? dueAt;
  bool done;
  factory TaskItem.fromJson(Map<String, dynamic> j) => TaskItem(id: j['id'] as String, title: j['title'] as String, dueAt: j['dueAt'] == null ? null : DateTime.parse(j['dueAt'] as String).toLocal(), done: j['done'] == true);
}

class NoteItem {
  NoteItem({required this.id, required this.text, required this.at, required this.author});
  final String id;
  final String text;
  final DateTime at;
  final String? author;
  factory NoteItem.fromJson(Map<String, dynamic> j) => NoteItem(id: j['id'] as String, text: (j['text'] as String?) ?? '', at: DateTime.parse(j['at'] as String).toLocal(), author: j['author'] as String?);
}

class PaymentItem {
  PaymentItem({required this.amount, required this.kind, required this.method, required this.at});
  final int amount;
  final String kind;
  final String method;
  final DateTime at;
  factory PaymentItem.fromJson(Map<String, dynamic> j) => PaymentItem(amount: (j['amount'] as num).toInt(), kind: (j['kind'] as String?) ?? '', method: (j['method'] as String?) ?? '', at: DateTime.parse(j['at'] as String).toLocal());
}
