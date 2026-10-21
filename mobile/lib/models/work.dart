/// К чему относится задача: сделка, заказ или клиент — по нему приложение открывает экран, звонит и пишет.
class TaskContext {
  TaskContext({required this.type, required this.id, required this.label});
  final String type; // deal | order | client
  final String id;
  final String label;

  factory TaskContext.fromJson(Map<String, dynamic> j) => TaskContext(type: j['type'] as String, id: j['id'] as String, label: (j['label'] as String?) ?? '');
}

/// Как связаться по задаче «Моего дня»: номер (если виден сотруднику) и доступны ли звонок через АТС и чат.
class TaskContact {
  TaskContact({required this.phone, required this.pbx, required this.chat});
  final String? phone;
  final bool pbx;
  final bool chat;

  factory TaskContact.fromJson(Map<String, dynamic> j) => TaskContact(phone: j['phone'] as String?, pbx: j['pbx'] == true, chat: j['chat'] == true);
}

class TaskTarget {
  TaskTarget({this.dealId, this.orderId, this.clientId});
  final String? dealId;
  final String? orderId;
  final String? clientId;

  Map<String, dynamic> toJson() => {if (dealId != null) 'dealId': dealId, if (orderId != null) 'orderId': orderId, if (clientId != null) 'clientId': clientId};

  factory TaskTarget.fromJson(Map<String, dynamic> j) => TaskTarget(dealId: j['dealId'] as String?, orderId: j['orderId'] as String?, clientId: j['clientId'] as String?);
}

class CrmTask {
  CrmTask({
    required this.id,
    required this.title,
    required this.kind,
    required this.dueAt,
    required this.overdue,
    required this.done,
    required this.remindBeforeMin,
    required this.fromBot,
    required this.editable,
    required this.context,
    required this.target,
    this.assigneeId,
    this.contact,
  });

  final String id;
  final String title;
  final String kind; // task | call | message | meeting
  final DateTime? dueAt;
  bool overdue;
  bool done;
  final int? remindBeforeMin;
  final bool fromBot;
  final bool editable;
  final TaskContext? context;
  final TaskTarget target;
  final String? assigneeId;
  final TaskContact? contact;

  factory CrmTask.fromJson(Map<String, dynamic> j) => CrmTask(
        id: j['id'] as String,
        title: (j['title'] as String?) ?? '',
        kind: (j['kind'] as String?) ?? 'task',
        dueAt: j['dueAt'] == null ? null : DateTime.parse(j['dueAt'] as String).toLocal(),
        overdue: j['overdue'] == true,
        done: j['done'] == true,
        remindBeforeMin: (j['remindBeforeMin'] as num?)?.toInt(),
        fromBot: j['fromBot'] == true,
        editable: j['editable'] != false,
        context: j['context'] == null ? null : TaskContext.fromJson(j['context'] as Map<String, dynamic>),
        target: TaskTarget.fromJson((j['target'] as Map<String, dynamic>?) ?? const {}),
        assigneeId: j['assigneeId'] as String?,
        contact: j['contact'] == null ? null : TaskContact.fromJson(j['contact'] as Map<String, dynamic>),
      );
}

class TodayCounts {
  TodayCounts({required this.tasks, required this.overdue, required this.waiting, required this.missed, required this.unsorted, required this.openDeals, required this.openDealsSum, required this.noNextStep});
  final int tasks;
  final int overdue;
  final int waiting;
  final int missed;
  final int unsorted;
  final int openDeals;
  final int openDealsSum;
  final int noNextStep;

  factory TodayCounts.fromJson(Map<String, dynamic> j) => TodayCounts(
        tasks: (j['tasks'] as num?)?.toInt() ?? 0,
        overdue: (j['overdueTasks'] as num?)?.toInt() ?? 0,
        waiting: (j['waiting'] as num?)?.toInt() ?? 0,
        missed: (j['missed'] as num?)?.toInt() ?? 0,
        unsorted: (j['unsorted'] as num?)?.toInt() ?? 0,
        openDeals: (j['openDeals'] as num?)?.toInt() ?? 0,
        openDealsSum: (j['openDealsSum'] as num?)?.toInt() ?? 0,
        noNextStep: (j['noNextStep'] as num?)?.toInt() ?? 0,
      );
}

class PlanProgress {
  PlanProgress({required this.planAmount, required this.factAmount, required this.planDeals, required this.factDeals});
  final int planAmount;
  final int factAmount;
  final int planDeals;
  final int factDeals;

  double get ratio => planAmount == 0 ? 0 : (factAmount / planAmount).clamp(0.0, 1.0);

  factory PlanProgress.fromJson(Map<String, dynamic> j) => PlanProgress(
        planAmount: (j['planAmount'] as num).toInt(),
        factAmount: (j['factAmount'] as num).toInt(),
        planDeals: (j['planDeals'] as num?)?.toInt() ?? 0,
        factDeals: (j['factDeals'] as num?)?.toInt() ?? 0,
      );
}

class WaitingChat {
  WaitingChat({required this.id, required this.title, required this.channelLabel, required this.preview, required this.waitLabel, required this.overdue});
  final String id;
  final String title;
  final String channelLabel;
  final String preview;
  final String? waitLabel;
  final bool overdue;

  factory WaitingChat.fromJson(Map<String, dynamic> j) => WaitingChat(
        id: j['id'] as String,
        title: (j['title'] as String?) ?? '',
        channelLabel: (j['channelLabel'] as String?) ?? '',
        preview: (j['preview'] as String?) ?? '',
        waitLabel: j['waitLabel'] as String?,
        overdue: j['overdue'] == true,
      );
}

class CallItem {
  CallItem({required this.id, required this.direction, required this.status, required this.at, required this.durationSec, required this.phone, required this.name, required this.handled, required this.dealId, required this.clientId});
  final String id;
  final String direction;
  final String status;
  final DateTime at;
  final int durationSec;
  final String? phone;
  final String? name;
  bool handled;
  final String? dealId;
  final String? clientId;

  bool get missedIncoming => status == 'missed' && direction == 'in';

  factory CallItem.fromJson(Map<String, dynamic> j) => CallItem(
        id: j['id'] as String,
        direction: (j['direction'] as String?) ?? 'in',
        status: (j['status'] as String?) ?? '',
        at: DateTime.parse(j['at'] as String).toLocal(),
        durationSec: (j['durationSec'] as num?)?.toInt() ?? 0,
        phone: j['phone'] as String?,
        name: j['name'] as String?,
        handled: j['handled'] == true,
        dealId: j['dealId'] as String?,
        clientId: j['clientId'] as String?,
      );
}

class TodayData {
  TodayData({required this.counts, required this.plan, required this.tasks, required this.waiting, required this.missed});
  final TodayCounts counts;
  final PlanProgress? plan;
  final List<CrmTask> tasks;
  final List<WaitingChat> waiting;
  final List<CallItem> missed;

  factory TodayData.fromJson(Map<String, dynamic> j) => TodayData(
        counts: TodayCounts.fromJson(j['counts'] as Map<String, dynamic>),
        plan: j['plan'] == null ? null : PlanProgress.fromJson(j['plan'] as Map<String, dynamic>),
        tasks: [for (final t in (j['tasks'] as List)) CrmTask.fromJson(t as Map<String, dynamic>)],
        waiting: [for (final c in (j['waiting'] as List)) WaitingChat.fromJson(c as Map<String, dynamic>)],
        missed: [
          for (final c in (j['missed'] as List))
            CallItem.fromJson({
              ...(c as Map<String, dynamic>),
              'direction': 'in',
              'status': 'missed',
            }),
        ],
      );
}

class ClientRow {
  ClientRow({required this.id, required this.name, required this.phone, required this.ltv, required this.orders, required this.books, required this.lastSeenAt, required this.tags});
  final String id;
  final String name;
  final String? phone;
  final int ltv;
  final int orders;
  final int books;
  final DateTime? lastSeenAt;
  final List<String> tags;

  factory ClientRow.fromJson(Map<String, dynamic> j) => ClientRow(
        id: j['id'] as String,
        name: (j['name'] as String?) ?? '',
        phone: j['phone'] as String?,
        ltv: (j['ltv'] as num?)?.toInt() ?? 0,
        orders: (j['orders'] as num?)?.toInt() ?? 0,
        books: (j['books'] as num?)?.toInt() ?? 0,
        lastSeenAt: j['lastSeenAt'] == null ? null : DateTime.parse(j['lastSeenAt'] as String).toLocal(),
        tags: [for (final t in (j['tags'] as List? ?? const [])) t as String],
      );
}

class AppNotification {
  AppNotification({required this.id, required this.kind, required this.title, required this.body, required this.link, required this.read, required this.at});
  final String id;
  final String kind;
  final String title;
  final String body;
  final String? link;
  bool read;
  final DateTime at;

  factory AppNotification.fromJson(Map<String, dynamic> j) => AppNotification(
        id: j['id'] as String,
        kind: (j['kind'] as String?) ?? 'system',
        title: (j['title'] as String?) ?? '',
        body: (j['body'] as String?) ?? '',
        link: j['link'] as String?,
        read: j['read'] == true,
        at: DateTime.parse(j['at'] as String).toLocal(),
      );
}

class StaffOption {
  StaffOption({required this.id, required this.name});
  final String id;
  final String name;
}
