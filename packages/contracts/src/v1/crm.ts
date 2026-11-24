/**
 * API v1 — CRM для сотрудников (приложение CRM): то, что раньше открывалось страницей сайта внутри приложения.
 * Права — как у страниц CRM (сервер зовёт те же действия: deals.edit, clients.edit, «только свои»). Отказ действия
 * (чужая запись, лимит скидки, заказ уже оформлен) — 400 с текстом для сотрудника в `error` и кодом `refused`.
 *
 * Значения своих полей — строками (как в форме сайта): дата YYYY-MM-DD, число — цифрами, флажок — "true"/"false",
 * пустая строка — поле не заполнено.
 */
import { z } from "zod";
import { route, schemas, uuid, type RouteDef } from "./core";

export const Choice = z.object({ id: z.string(), label: z.string() }).register(schemas, { id: "Choice" });

/** Итог действия: текст для сотрудника («Сохранено», «Канал: Instagram»), null — без текста. */
export const Done = z.object({ ok: z.literal(true), message: z.string().nullable() }).register(schemas, { id: "Done" });

export const CustomField = z
  .object({
    key: z.string(),
    label: z.string(),
    /** text | number | date | select | checkbox */
    type: z.enum(["text", "number", "date", "select", "checkbox"]),
    /** Варианты у select. */
    options: z.array(z.string()),
    value: z.string(),
  })
  .register(schemas, { id: "CustomField" });

const fieldValues = z.record(z.string().max(60), z.string().max(500));
const tags = z.array(z.string().trim().toLowerCase().min(1).max(30)).max(20);
const phones = z.array(z.string().trim().min(1).max(40)).max(5);

// ─── Сделка ───────────────────────────────────────────────────────────────────────────────────────────────────────

export const PlanChoice = z.object({ id: z.string(), label: z.string(), price: z.number().int() }).register(schemas, { id: "PlanChoice" });

/** Форма правки сделки: поля, свои поля и договорённость (тариф и что бесплатно). */
export const DealForm = z
  .object({
    id: uuid,
    number: z.number().int(),
    title: z.string(),
    contactName: z.string(),
    /** Контакты: null — сотруднику их не видно (нет права «видеть контакты»), тогда их и не правят. */
    phone: z.string().nullable(),
    email: z.string().nullable(),
    extraPhones: z.array(z.string()),
    canEditContacts: z.boolean(),
    amount: z.number().int(),
    /** Лимит скидки сотрудника, % от прайса тарифа (сумма ниже — отказ); null — без лимита. */
    maxDiscountPercent: z.number().nullable(),
    source: z.string(),
    sources: z.array(Choice),
    tags: z.array(z.string()),
    fields: z.array(CustomField),
    /** Можно править: право deals.edit и сделка своя (или роль «все записи»). */
    canEdit: z.boolean(),
    /** Тариф договорённости; null — клиент выберет сам. */
    plan: z.string().nullable(),
    plans: z.array(PlanChoice),
    /** Бесплатно по договорённости (giftwrap, delivery) и что доступно выбранному тарифу. */
    gifts: z.array(z.string()),
    giftOptions: z.array(Choice),
    /** По сделке уже оформлен заказ: тариф и подарки не меняются. */
    agreementLocked: z.boolean(),
  })
  .register(schemas, { id: "DealForm" });

export const DealPatch = z
  .object({
    title: z.string().trim().min(2).max(200),
    contactName: z.string().trim().max(120),
    /** Контакты — только с правом их видеть; без него сервер оставит прежние. */
    phone: z.string().trim().max(40),
    email: z.string().trim().max(200),
    extraPhones: phones,
    amount: z.number().int().min(0).max(100_000_000),
    source: z.string().max(40),
    tags,
    /** Свои поля: ключ → значение строкой; не переданные — без изменений. */
    fields: fieldValues,
  })
  .partial()
  .strict()
  .register(schemas, { id: "DealPatch" });

export const DealPlanBody = z.object({ plan: z.string().max(40).nullable() }).strict().register(schemas, { id: "DealPlanBody" });
export const DealGiftsBody = z.object({ gifts: z.array(z.string().max(40)).max(10) }).strict().register(schemas, { id: "DealGiftsBody" });

// ─── Клиент ───────────────────────────────────────────────────────────────────────────────────────────────────────

export const ClientForm = z
  .object({
    id: uuid,
    name: z.string(),
    /** Основной номер (виден по праву контактов) и дополнительные, по которым его узнаём в звонках и WhatsApp. */
    phone: z.string().nullable(),
    extraPhones: z.array(z.string()),
    canEditPhones: z.boolean(),
    tags: z.array(z.string()),
    fields: z.array(CustomField),
    /** «Не писать первым»: бот не напоминает, правила не пишут. */
    noMarketing: z.boolean(),
    locale: z.string(),
    locales: z.array(Choice),
    /** Канал привлечения (откуда пришёл); null — не указан. */
    channel: z.string().nullable(),
    channels: z.array(Choice),
    managerId: uuid.nullable(),
    /** Кому можно отдать клиента (роль «только свои» — только себе). */
    managers: z.array(Choice),
    canEdit: z.boolean(),
  })
  .register(schemas, { id: "ClientForm" });

export const ClientPatch = z
  .object({
    extraPhones: phones,
    tags,
    fields: fieldValues,
    noMarketing: z.boolean(),
    locale: z.string().max(5),
    channel: z.string().max(40),
    managerId: uuid.nullable(),
  })
  .partial()
  .strict()
  .register(schemas, { id: "ClientPatch" });

// ─── Чат ──────────────────────────────────────────────────────────────────────────────────────────────────────────

export const ChatBotBody = z.object({ run: z.boolean() }).strict().register(schemas, { id: "ChatBotBody" });

// ─── Заказ: деньги и доставка ────────────────────────────────────────────────────────────────────────────────────

export const OrderPayment = z
  .object({
    id: uuid,
    /** payment — оплата, refund — возврат. */
    kind: z.string(),
    amount: z.number().int(),
    /** Как заплатили: «Kaspi», «карта (CloudPayments)», «перевод или вручную». */
    method: z.string(),
    at: z.string(),
    note: z.string().nullable(),
    receipt: z.boolean(),
    /** Форма оплаты (Gold, рассрочка…). */
    payForm: z.string().nullable(),
    /** Кто записал и кто сверил с выпиской («Имя 24.11.2026»); null — не сверено. */
    by: z.string().nullable(),
    reviewed: z.string().nullable(),
    /** Отменён руководителем: причина; null — действует. */
    voidReason: z.string().nullable(),
    voided: z.boolean(),
  })
  .register(schemas, { id: "OrderPayment" });

/** Деньги и доставка заказа — как листы «Оплата», «Тариф и цена» и «Доставка» карточки заказа на сайте. */
export const OrderMoney = z
  .object({
    id: uuid,
    number: z.number().int(),
    status: z.string(),
    statusLabel: z.string(),
    statuses: z.array(Choice),
    printed: z.boolean(),
    trackingNumber: z.string().nullable(),
    /** К оплате, получено, можно вернуть (по отменённому — всё полученное, по живому — переплата). */
    amount: z.number().int(),
    received: z.number().int(),
    refundable: z.number().int(),
    /** Оплачен (paidAt), в печати с постоплатой, отменён. */
    settled: z.boolean(),
    postpay: z.boolean(),
    cancelled: z.boolean(),
    payments: z.array(OrderPayment),
    payForms: z.array(z.string()),
    plan: z.string(),
    plans: z.array(PlanChoice),
    /** Договорённая цена первого экземпляра (скидка без промокода); null — по прайсу. */
    agreed: z.number().int().nullable(),
    maxDiscountPercent: z.number().nullable(),
    /** Права: менять заказ, отменять платежи, сверять оплаты, менять тариф и цену, просить руководителя о цене оплаченного. */
    canEdit: z.boolean(),
    canVoid: z.boolean(),
    canReview: z.boolean(),
    canTerms: z.boolean(),
    canRequestReprice: z.boolean(),
  })
  .register(schemas, { id: "OrderMoney" });

/** Поля к чеку (multipart: файл — поле file): сумма ₸, день оплаты YYYY-MM-DD, примечание, форма оплаты, ключ повтора. */
const OrderPayQuery = z.object({
  amount: z.string().regex(/^\d{1,9}$/),
  paidAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  note: z.string().max(500).optional(),
  payForm: z.string().max(60).optional(),
  /** Ключ отправки формы (uuid): повтор после сбоя сети — тот же платёж. */
  requestKey: uuid,
});
const OrderRefundQuery = OrderPayQuery.omit({ paidAt: true, payForm: true });

export const ReasonBody = z.object({ reason: z.string().trim().min(3).max(500) }).strict().register(schemas, { id: "ReasonBody" });
export const OrderTermsBody = z
  .object({ plan: z.string().max(40), agreedTotal: z.number().int().min(1).max(100_000_000).nullable(), reason: z.string().trim().max(500).optional() })
  .strict()
  .register(schemas, { id: "OrderTermsBody" });
export const RepriceRequestBody = z.object({ price: z.number().int().min(1).max(100_000_000), reason: z.string().trim().min(3).max(500) }).strict().register(schemas, { id: "RepriceRequestBody" });
export const OrderDeliveryBody = z
  .object({ status: z.string().max(30), trackingNumber: z.string().trim().max(100).optional(), note: z.string().trim().max(1000).optional() })
  .strict()
  .register(schemas, { id: "OrderDeliveryBody" });

// ─── Маршруты ─────────────────────────────────────────────────────────────────────────────────────────────────────

const DealParams = z.object({ dealId: uuid });
const ClientParams = z.object({ clientId: uuid });
const OrderParams = z.object({ orderId: uuid });
const PaymentParams = z.object({ paymentId: uuid });

export const crmRoutes = {
  crmDealForm: route({ method: "GET", path: "/api/v1/crm/deals/{dealId}/form", auth: "staff", tag: "crm", summary: "Сделка для правки: поля, свои поля, договорённость", params: DealParams, response: DealForm }),
  crmDealUpdate: route({ method: "PATCH", path: "/api/v1/crm/deals/{dealId}", auth: "staff", tag: "crm", summary: "Правка сделки (только переданные поля)", params: DealParams, body: DealPatch, response: Done }),
  crmDealPlan: route({ method: "PUT", path: "/api/v1/crm/deals/{dealId}/plan", auth: "staff", tag: "crm", summary: "Тариф договорённости (null — клиент выберет сам)", params: DealParams, body: DealPlanBody, response: Done }),
  crmDealGifts: route({ method: "PUT", path: "/api/v1/crm/deals/{dealId}/gifts", auth: "staff", tag: "crm", summary: "Что бесплатно по договорённости", params: DealParams, body: DealGiftsBody, response: Done }),
  crmClientForm: route({ method: "GET", path: "/api/v1/crm/clients/{clientId}/form", auth: "staff", tag: "crm", summary: "Клиент для правки: номера, теги, свои поля, язык, канал, ответственный", params: ClientParams, response: ClientForm }),
  crmClientUpdate: route({ method: "PATCH", path: "/api/v1/crm/clients/{clientId}", auth: "staff", tag: "crm", summary: "Правка клиента (только переданные поля)", params: ClientParams, body: ClientPatch, response: Done }),
  crmChatBot: route({ method: "POST", path: "/api/v1/crm/chats/{chatId}/bot", auth: "staff", tag: "crm", summary: "Запустить или остановить бота в диалоге", params: z.object({ chatId: uuid }), body: ChatBotBody, response: Done }),
  crmOrderMoney: route({ method: "GET", path: "/api/v1/crm/orders/{orderId}/money", auth: "staff", tag: "crm", summary: "Деньги и доставка заказа: платежи, к оплате, тариф и цена, статус и трек", params: OrderParams, response: OrderMoney }),
  crmOrderPay: route({ method: "POST", path: "/api/v1/crm/orders/{orderId}/payments", auth: "staff", tag: "crm", summary: "Принять оплату с чеком (multipart, поле file; сумма и дата — в query)", params: OrderParams, query: OrderPayQuery, files: { field: "file" }, response: Done }),
  crmOrderRefund: route({ method: "POST", path: "/api/v1/crm/orders/{orderId}/refunds", auth: "staff", tag: "crm", summary: "Вернуть деньги (чек возврата — по желанию, поле file); причина — note", params: OrderParams, query: OrderRefundQuery, files: { field: "file" }, response: Done }),
  crmOrderPaymentVoid: route({ method: "POST", path: "/api/v1/crm/orders/payments/{paymentId}/void", auth: "staff", tag: "crm", summary: "Отменить ошибочный платёж (руководитель, с причиной)", params: PaymentParams, body: ReasonBody, response: Done }),
  crmOrderPaymentReview: route({ method: "POST", path: "/api/v1/crm/orders/payments/{paymentId}/review", auth: "staff", tag: "crm", summary: "Отметить оплату сверенной с выпиской (руководитель)", params: PaymentParams, response: Done }),
  crmOrderPostpay: route({ method: "POST", path: "/api/v1/crm/orders/{orderId}/postpay", auth: "staff", tag: "crm", summary: "Неоплаченный заказ — в печать с постоплатой (о чём договорились)", params: OrderParams, body: ReasonBody, response: Done }),
  crmOrderTerms: route({ method: "PUT", path: "/api/v1/crm/orders/{orderId}/terms", auth: "staff", tag: "crm", summary: "Тариф и договорённая цена (оплаченный — с правом и причиной)", params: OrderParams, body: OrderTermsBody, response: Done }),
  crmOrderRepriceRequest: route({ method: "POST", path: "/api/v1/crm/orders/{orderId}/reprice-request", auth: "staff", tag: "crm", summary: "Попросить руководителя изменить цену оплаченного заказа", params: OrderParams, body: RepriceRequestBody, response: Done }),
  crmOrderDelivery: route({ method: "PATCH", path: "/api/v1/crm/orders/{orderId}/delivery", auth: "staff", tag: "crm", summary: "Статус и трек-номер заказа (клиент получит сообщение, как с сайта)", params: OrderParams, body: OrderDeliveryBody, response: Done }),
} as const satisfies Record<string, RouteDef>;
