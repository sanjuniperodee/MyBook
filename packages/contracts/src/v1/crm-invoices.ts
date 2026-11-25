/**
 * CRM в API v1 — счета сделки (перенос /api/mobile/invoices*, ADR 0012, A4): форма счёта (договорённость, тарифы, способы
 * оплаты, лимит скидки), выставить, отменить, отправить ещё раз. Те же действия, что у формы счёта в CRM на сайте: проверки,
 * лимит скидки и защита от двойного нажатия (issueKey) — на сервере. Отказ (сделка закрыта, скидка выше лимита) — 400
 * code=refused с текстом для сотрудника.
 */
import { z } from "zod";
import { route, schemas, uuid, type RouteDef } from "./core";

const nid = z.string().nullable();
/** Строка на каждом языке клиента: ru, kk, uz, en. */
const PerLocale = z.record(z.string(), z.string());

export const CrmInvoicePlan = z
  .object({ id: z.string(), label: z.string(), price: z.number().int(), printed: z.boolean(), giftwrap: z.boolean() })
  .register(schemas, { id: "CrmInvoicePlan" });

export const CrmInvoiceForm = z
  .object({
    dealId: nid,
    dealNumber: z.number().int().nullable(),
    plan: nid,
    /** Цена одной книги по договорённости; 0 — ещё не договорились. */
    agreedTotal: z.number().int(),
    /** Сделка — пакет из N книг; null — обычная сделка. */
    batchSize: z.number().int().nullable().optional(),
    paid: z.number().int(),
    hasOrder: z.boolean(),
    /** У сделки есть заказ — оплата идёт в заказе, форма не нужна. */
    orderId: nid,
    /** Сделка закрыта: счёт не выставить. */
    closed: z.boolean(),
    open: z.object({ id: z.string(), label: z.string(), amount: z.number().int() }).nullable(),
    clientName: z.string(),
    locale: z.string(),
    channel: z.string(),
    /** Куда уйдёт счёт (канал диалога); null — диалога нет, ссылку менеджер отправит сам. */
    chat: nid,
    plans: z.array(CrmInvoicePlan),
    gifts: z.array(z.string()),
    giftPrices: z.object({ giftwrap: z.number().int(), delivery: z.number().int() }),
    methods: z.object({ kaspi: z.boolean(), card: z.boolean(), transfer: z.boolean() }),
    kaspiPhoneMasked: nid,
    kaspiWarning: nid.optional(),
    /** null — без лимита скидки; иначе не больше N % от прайса тарифа. */
    maxDiscountPercent: z.number().nullable(),
    preview: z.object({ until: PerLocale, link: PerLocale }),
  })
  .register(schemas, { id: "CrmInvoiceForm" });

export const CrmInvoiceBody = z
  .object({
    dealId: z.union([uuid, z.literal("")]).optional(),
    conversationId: z.union([uuid, z.literal("")]).optional(),
    clientName: z.string().max(100).optional(),
    locale: z.enum(["ru", "kk", "uz", "en"]).optional(),
    channel: z.string(),
    plan: z.string(),
    agreedTotal: z.number().int(),
    count: z.number().int().optional(),
    amount: z.number().int(),
    purpose: z.enum(["prepayment", "remainder", "full", "custom"]),
    /** uuid формы: двойное нажатие не выпускает второй счёт. */
    issueKey: z.union([uuid, z.literal("")]).optional(),
    /** Выставить и счёт Kaspi на номер WhatsApp-чата (номер подставляет сервер). */
    kaspiPush: z.boolean().optional(),
    gifts: z.array(z.enum(["giftwrap", "delivery"])).optional(),
  })
  .strict()
  .register(schemas, { id: "CrmInvoiceBody" });

/** Счёт выставлен или отправлен ещё раз: ссылка и текст (если не ушёл в чат — менеджер отправит сам). */
export const CrmInvoiceSent = z
  .object({ ok: z.literal(true), message: z.string(), link: z.string(), text: z.string(), sent: z.boolean() })
  .register(schemas, { id: "CrmInvoiceSent" });

export const CrmInvoiceCancelled = z.object({ ok: z.literal(true), message: z.string() }).register(schemas, { id: "CrmInvoiceCancelled" });

const InvoiceParams = z.object({ invoiceId: uuid });

export const crmInvoiceRoutes = {
  crmInvoiceForm: route({
    method: "GET",
    path: "/api/v1/crm/invoices/form",
    auth: "staff",
    tag: "crm-invoices",
    summary: "Форма счёта: договорённость сделки, тарифы, способы оплаты, открытый счёт, лимит скидки (dealId или conversationId)",
    query: z.object({ dealId: uuid.optional(), conversationId: uuid.optional() }),
    response: CrmInvoiceForm,
  }),
  crmInvoiceIssue: route({ method: "POST", path: "/api/v1/crm/invoices", auth: "staff", tag: "crm-invoices", summary: "Выставить счёт из чата или сделки: ссылка клиенту в WhatsApp (диалог без сделки — сделка заводится)", body: CrmInvoiceBody, response: CrmInvoiceSent }),
  crmInvoiceCancel: route({ method: "POST", path: "/api/v1/crm/invoices/{invoiceId}/cancel", auth: "staff", tag: "crm-invoices", summary: "Отменить счёт, который ждёт оплаты", params: InvoiceParams, response: CrmInvoiceCancelled }),
  crmInvoiceResend: route({ method: "POST", path: "/api/v1/crm/invoices/{invoiceId}/resend", auth: "staff", tag: "crm-invoices", summary: "Отправить счёт клиенту ещё раз (тот же текст и ссылка)", params: InvoiceParams, response: CrmInvoiceSent }),
} as const satisfies Record<string, RouteDef>;
