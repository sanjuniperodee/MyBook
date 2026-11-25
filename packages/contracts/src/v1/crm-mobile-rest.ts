/**
 * API v1 (A4) — завершение переноса /api/mobile/* в единый контракт:
 * - профиль сотрудника, смена, «Обзор» руководителя (`crmMe`, `crmShiftSet`, `crmOverview`);
 * - личные шаблоны ответов и черновик ИИ (`crmMyTemplates*`);
 * - звонки (`crmCallDial`, `crmCallHandled`);
 * - каталог WhatsApp в чате и корзина клиента (`crmChatCatalog`, `crmChatSendCatalog`, `crmChatMessageOrder`);
 * - действия чатов и сообщений (`crmChatOpen`, `crmChatForwardTargets`, `crmChatAssign`, `crmChatCreateDeal`,
 *   `crmChatForward`, `crmChatNote`, `crmChatPin`, `crmChatRead`, `crmChatStatus`, `crmChatSendMessage`,
 *   `crmChatSendVoice`, `crmChatMessageEdit`, `crmChatMessageDelete`, `crmChatMessageResend`, `crmChatMessageTranscribe`);
 * - операции со сделками (`crmDealCreate`, `crmDealAccept`, `crmDealAssign`, `crmDealMove`, `crmDealNote`,
 *   `crmDealReject`, `crmDealTaskCreate`);
 * - задачи (`crmTaskCreate`, `crmTaskGet`, `crmTaskUpdate`, `crmTaskDelete`, `crmTaskComplete`, `crmTaskSnooze`,
 *   `crmTaskToggle`);
 * - быстрая смена статуса заказа на канбане (`crmOrderStatus`).
 */
import { z } from "zod";
import { Ok, route, schemas, uuid, type RouteDef } from "./core";
import { Done } from "./crm";
import { CrmDayTask, CrmTaskContact } from "./crm-lists";

const id = z.string();
const nid = z.string().nullable();
const int = z.number().int();

// ─── Профиль сотрудника, смена, «Обзор» ──────────────────────────────────────────────────────────────────────────

export const CrmCountersDto = z
  .object({
    attention: int,
    tasks: int,
    chats: int,
    calls: int,
    deals: int,
    reviews: int,
    finance: int,
  })
  .register(schemas, { id: "CrmCounters" });

export const CrmMe = z
  .object({
    id,
    name: z.string(),
    email: z.string(),
    role: z.string(),
    isOwner: z.boolean(),
    scope: z.string(),
    onShift: z.boolean(),
    layout: z.enum(["leader", "sales", "production", "analyst", "support", "basic"]),
    permissions: z.array(z.string()),
    counters: CrmCountersDto,
    unread: int,
  })
  .register(schemas, { id: "CrmMe" });

export const CrmShiftBody = z.object({ onShift: z.boolean() }).strict().register(schemas, { id: "CrmShiftBody" });
export const CrmShiftResult = z.object({ ok: z.literal(true), onShift: z.boolean() }).register(schemas, { id: "CrmShiftResult" });

export const CrmPeriodPair = z.object({ cur: z.number(), prev: z.number() }).register(schemas, { id: "CrmPeriodPair" });

export const CrmOverview = z
  .object({
    period: int,
    revenue: CrmPeriodPair,
    sales: CrmPeriodPair,
    avgCheck: CrmPeriodPair,
    newClients: CrmPeriodPair,
    series: z.array(z.object({ day: z.string(), sum: z.number(), n: int })),
    funnel: z.object({ registered: int, withBook: int, engaged: int, ordered: int, paid: int }),
    byPlan: z.array(z.object({ plan: z.string(), label: z.string(), sum: z.number(), n: int })),
    stages: z.array(z.object({ id, name: z.string(), color: z.string(), n: int })),
    attention: z.object({ orders: int, deadlines: int }),
    counters: CrmCountersDto,
  })
  .register(schemas, { id: "CrmOverview" });

// ─── Личные шаблоны ответов ──────────────────────────────────────────────────────────────────────────────────────

export const CrmPersonalTemplate = z.object({ id, title: z.string(), text: z.string() }).register(schemas, { id: "CrmPersonalTemplate" });

export const CrmMyTemplates = z
  .object({
    mine: z.array(CrmPersonalTemplate),
    shared: z.array(CrmPersonalTemplate),
  })
  .register(schemas, { id: "CrmMyTemplates" });

export const CrmMyTemplateBody = z
  .object({
    id: uuid.optional(),
    title: z.string().max(200),
    text: z.string().max(5000),
  })
  .strict()
  .register(schemas, { id: "CrmMyTemplateBody" });

export const CrmIdResult = z.object({ ok: z.literal(true), id }).register(schemas, { id: "CrmIdResult" });
export const CrmTemplatesReorderBody = z.object({ ids: z.array(uuid).max(100) }).strict().register(schemas, { id: "CrmTemplatesReorderBody" });

export const CrmTemplateDraftBody = z.object({ chatId: uuid, messageId: uuid }).strict().register(schemas, { id: "CrmTemplateDraftBody" });
export const CrmTemplateReplacement = z.object({ was: z.string(), placeholder: z.string() }).register(schemas, { id: "CrmTemplateReplacement" });
export const CrmTemplateDraft = z
  .object({
    title: z.string(),
    text: z.string(),
    replaced: z.array(CrmTemplateReplacement),
    ai: z.boolean(),
  })
  .register(schemas, { id: "CrmTemplateDraft" });

// ─── Звонки и открытие чата по цели ──────────────────────────────────────────────────────────────────────────────

export const CrmReachTargetBody = z
  .object({
    dealId: uuid.nullable().optional(),
    orderId: uuid.nullable().optional(),
    clientId: uuid.nullable().optional(),
    callId: uuid.nullable().optional(),
  })
  .strict()
  .register(schemas, { id: "CrmReachTargetBody" });

// ─── Каталог WhatsApp в чате и корзина клиента ───────────────────────────────────────────────────────────────────

export const CrmChatCatalogProduct = z
  .object({
    id,
    name: z.string(),
    price: z.number().nullable(),
    currency: z.string(),
    hidden: z.boolean(),
    image: z.boolean(),
  })
  .register(schemas, { id: "CrmChatCatalogProduct" });

export const CrmChatCatalog = z
  .object({
    enabled: z.boolean(),
    products: z.array(CrmChatCatalogProduct),
  })
  .register(schemas, { id: "CrmChatCatalog" });

export const CrmChatCatalogSendBody = z
  .object({ productId: z.string().regex(/^\d{1,40}$/).nullable().optional() })
  .strict()
  .register(schemas, { id: "CrmChatCatalogSendBody" });

export const CrmOrderCartItem = z
  .object({ name: z.string(), quantity: int, price: z.number().nullable() })
  .register(schemas, { id: "CrmOrderCartItem" });

export const CrmChatMessageOrder = z
  .object({
    items: z.array(CrmOrderCartItem),
    total: z.number().nullable(),
    currency: z.string(),
  })
  .register(schemas, { id: "CrmChatMessageOrder" });

// ─── Действия чатов и сообщений ──────────────────────────────────────────────────────────────────────────────────

export const CrmForwardTarget = z
  .object({ id, title: z.string(), channel: z.string(), last: z.string() })
  .register(schemas, { id: "CrmForwardTarget" });

export const CrmForwardTargets = z.object({ targets: z.array(CrmForwardTarget) }).register(schemas, { id: "CrmForwardTargets" });
export const CrmAssignUserBody = z.object({ userId: uuid.nullable() }).strict().register(schemas, { id: "CrmAssignUserBody" });
export const CrmEntityId = z.object({ id }).register(schemas, { id: "CrmEntityId" });

export const CrmChatForwardBody = z
  .object({
    messageIds: z.array(uuid).min(1).max(30),
    targetIds: z.array(uuid).min(1).max(10),
  })
  .strict()
  .register(schemas, { id: "CrmChatForwardBody" });

export const CrmChatForwardResult = z
  .object({
    ok: z.literal(true),
    forwarded: int,
    total: int,
    failed: z.array(z.string()),
  })
  .register(schemas, { id: "CrmChatForwardResult" });

export const CrmTextBody = z.object({ text: z.string().min(1).max(4000) }).strict().register(schemas, { id: "CrmTextBody" });
export const CrmChatPinBody = z.object({ pinned: z.boolean() }).strict().register(schemas, { id: "CrmChatPinBody" });
export const CrmChatStatusBody = z.object({ status: z.enum(["open", "closed"]) }).strict().register(schemas, { id: "CrmChatStatusBody" });

export const CrmChatMessageSendBody = z
  .object({
    text: z.string().max(4000),
    replyToId: uuid.nullable().optional(),
    override: z.string().max(200).optional(),
  })
  .strict()
  .register(schemas, { id: "CrmChatMessageSendBody" });

export const CrmChatMessageSent = z
  .object({
    id: nid,
    status: nid,
    error: nid,
    /** Заполнено, если отправка остановлена фильтром реквизитов (требуется override). */
    blocked: nid,
  })
  .register(schemas, { id: "CrmChatMessageSent" });

export const CrmChatVoiceSent = z
  .object({
    id,
    status: z.string(),
    error: nid,
    converted: z.boolean(),
  })
  .register(schemas, { id: "CrmChatVoiceSent" });

export const CrmTranscript = z.object({ text: z.string() }).register(schemas, { id: "CrmTranscript" });

// ─── Сделки: создание, принятие, передача, перенос, заметки, отказ, задача ───────────────────────────────────────

export const CrmDealCreateBody = z
  .object({
    title: z.string().min(2).max(200),
    contactName: z.string().max(120).optional(),
    contactPhone: z.string().max(40).optional(),
    amount: int.min(0).optional(),
    source: z.string().max(40).optional(),
    stageId: uuid.optional(),
    assigneeId: uuid.optional(),
    clientId: uuid.optional(),
  })
  .strict()
  .register(schemas, { id: "CrmDealCreateBody" });

export const CrmDealMoveBody = z
  .object({
    stageId: uuid,
    lostReason: z.string().max(200).optional(),
  })
  .strict()
  .register(schemas, { id: "CrmDealMoveBody" });

export const CrmDealNoteBody = z.object({ text: z.string().min(1).max(5000) }).strict().register(schemas, { id: "CrmDealNoteBody" });

export const CrmDealRejectBody = z
  .object({
    spam: z.boolean().default(false),
    reason: z.string().max(200).default(""),
  })
  .strict()
  .register(schemas, { id: "CrmDealRejectBody" });

export const CrmDealRejectResult = z
  .object({
    requested: z.boolean(),
    message: z.string(),
    deleted: z.boolean(),
  })
  .register(schemas, { id: "CrmDealRejectResult" });

export const CrmDealTaskBody = z
  .object({
    title: z.string().min(2).max(300),
    dueAt: z.string().max(40).optional(),
    dueTime: z.string().max(10).optional(),
    kind: z.enum(["task", "call", "message", "meeting"]).optional(),
  })
  .strict()
  .register(schemas, { id: "CrmDealTaskBody" });

// ─── Задачи: карточка, создание, правка, выполнение, отложить, переключение ──────────────────────────────────────

export const CrmTaskCreateBody = z
  .object({
    title: z.string().min(2).max(300),
    dueAt: z.string().max(40).optional(),
    dueTime: z.string().max(10).optional(),
    kind: z.enum(["task", "call", "message", "meeting"]).optional(),
    /** Минут до срока; null — без напоминания. */
    remindBeforeMin: int.min(0).max(10_080).nullable().optional(),
    dealId: uuid.optional(),
    clientId: uuid.optional(),
    orderId: uuid.optional(),
    assigneeId: uuid.optional(),
  })
  .strict()
  .register(schemas, { id: "CrmTaskCreateBody" });

export const CrmTaskPatchBody = z
  .object({
    title: z.string().min(2).max(300).optional(),
    kind: z.enum(["task", "call", "message", "meeting"]).optional(),
    dueAt: z.string().max(40).nullable().optional(),
    /** Строка минут или "none" / null — убрать напоминание. */
    remindBeforeMin: z.string().max(20).nullable().optional(),
    assigneeId: uuid.optional(),
    result: z.string().max(1000).optional(),
  })
  .strict()
  .register(schemas, { id: "CrmTaskPatchBody" });

export const CrmTaskCompleteBody = z
  .object({
    result: z.string().max(500).optional(),
    nextTitle: z.string().max(300).optional(),
    nextDue: z.string().max(20).optional(),
  })
  .strict()
  .register(schemas, { id: "CrmTaskCompleteBody" });

export const CrmTaskSnoozeBody = z
  .object({ by: z.enum(["hour", "tomorrow"]) })
  .strict()
  .register(schemas, { id: "CrmTaskSnoozeBody" });

export const CrmTaskDetail = z
  .object({
    item: CrmDayTask,
    task: z.object({
      id,
      title: z.string(),
      kind: z.string(),
      dueAt: nid,
      doneAt: nid,
      done: z.boolean(),
      result: z.string(),
      assigneeId: nid,
      assignee: nid,
      createdBy: nid,
      fromBot: z.boolean(),
      overdue: z.boolean(),
      editable: z.boolean(),
      remindBeforeMin: int.nullable(),
    }),
    deal: z
      .object({
        id,
        number: int,
        title: z.string(),
        stage: z.object({ name: z.string(), color: z.string(), kind: z.string() }).nullable(),
        amount: z.number(),
        amountLabel: nid,
        source: z.string(),
        assignee: nid,
        unsorted: z.boolean(),
        contactName: nid,
      })
      .nullable(),
    client: z.object({ id, name: z.string(), email: nid, phone: nid, masked: z.boolean() }).nullable(),
    contact: z.object({ name: nid, phone: nid, email: nid, masked: z.boolean() }),
    order: z.object({ id, number: int, status: z.string(), statusLabel: z.string(), amountLabel: z.string() }).nullable(),
    chat: z.object({ id, preview: nid, unread: int }).nullable(),
    notes: z.array(z.object({ id, kind: z.string(), text: z.string(), author: z.string(), at: z.string() })),
    others: z.array(z.object({ id, title: z.string(), dueAt: nid, overdue: z.boolean() })),
    reach: CrmTaskContact.nullable(),
  })
  .register(schemas, { id: "CrmTaskDetail" });

// ─── Быстрая смена статуса заказа (канбан) ───────────────────────────────────────────────────────────────────────

export const CrmOrderStatusBody = z
  .object({ status: z.enum(["pending_payment", "paid", "editing", "printing", "shipped", "delivered", "cancelled"]) })
  .strict()
  .register(schemas, { id: "CrmOrderStatusBody" });

const ChatParams = z.object({ chatId: uuid });
const ChatMsgParams = z.object({ chatId: uuid, messageId: uuid });
const DealParams = z.object({ dealId: uuid });
const TaskParams = z.object({ taskId: uuid });

export const crmMobileRestRoutes = {
  // Профиль сотрудника, смена, «Обзор»
  crmMe: route({ method: "GET", path: "/api/v1/crm/me", auth: "staff", tag: "crm-mobile", summary: "Профиль сотрудника: роль, права, раскладка вкладок, смена, счётчики", response: CrmMe }),
  crmShiftSet: route({ method: "POST", path: "/api/v1/crm/me/shift", auth: "staff", tag: "crm-mobile", summary: "Выйти на смену или уйти со смены", body: CrmShiftBody, response: CrmShiftResult }),
  crmOverview: route({ method: "GET", path: "/api/v1/crm/overview", auth: "staff", tag: "crm-mobile", summary: "«Обзор» руководителя: выручка, продажи, воронка, тарифы, этапы, внимание (period=7|30|90)", query: z.object({ period: z.coerce.number().int().optional() }), response: CrmOverview }),

  // Личные шаблоны ответов
  crmMyTemplates: route({ method: "GET", path: "/api/v1/crm/my-templates", auth: "staff", tag: "crm-mobile", summary: "Личные и общие шаблоны быстрых ответов сотрудника", response: CrmMyTemplates }),
  crmMyTemplateSave: route({ method: "POST", path: "/api/v1/crm/my-templates", auth: "staff", tag: "crm-mobile", summary: "Создать или изменить личный шаблон ответа", body: CrmMyTemplateBody, response: CrmIdResult }),
  crmMyTemplateDelete: route({ method: "DELETE", path: "/api/v1/crm/my-templates/{id}", auth: "staff", tag: "crm-mobile", summary: "Удалить личный шаблон ответа", params: z.object({ id: uuid }), response: Ok }),
  crmMyTemplateDuplicate: route({ method: "POST", path: "/api/v1/crm/my-templates/{id}/duplicate", auth: "staff", tag: "crm-mobile", summary: "Скопировать шаблон (свой или общий) в личные", params: z.object({ id: uuid }), response: Ok }),
  crmMyTemplatesReorder: route({ method: "POST", path: "/api/v1/crm/my-templates/reorder", auth: "staff", tag: "crm-mobile", summary: "Изменить порядок личных шаблонов", body: CrmTemplatesReorderBody, response: Ok }),
  crmMyTemplateDraft: route({ method: "POST", path: "/api/v1/crm/my-templates/draft", auth: "staff", tag: "crm-mobile", summary: "Сделать черновик шаблона из сообщения диалога (с подстановками и ИИ)", body: CrmTemplateDraftBody, response: CrmTemplateDraft }),

  // Звонки
  crmCallDial: route({ method: "POST", path: "/api/v1/crm/calls/dial", auth: "staff", tag: "crm-mobile", summary: "Позвонить клиенту через АТС по сделке, заказу, клиенту или звонку", body: CrmReachTargetBody, response: Done }),
  crmCallHandled: route({ method: "POST", path: "/api/v1/crm/calls/{callId}/handled", auth: "staff", tag: "crm-mobile", summary: "Отметить пропущенный звонок обработанным", params: z.object({ callId: uuid }), response: Ok }),

  // Каталог WhatsApp в чате и корзина клиента
  crmChatCatalog: route({ method: "GET", path: "/api/v1/crm/catalog/for-chat", auth: "staff", tag: "crm-mobile", summary: "Товары каталога WhatsApp для отправки в чат", response: CrmChatCatalog }),
  crmChatSendCatalog: route({ method: "POST", path: "/api/v1/crm/chats/{chatId}/catalog", auth: "staff", tag: "crm-mobile", summary: "Отправить в чат товар каталога или ссылку на весь каталог", params: ChatParams, body: CrmChatCatalogSendBody, response: Ok }),
  crmChatMessageOrder: route({ method: "GET", path: "/api/v1/crm/chat-messages/{messageId}/order", auth: "staff", tag: "crm-mobile", summary: "Состав корзины каталога WhatsApp из сообщения клиента", params: z.object({ messageId: uuid }), response: CrmChatMessageOrder }),

  // Действия чатов и сообщений
  crmChatOpen: route({ method: "POST", path: "/api/v1/crm/chats/open", auth: "staff", tag: "crm-mobile", summary: "Открыть или создать чат WhatsApp по сделке, заказу, клиенту или звонку", body: CrmReachTargetBody, response: CrmIdResult }),
  crmChatForwardTargets: route({ method: "GET", path: "/api/v1/crm/chat-targets", auth: "staff", tag: "crm-mobile", summary: "Диалоги, куда можно переслать сообщение", query: z.object({ q: z.string().max(100).optional() }), response: CrmForwardTargets }),
  crmChatAssign: route({ method: "POST", path: "/api/v1/crm/chats/{chatId}/assign", auth: "staff", tag: "crm-mobile", summary: "Передать диалог сотруднику или снять ответственного", params: ChatParams, body: CrmAssignUserBody, response: Ok }),
  crmChatCreateDeal: route({ method: "POST", path: "/api/v1/crm/chats/{chatId}/deal", auth: "staff", tag: "crm-mobile", summary: "Завести сделку из диалога (или вернуть существующую)", params: ChatParams, response: CrmEntityId }),
  crmChatForward: route({ method: "POST", path: "/api/v1/crm/chats/{chatId}/forward", auth: "staff", tag: "crm-mobile", summary: "Переслать сообщения в другие диалоги", params: ChatParams, body: CrmChatForwardBody, response: CrmChatForwardResult }),
  crmChatNote: route({ method: "POST", path: "/api/v1/crm/chats/{chatId}/note", auth: "staff", tag: "crm-mobile", summary: "Добавить внутреннюю заметку в диалог", params: ChatParams, body: CrmTextBody, response: CrmEntityId }),
  crmChatPin: route({ method: "POST", path: "/api/v1/crm/chats/{chatId}/pin", auth: "staff", tag: "crm-mobile", summary: "Закрепить или открепить диалог вверху списка", params: ChatParams, body: CrmChatPinBody, response: Ok }),
  crmChatRead: route({ method: "POST", path: "/api/v1/crm/chats/{chatId}/read", auth: "staff", tag: "crm-mobile", summary: "Отметить диалог прочитанным", params: ChatParams, response: Ok }),
  crmChatStatus: route({ method: "POST", path: "/api/v1/crm/chats/{chatId}/status", auth: "staff", tag: "crm-mobile", summary: "Закрыть или снова открыть диалог", params: ChatParams, body: CrmChatStatusBody, response: Ok }),
  crmChatSendMessage: route({ method: "POST", path: "/api/v1/crm/chats/{chatId}/messages", auth: "staff", tag: "crm-mobile", summary: "Отправить текстовое сообщение в диалог (с фильтром реквизитов)", params: ChatParams, body: CrmChatMessageSendBody, response: CrmChatMessageSent }),
  crmChatSendVoice: route({ method: "POST", path: "/api/v1/crm/chats/{chatId}/voice", auth: "staff", tag: "crm-mobile", summary: "Отправить голосовое сообщение (multipart, поле voice; replyToId в query)", params: ChatParams, query: z.object({ replyToId: uuid.optional() }), files: { field: "voice" }, response: CrmChatVoiceSent }),
  crmChatMessageEdit: route({ method: "PATCH", path: "/api/v1/crm/chats/{chatId}/messages/{messageId}", auth: "staff", tag: "crm-mobile", summary: "Изменить своё сообщение (WhatsApp — до 15 мин)", params: ChatMsgParams, body: CrmTextBody, response: Ok }),
  crmChatMessageDelete: route({ method: "DELETE", path: "/api/v1/crm/chats/{chatId}/messages/{messageId}", auth: "staff", tag: "crm-mobile", summary: "Удалить сообщение у всех", params: ChatMsgParams, response: Ok }),
  crmChatMessageResend: route({ method: "POST", path: "/api/v1/crm/chats/{chatId}/messages/{messageId}/resend", auth: "staff", tag: "crm-mobile", summary: "Повторить отправку сообщения, которое шлюз не принял", params: ChatMsgParams, response: Ok }),
  crmChatMessageTranscribe: route({ method: "POST", path: "/api/v1/crm/chats/{chatId}/messages/{messageId}/transcribe", auth: "staff", tag: "crm-mobile", summary: "Расшифровать голосовое сообщение текстом", params: ChatMsgParams, response: CrmTranscript }),

  // Операции со сделками
  crmDealCreate: route({ method: "POST", path: "/api/v1/crm/deals", auth: "staff", tag: "crm-mobile", summary: "Создать сделку вручную", body: CrmDealCreateBody, response: CrmIdResult }),
  crmDealAccept: route({ method: "POST", path: "/api/v1/crm/deals/{dealId}/accept", auth: "staff", tag: "crm-mobile", summary: "Принять неразобранную заявку в работу", params: DealParams, response: Ok }),
  crmDealAssign: route({ method: "POST", path: "/api/v1/crm/deals/{dealId}/assign", auth: "staff", tag: "crm-mobile", summary: "Назначить ответственного по сделке", params: DealParams, body: CrmAssignUserBody, response: Ok }),
  crmDealMove: route({ method: "POST", path: "/api/v1/crm/deals/{dealId}/move", auth: "staff", tag: "crm-mobile", summary: "Перенести сделку на этап (для отказа нужна причина)", params: DealParams, body: CrmDealMoveBody, response: Ok }),
  crmDealNote: route({ method: "POST", path: "/api/v1/crm/deals/{dealId}/notes", auth: "staff", tag: "crm-mobile", summary: "Добавить заметку в сделку", params: DealParams, body: CrmDealNoteBody, response: Ok }),
  crmDealReject: route({ method: "POST", path: "/api/v1/crm/deals/{dealId}/reject", auth: "staff", tag: "crm-mobile", summary: "Отклонить неразобранную заявку (спам/отказ)", params: DealParams, body: CrmDealRejectBody, response: CrmDealRejectResult }),
  crmDealTaskCreate: route({ method: "POST", path: "/api/v1/crm/deals/{dealId}/tasks", auth: "staff", tag: "crm-mobile", summary: "Создать задачу по сделке", params: DealParams, body: CrmDealTaskBody, response: Ok }),

  // Задачи
  crmTaskCreate: route({ method: "POST", path: "/api/v1/crm/tasks", auth: "staff", tag: "crm-mobile", summary: "Создать задачу (по сделке, клиенту, заказу или отдельно)", body: CrmTaskCreateBody, response: Ok }),
  crmTaskGet: route({ method: "GET", path: "/api/v1/crm/tasks/{taskId}", auth: "staff", tag: "crm-mobile", summary: "Карточка задачи со сделкой, клиентом, заказом, чатом и лентой", params: TaskParams, response: CrmTaskDetail }),
  crmTaskUpdate: route({ method: "PATCH", path: "/api/v1/crm/tasks/{taskId}", auth: "staff", tag: "crm-mobile", summary: "Изменить задачу", params: TaskParams, body: CrmTaskPatchBody, response: Ok }),
  crmTaskDelete: route({ method: "DELETE", path: "/api/v1/crm/tasks/{taskId}", auth: "staff", tag: "crm-mobile", summary: "Удалить задачу", params: TaskParams, response: Ok }),
  crmTaskComplete: route({ method: "POST", path: "/api/v1/crm/tasks/{taskId}/complete", auth: "staff", tag: "crm-mobile", summary: "Выполнить задачу с итогом и следующим шагом", params: TaskParams, body: CrmTaskCompleteBody, response: Ok }),
  crmTaskSnooze: route({ method: "POST", path: "/api/v1/crm/tasks/{taskId}/snooze", auth: "staff", tag: "crm-mobile", summary: "Отложить задачу на час или до завтра", params: TaskParams, body: CrmTaskSnoozeBody, response: Ok }),
  crmTaskToggle: route({ method: "POST", path: "/api/v1/crm/tasks/{taskId}/toggle", auth: "staff", tag: "crm-mobile", summary: "Отметить задачу выполненной или вернуть в работу", params: TaskParams, response: Ok }),

  // Быстрая смена статуса заказа на канбане
  crmOrderStatus: route({ method: "POST", path: "/api/v1/crm/orders/{orderId}/status", auth: "staff", tag: "crm-mobile", summary: "Перевести заказ в другой статус (как перенос карточки на канбане)", params: z.object({ orderId: uuid }), body: CrmOrderStatusBody, response: Ok }),
} as const satisfies Record<string, RouteDef>;
