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
    this.card,
    this.editHistory = const [],
    this.revoked,
    this.mediaGone = false,
    this.raw,
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

  /// Карточка WhatsApp: товар из каталога, корзина клиента или ссылка на каталог.
  final MessageCard? card;

  /// Правки в WhatsApp не из CRM (клиентом или с телефона магазина): прежние тексты, старые первыми.
  final List<String> editHistory;

  /// Удалено в WhatsApp не из CRM: 'client' — клиентом, 'shop' — с телефона магазина (текст сотрудникам виден).
  final String? revoked;

  /// Вложение истекло у WhatsApp и больше не скачивается.
  final bool mediaGone;

  /// Ответ сервера как есть — для кэша на телефоне.
  final Map<String, dynamic>? raw;

  bool get isPending => status == 'sending';
  bool get isFailed => status == 'error';

  /// Отпечаток того, что видно в пузыре: одинаковый — пузырь перерисовывать незачем.
  String get signature => '$status|${error ?? ''}|${text.hashCode}|$edited|$deleted|${transcript?.hashCode ?? 0}|${revoked ?? ''}|${editHistory.length}|$mediaGone|${card?.kind ?? ''}';

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
      card: j['card'] is Map<String, dynamic> ? MessageCard.fromJson(j['card'] as Map<String, dynamic>) : null,
      editHistory: [for (final h in (j['editHistory'] as List? ?? const [])) if (h is Map && h['text'] is String) h['text'] as String],
      revoked: j['revoked'] as String?,
      mediaGone: j['mediaGone'] == true,
      raw: j,
    );
  }
}

/// Карточка WhatsApp в ленте: товар (product), корзина клиента (order) или весь каталог (catalog).
class MessageCard {
  MessageCard({required this.kind, this.productId, this.name = '', this.description, this.price, this.currency = 'KZT', this.retailerId, this.url, this.itemCount = 0, this.total, this.items, this.caption = ''});
  final String kind;
  final String? productId;
  final String name;
  final String? description;
  final double? price;
  final String currency;
  final String? retailerId;
  final String? url;
  final int itemCount;
  final double? total;
  final List<CartItem>? items;

  /// Подпись под карточкой: текст к товару или комментарий к корзине.
  final String caption;

  factory MessageCard.fromJson(Map<String, dynamic> j) => MessageCard(
    kind: (j['kind'] as String?) ?? '',
    productId: j['productId'] as String?,
    name: (j['name'] as String?) ?? (j['title'] as String?) ?? '',
    description: j['description'] as String?,
    price: (j['price'] as num?)?.toDouble(),
    currency: (j['currency'] as String?) ?? 'KZT',
    retailerId: j['retailerId'] as String?,
    url: j['url'] as String?,
    itemCount: (j['itemCount'] as num?)?.toInt() ?? 0,
    total: (j['total'] as num?)?.toDouble(),
    items: j['items'] is List ? [for (final i in j['items'] as List) CartItem.fromJson(i as Map<String, dynamic>)] : null,
    caption: ((j['kind'] == 'product' ? j['body'] : j['kind'] == 'order' ? j['note'] : null) as String?) ?? '',
  );
}

class CartItem {
  CartItem({required this.name, required this.quantity, this.price});
  final String name;
  final int quantity;
  final double? price;
  factory CartItem.fromJson(Map<String, dynamic> j) => CartItem(name: (j['name'] as String?) ?? '', quantity: (j['quantity'] as num?)?.toInt() ?? 1, price: (j['price'] as num?)?.toDouble());
}

/// Цена каталога: «25 000 ₸».
String catalogPrice(double? price, String currency) {
  if (price == null || price <= 0) return '';
  const signs = {'KZT': '₸', 'RUB': '₽', 'USD': r'$', 'EUR': '€'};
  final whole = price == price.roundToDouble();
  final digits = whole ? price.round().toString() : price.toStringAsFixed(2);
  final parts = digits.split('.');
  final int0 = parts[0].replaceAllMapped(RegExp(r'\B(?=(\d{3})+(?!\d))'), (_) => '\u00a0');
  return '$int0${parts.length > 1 ? ',${parts[1]}' : ''}\u00a0${signs[currency] ?? currency}';
}

/// Товар каталога для выбора в чате.
class CatalogItem {
  CatalogItem({required this.id, required this.name, required this.price, required this.currency, required this.hidden, required this.image});
  final String id;
  final String name;
  final double? price;
  final String currency;
  final bool hidden;
  final bool image;
  factory CatalogItem.fromJson(Map<String, dynamic> j) => CatalogItem(
    id: j['id'] as String,
    name: (j['name'] as String?) ?? '',
    price: (j['price'] as num?)?.toDouble(),
    currency: (j['currency'] as String?) ?? 'KZT',
    hidden: j['hidden'] == true,
    image: j['image'] == true,
  );
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
    this.botCanStart = false,
    this.botCanStop = false,
    required this.templates,
    required this.invoices,
    this.pinned = false,
    this.more = false,
    this.clientId,
    this.channel = '',
    this.raw,
  });

  final String channel;

  final String id;
  final String title;
  final String channelLabel;

  /// Есть сообщения старше загруженных (догружаются при прокрутке вверх).
  final bool more;
  final String? clientId;

  /// Ответ сервера (без сообщений) — для кэша на телефоне.
  final Map<String, dynamic>? raw;
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

  /// Бота можно запустить (нет активного) или остановить — как кнопки чата CRM (botPreview.ts).
  final bool botCanStart;
  final bool botCanStop;
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
      botCanStart: (j['bot'] as Map<String, dynamic>?)?['canStart'] == true,
      botCanStop: (j['bot'] as Map<String, dynamic>?)?['canStop'] == true,
      templates: [for (final t in (j['templates'] as List)) Template.fromJson(t as Map<String, dynamic>)],
      invoices: [for (final i in (j['invoices'] as List)) InvoiceBrief.fromJson(i as Map<String, dynamic>)],
      more: j['more'] == true,
      clientId: c['clientId'] as String?,
      channel: (c['channel'] as String?) ?? '',
      raw: {for (final e in j.entries) if (e.key != 'messages') e.key: e.value},
    );
  }
}
