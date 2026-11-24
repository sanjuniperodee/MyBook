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
  crmNotificationsRead: route({ method: "POST", path: "/api/v1/crm/notifications/read", auth: "staff", tag: "crm-lists", summary: "Отметить прочитанными: id — одно, без id — все", body: CrmNotificationsRead, response: Ok }),
} as const satisfies Record<string, RouteDef>;
