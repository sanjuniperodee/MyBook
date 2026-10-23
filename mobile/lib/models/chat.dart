/// Строка списка диалогов.
class ChatSummary {
  ChatSummary({
    required this.id,
    required this.title,
    required this.channel,
    required this.channelLabel,
    required this.avatarUrl,
    required this.lastMessageAt,
    required this.preview,
    required this.unread,
    required this.status,
    required this.assignee,
    required this.waitLabel,
    required this.overdue,
    required this.bot,
    this.pinned = false,
  });

  final String id;
  final String title;
  final String channel;
  final String channelLabel;
  final String? avatarUrl;
  final DateTime? lastMessageAt;
  final String preview;
  final int unread;
  final String status;
  final String? assignee;
  final String? waitLabel;
  final bool overdue;
  final bool bot;

  /// Закреплён у этого сотрудника (личное закрепление): стоит вверху списка.
  final bool pinned;

  factory ChatSummary.fromJson(Map<String, dynamic> j) => ChatSummary(
    id: j['id'] as String,
    title: (j['title'] as String?) ?? '',
    channel: (j['channel'] as String?) ?? '',
    channelLabel: (j['channelLabel'] as String?) ?? '',
    avatarUrl: j['avatarUrl'] as String?,
    lastMessageAt: j['lastMessageAt'] == null ? null : DateTime.parse(j['lastMessageAt'] as String).toLocal(),
    preview: (j['preview'] as String?) ?? '',
    unread: (j['unread'] as num?)?.toInt() ?? 0,
    status: (j['status'] as String?) ?? 'open',
    assignee: j['assignee'] as String?,
    waitLabel: j['waitLabel'] as String?,
    overdue: j['overdue'] == true,
    bot: j['bot'] == true,
    pinned: j['pinned'] == true,
  );
}

/// Сообщение диалога.
class Message {
  Message({
    required this.id,
    required this.outgoing,
    required this.type,
    required this.text,
    required this.media,
    required this.status,
    required this.error,
    required this.author,
    required this.at,
    this.internal = false,
    this.authorId,
    this.replyTo,
    this.forwarded = false,
    this.edited = false,
    this.deleted = false,
    this.transcript,
    this.localPath,
    this.durationMs,
  });

  final String id;
  final bool outgoing;
  final String type;
  String text;
  final String? media;
  String status;
  String? error;
  final String? author;
  final DateTime at;
  final bool internal;
  final String? authorId;
  final ReplyQuote? replyTo;
  final bool forwarded;
  final bool edited;
  final bool deleted;
  String? transcript;

  /// Для ещё не отправленных: локальный файл (голосовое, фото) — показываем сразу, не дожидаясь сервера.
  final String? localPath;
  final int? durationMs;

  bool get isPending => status == 'sending';
  bool get isFailed => status == 'error';

  factory Message.fromJson(Map<String, dynamic> j) {
    final reply = j['replyTo'];
    return Message(
      id: j['id'] as String,
      outgoing: j['direction'] == 'out',
      type: (j['type'] as String?) ?? 'text',
      text: (j['text'] as String?) ?? '',
      media: j['media'] as String?,
      status: (j['status'] as String?) ?? 'sent',
      error: j['error'] as String?,
      author: j['author'] as String?,
      at: DateTime.parse(j['at'] as String).toLocal(),
      internal: j['internal'] == true,
      authorId: j['authorId'] as String?,
      replyTo: reply is Map<String, dynamic> ? ReplyQuote.fromJson(reply) : null,
      forwarded: j['forwarded'] == true,
      edited: j['edited'] == true,
      deleted: j['deleted'] == true,
      transcript: j['transcript'] as String?,
    );
  }
}

class ReplyQuote {
  ReplyQuote({required this.id, required this.text, required this.type, required this.outgoing, required this.author});
  final String id;
  final String text;
  final String type;
  final bool outgoing;
  final String? author;

  factory ReplyQuote.fromJson(Map<String, dynamic> j) =>
      ReplyQuote(id: j['id'] as String, text: (j['text'] as String?) ?? '', type: (j['type'] as String?) ?? 'text', outgoing: j['direction'] == 'out', author: j['author'] as String?);
}

class Template {
  Template({required this.id, required this.title, required this.text, this.own = false});
  final String id;
  final String title;
  final String text;

  /// Личный шаблон сотрудника (общие компании — false).
  final bool own;
  factory Template.fromJson(Map<String, dynamic> j) => Template(id: j['id'] as String, title: j['title'] as String, text: j['text'] as String, own: j['own'] == true);
}

class DealBrief {
  DealBrief({required this.id, required this.number, required this.title, required this.amount, required this.stageName, required this.stageColor, required this.source});
  final String id;
  final int number;
  final String title;
  final int amount;
  final String stageName;
  final String stageColor;
  final String source;

  factory DealBrief.fromJson(Map<String, dynamic> j) {
    final stage = j['stage'] as Map<String, dynamic>;
    return DealBrief(
      id: j['id'] as String,
      number: (j['number'] as num).toInt(),
      title: (j['title'] as String?) ?? '',
      amount: (j['amount'] as num?)?.toInt() ?? 0,
      stageName: stage['name'] as String,
      stageColor: (stage['color'] as String?) ?? '#888888',
      source: (j['source'] as String?) ?? '',
    );
  }
}

class ChatPerms {
  ChatPerms({required this.canReply, required this.canNote, required this.canInvoice, required this.canCreateDeal, required this.mine});
  final bool canReply;
  final bool canNote;
  final bool canInvoice;
  final bool canCreateDeal;
  final bool mine;

  factory ChatPerms.fromJson(Map<String, dynamic> j) =>
      ChatPerms(canReply: j['canReply'] == true, canNote: j['canNote'] == true, canInvoice: j['canInvoice'] == true, canCreateDeal: j['canCreateDeal'] == true, mine: j['mine'] == true);
}

/// Счёт сделки в чате.
class InvoiceBrief {
  InvoiceBrief({required this.id, required this.label, required this.amount, required this.status, required this.overdue, required this.expiresLabel, required this.paidLabel, required this.link});
  final String id;
  final String label;
  final int amount;
  final String status;
  final bool overdue;
  final String expiresLabel;
  final String? paidLabel;
  final String? link;

  bool get payable => status == 'pending_payment' && !overdue;

  factory InvoiceBrief.fromJson(Map<String, dynamic> j) => InvoiceBrief(
    id: j['id'] as String,
    label: (j['label'] as String?) ?? '',
    amount: (j['amount'] as num).toInt(),
    status: (j['status'] as String?) ?? '',
    overdue: j['overdue'] == true,
    expiresLabel: (j['expiresLabel'] as String?) ?? '',
    paidLabel: j['paidLabel'] as String?,
    link: j['link'] as String?,
  );
}

/// Диалог целиком.
class ChatDetail {
  ChatDetail({
    required this.id,
    required this.title,
    required this.channelLabel,
    required this.avatarUrl,
    required this.status,
    required this.assignee,
    required this.dealId,
    required this.messages,
    required this.deal,
    required this.perms,
    required this.sendBlocker,
    required this.botLabel,
    required this.templates,
    required this.invoices,
    this.pinned = false,
  });

  final String id;
  final String title;
  final String channelLabel;
  final bool pinned;
  final String? avatarUrl;
  final String status;
  final String? assignee;
  final String? dealId;
  final List<Message> messages;
  final DealBrief? deal;
  final ChatPerms perms;
  final String? sendBlocker;
  final String? botLabel;
  final List<Template> templates;
  final List<InvoiceBrief> invoices;

  factory ChatDetail.fromJson(Map<String, dynamic> j) {
    final c = j['conversation'] as Map<String, dynamic>;
    return ChatDetail(
      id: c['id'] as String,
      pinned: c['pinned'] == true,
      title: (c['title'] as String?) ?? '',
      channelLabel: (c['channelLabel'] as String?) ?? '',
      avatarUrl: c['avatarUrl'] as String?,
      status: (c['status'] as String?) ?? 'open',
      assignee: c['assignee'] as String?,
      dealId: c['dealId'] as String?,
      messages: [for (final m in (j['messages'] as List)) Message.fromJson(m as Map<String, dynamic>)],
      deal: j['deal'] == null ? null : DealBrief.fromJson(j['deal'] as Map<String, dynamic>),
      perms: ChatPerms.fromJson(j['perms'] as Map<String, dynamic>),
      sendBlocker: j['sendBlocker'] as String?,
      botLabel: (j['bot'] as Map<String, dynamic>?)?['label'] as String?,
      templates: [for (final t in (j['templates'] as List)) Template.fromJson(t as Map<String, dynamic>)],
      invoices: [for (final i in (j['invoices'] as List)) InvoiceBrief.fromJson(i as Map<String, dynamic>)],
    );
  }
}
