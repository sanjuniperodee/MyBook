/**
 * CRM в API v1 — чтение списков (перенос /api/mobile/*, ADR 0012, A4): «Мой день», задачи, звонки, клиенты и карточка
 * клиента, сотрудники, уведомления. Ответы — те же, что у /api/mobile (те же выборки src/app/api/_crm-lists, видимость и
 * права как у экранов CRM), чтобы экраны приложения переключались без правок. Правка сделок, клиентов, заказов —
 * v1/crm.ts (другая сессия).
 */
import { z } from "zod";
import { Ok, route, schemas, uuid, type RouteDef } from "./core";

const id = z.string();
const nid = z.string().nullable();

// ─── Задачи и «Мой день» ──────────────────────────────────────────────────────────────────────────────────────────

/** К чему задача: сделка, заказ или клиент — приложение открывает нужный экран. */
export const CrmTaskContext = z.object({ type: z.enum(["deal", "order", "client"]), id, label: z.string() }).register(schemas, { id: "CrmTaskContext" });

export const CrmTaskTarget = z.object({ dealId: nid, orderId: nid, clientId: nid }).register(schemas, { id: "CrmTaskTarget" });

export const CrmTask = z
  .object({
    id,
    title: z.string(),
    kind: z.string(),
    dueAt: nid,
    overdue: z.boolean(),
    done: z.boolean(),
    remindBeforeMin: z.number().int().nullable(),
    fromBot: z.boolean(),
    assigneeId: nid,
    editable: z.boolean(),
    context: CrmTaskContext.nullable(),
    /** Цель «Позвонить» и «Написать»: номер сервер берёт по сделке, заказу или клиенту. */
    target: CrmTaskTarget,
  })
  .register(schemas, { id: "CrmTask" });

export const CrmTaskList = z.object({ tasks: z.array(CrmTask) }).register(schemas, { id: "CrmTaskList" });

/** Как связаться по задаче «Моего дня»: номер (если виден), через АТС, чат — только если сотрудник ведёт сделку. */
export const CrmTaskContact = z
  .object({
    phone: nid,
    target: z.object({ dealId: z.string().optional(), orderId: z.string().optional(), clientId: z.string().optional() }),
    pbx: z.boolean(),
    chat: z.boolean(),
  })
  .register(schemas, { id: "CrmTaskContact" });

export const CrmDayTask = CrmTask.extend({ contact: CrmTaskContact.nullable().optional() }).register(schemas, { id: "CrmDayTask" });

export const CrmToday = z
  .object({
    counts: z.object({
      tasks: z.number().int(),
      overdueTasks: z.number().int(),
      waiting: z.number().int(),
      missed: z.number().int(),
      unsorted: z.number().int(),
      openDeals: z.number().int(),
      openDealsSum: z.number(),
      noNextStep: z.number().int(),
    }),
    /** План месяца сотрудника; null — плана нет. */
    plan: z.object({ planAmount: z.number(), factAmount: z.number(), planDeals: z.number().int(), factDeals: z.number().int() }).nullable(),
    tasks: z.array(CrmDayTask),
    /** Диалоги, ждущие ответа: waitLabel — сколько ждут (рабочее время), overdue — дольше нормы. */
    waiting: z.array(z.object({ id, title: z.string(), channel: z.string(), channelLabel: z.string(), preview: nid, waitLabel: nid, overdue: z.boolean() })),
    missed: z.array(z.object({ id, phone: nid, at: z.string(), dealId: nid, clientId: nid })),
  })
  .register(schemas, { id: "CrmToday" });

// ─── Звонки ───────────────────────────────────────────────────────────────────────────────────────────────────────

export const CrmCalls = z
  .object({
    stats: z.object({ total: z.number().int(), answered: z.number().int(), missed: z.number().int(), talk: z.number().int() }),
    calls: z.array(
      z.object({
        id,
        direction: z.string(),
        status: z.string(),
        at: z.string(),
        durationSec: z.number().int().nullable(),
        /** Номер — с учётом права видеть контакты; null — скрыт. */
        phone: nid,
        name: nid,
        handled: z.boolean(),
        dealId: nid,
        clientId: nid,
      }),
    ),
  })
  .register(schemas, { id: "CrmCalls" });

// ─── Клиенты ──────────────────────────────────────────────────────────────────────────────────────────────────────

export const CrmClientRow = z
  .object({ id, name: z.string(), phone: nid, ltv: z.number(), orders: z.number().int(), books: z.number().int(), lastSeenAt: nid, createdAt: z.string(), tags: z.array(z.string()) })
  .register(schemas, { id: "CrmClientRow" });

export const CrmClients = z.object({ total: z.number().int(), page: z.number().int(), pageSize: z.number().int(), clients: z.array(CrmClientRow) }).register(schemas, { id: "CrmClients" });

export const CrmClientCard = z
  .object({
    id,
    name: z.string(),
    phone: nid,
    email: nid,
    tags: z.array(z.string()),
    manager: nid,
    lastSeenAt: nid,
    createdAt: z.string(),
    money: z.object({ total: z.number(), sales: z.number() }),
    canWrite: z.boolean(),
    books: z.array(z.object({ id, title: z.string(), theme: z.string(), status: z.string(), answered: z.number().int(), total: z.number().int(), words: z.number().int(), photos: z.number().int() })),
    orders: z.array(z.object({ id, number: z.number().int(), status: z.string(), amount: z.number(), plan: z.string(), createdAt: z.string() })),
    deals: z.array(z.object({ id, number: z.number().int(), title: z.string(), amount: z.number(), stage: z.object({ name: z.string(), color: z.string(), kind: z.string() }) })),
    tasks: z.array(z.object({ id, title: z.string(), dueAt: nid })),
    notes: z.array(z.object({ id, text: z.string(), at: z.string(), author: nid })),
  })
  .register(schemas, { id: "CrmClientCard" });

// ─── Сотрудники и уведомления ─────────────────────────────────────────────────────────────────────────────────────

export const CrmStaffList = z.object({ canAssignOthers: z.boolean(), staff: z.array(z.object({ id, name: z.string() })) }).register(schemas, { id: "CrmStaffList" });

export const CrmNotification = z.object({ id, kind: z.string(), title: z.string(), body: nid, link: nid, read: z.boolean(), at: z.string() }).register(schemas, { id: "CrmNotification" });
export const CrmNotifications = z.object({ notifications: z.array(CrmNotification) }).register(schemas, { id: "CrmNotifications" });
export const CrmNotificationsRead = z.object({ id: uuid.optional() }).strict().register(schemas, { id: "CrmNotificationsRead" });

// ─── Чаты ─────────────────────────────────────────────────────────────────────────────────────────────────────────

export const CrmChatRow = z
  .object({
    id,
    title: z.string(),
    channel: z.string(),
    channelLabel: z.string(),
    avatarUrl: nid,
    lastMessageAt: nid,
    preview: nid,
    unread: z.number().int(),
    status: z.string(),
    assignee: nid,
    assigneeId: nid,
    waitLabel: nid,
    overdue: z.boolean(),
    /** Ведёт AI-продажник. */
    bot: z.boolean(),
    pinned: z.boolean(),
  })
  .register(schemas, { id: "CrmChatRow" });

export const CrmChatList = z.object({ chats: z.array(CrmChatRow) }).register(schemas, { id: "CrmChatList" });

/** Карточка WhatsApp в сообщении: kind = product (товар), order (корзина клиента) или catalog (ссылка на каталог). */
export const CrmMessageCard = z
  .object({
    kind: z.enum(["product", "order", "catalog"]),
    productId: z.string().optional(),
    name: z.string().optional(),
    description: z.string().optional(),
    price: z.number().nullable().optional(),
    currency: z.string().optional(),
    retailerId: z.string().optional(),
    url: z.string().optional(),
    body: z.string().optional(),
    orderId: z.string().optional(),
    token: z.string().optional(),
    title: z.string().optional(),
    itemCount: z.number().int().optional(),
    total: z.number().nullable().optional(),
    note: z.string().optional(),
    items: z.array(z.object({ name: z.string(), quantity: z.number().int(), price: z.number().nullable() })).optional(),
  })
  .register(schemas, { id: "CrmMessageCard" });

export const CrmMessage = z
  .object({
    id,
    direction: z.enum(["in", "out"]),
    type: z.string(),
    text: z.string(),
    mediaUrl: nid,
    /** Файл вложения: путь сайта (шлюз — /api/admin/chats/messages/<id>/media) или ссылка; null — нет. */
    media: nid,
    status: z.string(),
    error: nid,
    author: nid,
    at: z.string(),
    internal: z.boolean().optional(),
    gateway: z.boolean().optional(),
    mediaGone: z.boolean().optional(),
    authorId: nid.optional(),
    replyTo: z.object({ id, text: z.string(), type: z.string(), direction: z.enum(["in", "out"]), author: nid }).nullable().optional(),
    forwarded: z.boolean().optional(),
    edited: z.boolean().optional(),
    deleted: z.boolean().optional(),
    transcript: nid.optional(),
    trace: z.boolean().optional(),
    card: CrmMessageCard.nullable().optional(),
    editHistory: z.array(z.object({ text: z.string(), at: z.string() })).optional(),
    revoked: z.enum(["client", "shop"]).optional(),
  })
  .register(schemas, { id: "CrmMessage" });

/** Страница сообщений и состояние диалога (для живого обновления без пересборки шапки). */
export const CrmMessages = z.object({ messages: z.array(CrmMessage), more: z.boolean(), unread: z.number().int(), status: z.string() }).register(schemas, { id: "CrmMessages" });

export const CrmInvoice = z
  .object({
    id,
    label: z.string(),
    amount: z.number(),
    purpose: z.enum(["prepayment", "remainder", "full", "custom"]),
    status: z.enum(["pending_payment", "paid", "cancelled", "expired"]),
    overdue: z.boolean(),
    expiresLabel: z.string(),
    paidLabel: nid,
    paidMethod: z.enum(["manual", "kaspi", "cloudpayments"]).nullable(),
    paidRef: nid,
    closedReason: nid,
    claimedLabel: nid,
    viewedLabel: nid.optional(),
    access: z.enum(["none", "due", "sent", "delivered", "failed", "needs_manager", "skipped"]),
    hasChat: z.boolean(),
    link: nid,
  })
  .register(schemas, { id: "CrmInvoice" });

const StageRef = z.object({ id, name: z.string(), color: z.string() });

export const CrmChat = z
  .object({
    conversation: z.object({
      pinned: z.boolean(),
      id,
      title: z.string(),
      channel: z.string(),
      channelLabel: z.string(),
      avatarUrl: nid,
      status: z.string(),
      unread: z.number().int(),
      assigneeId: nid,
      assignee: nid,
      dealId: nid,
      clientId: nid,
      clientName: nid,
    }),
    messages: z.array(CrmMessage),
    more: z.boolean(),
    deal: z.object({ id, number: z.number().int(), title: z.string(), amount: z.number(), stage: StageRef, source: z.string() }).nullable(),
    perms: z.object({ canReply: z.boolean(), canNote: z.boolean(), canInvoice: z.boolean(), canEditInvoices: z.boolean(), canCreateDeal: z.boolean(), mine: z.boolean() }),
    /** Почему отправка сейчас не сработает (канал не настроен); null — можно. */
    sendBlocker: nid,
    bot: z.object({ label: nid, canStart: z.boolean(), canStop: z.boolean() }),
    /** Быстрые ответы — уже с подстановкой имени, заказа, менеджера. */
    templates: z.array(z.object({ id, title: z.string(), own: z.boolean(), text: z.string() })),
    invoices: z.array(CrmInvoice),
  })
  .register(schemas, { id: "CrmChat" });

// ─── Сделки ───────────────────────────────────────────────────────────────────────────────────────────────────────

export const CrmStage = z.object({ id, name: z.string(), color: z.string(), kind: z.string(), position: z.number().int() }).register(schemas, { id: "CrmStage" });

export const CrmDealRow = z
  .object({
    id,
    number: z.number().int(),
    title: z.string(),
    contactName: nid,
    stageId: id,
    stageKind: z.string(),
    amount: z.number(),
    paid: z.number(),
    source: z.string(),
    assigneeId: nid,
    assignee: nid,
    unsorted: z.boolean(),
    unread: z.number().int(),
    daysInStage: z.number().int(),
    nextTask: z.object({ at: z.string(), overdue: z.boolean() }).nullable(),
    createdAt: z.string(),
  })
  .register(schemas, { id: "CrmDealRow" });

export const CrmDeals = z
  .object({
    pipelines: z.array(z.object({ id, name: z.string() })),
    pipeline: z.object({ id, name: z.string() }).nullable(),
    stages: z.array(CrmStage),
    deals: z.array(CrmDealRow),
  })
  .register(schemas, { id: "CrmDeals" });

export const CrmDeal = z
  .object({
    id,
    number: z.number().int(),
    title: z.string(),
    contactName: nid,
    phone: nid,
    amount: z.number(),
    paid: z.number(),
    source: z.string(),
    stage: z.object({ id, name: z.string(), color: z.string(), kind: z.string() }).nullable(),
    stages: z.array(z.object({ id, name: z.string(), color: z.string(), kind: z.string() })),
    assigneeId: nid,
    assignee: nid,
    unsorted: z.boolean(),
    tags: z.array(z.string()),
    /** Свои поля сделки (ключ поля → значение). */
    customFields: z.record(z.string(), z.unknown()),
    createdAt: z.string(),
    perms: z.object({ canEdit: z.boolean(), canMove: z.boolean(), canInvoice: z.boolean(), mine: z.boolean() }),
    /** Предел скидки сотрудника, %; null — без предела. */
    maxDiscountPercent: z.number().nullable(),
    chatId: nid,
    client: z.object({ id, name: z.string() }).nullable(),
    order: z.object({ id, number: z.number().int(), status: z.string(), amount: z.number(), plan: z.string() }).nullable(),
    tasks: z.array(z.object({ id, title: z.string(), dueAt: nid, done: z.boolean() })),
    notes: z.array(z.object({ id, text: z.string(), at: z.string(), author: nid })),
    payments: z.array(z.object({ id, amount: z.number(), kind: z.string(), method: z.string(), payForm: nid, at: z.string() })),
    /** Формы оплаты для приёма денег (как в CRM). */
    payForms: z.array(z.string()),
    hasOrder: z.boolean(),
    invoices: z.array(CrmInvoice),
  })
  .register(schemas, { id: "CrmDeal" });

// ─── Заказы для производства ──────────────────────────────────────────────────────────────────────────────────────

/** Статус заказа и подпись по-русски (CRM). Ключи — ORDER_STATUSES (src/shared/domain/orders). */
export const CrmOrderStatus = z.object({ key: z.string(), label: z.string() }).register(schemas, { id: "CrmOrderStatus" });

export const CrmOrderCard = z
  .object({
    id,
    number: z.number().int(),
    status: z.string(),
    contactName: z.string(),
    planName: z.string(),
    printed: z.boolean(),
    quantity: z.number().int(),
    amount: z.number().int(),
    amountLabel: z.string(),
    desiredDate: nid,
    /** Дней до желаемой даты (меньше нуля — просрочено). */
    daysLeft: z.number().int().nullable(),
    /** Клиент сообщил об оплате, ждёт проверки. */
    claimed: z.boolean(),
    surprise: z.boolean(),
    giftNote: z.boolean(),
    express: z.boolean(),
    assignee: nid,
    ageDays: z.number().int(),
  })
  .register(schemas, { id: "CrmOrderCard" });

export const CrmOrders = z
  .object({ canEdit: z.boolean(), statuses: z.array(CrmOrderStatus), orders: z.array(CrmOrderCard) })
  .register(schemas, { id: "CrmOrders" });

export const CrmOrder = z
  .object({
    id,
    number: z.number().int(),
    status: z.string(),
    statusLabel: z.string(),
    canEdit: z.boolean(),
    planName: z.string(),
    printed: z.boolean(),
    quantity: z.number().int(),
    amountLabel: z.string(),
    addons: z.array(z.string()),
    book: z.object({ title: z.string(), author: z.string(), recipient: z.string() }),
    /** Телефон и почта скрыты (masked), если у роли нет права видеть контакты. */
    contact: z.object({ name: z.string(), phone: nid, email: nid, masked: z.boolean() }),
    /** Только у печатных тарифов; quoted — стоимость доставки считает менеджер и ещё не посчитал. */
    delivery: z.object({ method: z.string(), quoted: z.boolean(), address: nid }).nullable(),
    tracking: nid,
    desiredDate: nid,
    comment: nid,
    giftNote: nid,
    surprise: z.boolean(),
    claimed: z.boolean(),
    events: z.array(z.object({ id, status: nid, note: nid, at: z.string() })),
  })
  .register(schemas, { id: "CrmOrder" });

export const crmListsRoutes = {
  crmToday: route({ method: "GET", path: "/api/v1/crm/today", auth: "staff", tag: "crm-lists", summary: "«Мой день»: плитки, план месяца, задачи, ждут ответа, пропущенные звонки", response: CrmToday }),
  crmTasksList: route({
    method: "GET",
    path: "/api/v1/crm/tasks",
    auth: "staff",
    tag: "crm-lists",
    summary: "Задачи: done=1 — выполненные, who (все задачи — с правом), kind, q",
    query: z.object({ done: z.enum(["1"]).optional(), who: z.string().max(40).optional(), kind: z.string().max(40).optional(), q: z.string().max(100).optional() }),
    response: CrmTaskList,
  }),
  crmCallsList: route({
    method: "GET",
    path: "/api/v1/crm/calls",
    auth: "staff",
    tag: "crm-lists",
    summary: "Журнал звонков: f=missed|all|in|out|mine, days (1–60, по умолчанию 14)",
    query: z.object({ f: z.enum(["missed", "all", "in", "out", "mine"]).optional(), days: z.coerce.number().int().min(1).max(60).optional() }),
    response: CrmCalls,
  }),
  crmClientsList: route({
    method: "GET",
    path: "/api/v1/crm/clients",
    auth: "staff",
    tag: "crm-lists",
    summary: "Клиенты: q (имя, e-mail, телефон), sort=new|ltv|active, mine=1, page",
    query: z.object({ q: z.string().max(100).optional(), sort: z.enum(["new", "ltv", "active"]).optional(), mine: z.enum(["1"]).optional(), page: z.coerce.number().int().min(1).optional() }),
    response: CrmClients,
  }),
  crmClientCard: route({ method: "GET", path: "/api/v1/crm/clients/{clientId}", auth: "staff", tag: "crm-lists", summary: "Карточка клиента: деньги, книги, заказы, сделки, задачи, заметки", params: z.object({ clientId: uuid }), response: CrmClientCard }),
  crmStaffList: route({ method: "GET", path: "/api/v1/crm/staff", auth: "staff", tag: "crm-lists", summary: "Сотрудники для выбора ответственного", response: CrmStaffList }),
  crmNotificationsList: route({ method: "GET", path: "/api/v1/crm/notifications", auth: "staff", tag: "crm-lists", summary: "Лента уведомлений сотрудника (limit, по умолчанию 60)", query: z.object({ limit: z.coerce.number().int().min(1).max(200).optional() }), response: CrmNotifications }),
  crmChatsList: route({
    method: "GET",
    path: "/api/v1/crm/chats",
    auth: "staff",
    tag: "crm-lists",
    summary: "Диалоги: f=open|mine|unread|waiting|closed, q — поиск",
    query: z.object({ f: z.enum(["open", "mine", "unread", "waiting", "closed"]).optional(), q: z.string().max(100).optional() }),
    response: CrmChatList,
  }),
  crmChatGet: route({
    method: "GET",
    path: "/api/v1/crm/chats/{chatId}",
    auth: "staff",
    tag: "crm-lists",
    summary: "Диалог: шапка, последние сообщения (limit 20–300, по умолчанию 50), права, шаблоны, сделка и счета",
    params: z.object({ chatId: uuid }),
    query: z.object({ limit: z.coerce.number().int().min(20).max(300).optional() }),
    response: CrmChat,
  }),
  crmChatMessages: route({
    method: "GET",
    path: "/api/v1/crm/chats/{chatId}/messages",
    auth: "staff",
    tag: "crm-lists",
    summary: "Сообщения диалога: before (ISO) — старше, limit (10–200, по умолчанию 40)",
    params: z.object({ chatId: uuid }),
    query: z.object({ before: z.string().optional(), limit: z.coerce.number().int().min(10).max(200).optional() }),
    response: CrmMessages,
  }),
  crmDealsList: route({
    method: "GET",
    path: "/api/v1/crm/deals",
    auth: "staff",
    tag: "crm-lists",
    summary: "Воронка: этапы и сделки; p — воронка, фильтры как у страницы «Сделки»: mine, a (ответственный), q, task, stale, src",
    query: z.object({ p: z.string().optional(), mine: z.string().optional(), a: z.string().optional(), q: z.string().max(100).optional(), task: z.string().optional(), stale: z.string().optional(), src: z.string().optional() }),
    response: CrmDeals,
  }),
  crmDealGet: route({ method: "GET", path: "/api/v1/crm/deals/{dealId}", auth: "staff", tag: "crm-lists", summary: "Карточка сделки: данные, этапы, задачи, заметки, платежи, счета, чат", params: z.object({ dealId: uuid }), response: CrmDeal }),
  crmNotificationsRead: route({ method: "POST", path: "/api/v1/crm/notifications/read", auth: "staff", tag: "crm-lists", summary: "Отметить прочитанными: id — одно, без id — все", body: CrmNotificationsRead, response: Ok }),
  crmOrdersList: route({ method: "GET", path: "/api/v1/crm/orders", auth: "staff", tag: "crm-lists", summary: "Заказы для производства за 30 дней (канбан): статусы с подписями, карточки, можно ли менять", response: CrmOrders }),
  crmOrder: route({ method: "GET", path: "/api/v1/crm/orders/{orderId}", auth: "staff", tag: "crm-lists", summary: "Карточка заказа для производства: книга, получатель, доставка, пожелания, журнал", params: z.object({ orderId: uuid }), response: CrmOrder }),
} as const satisfies Record<string, RouteDef>;
