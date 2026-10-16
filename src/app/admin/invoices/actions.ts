"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { env } from "@/config/env";
import { getPlan } from "@/config/site";
import { uuid } from "@/server/input";
import { assertStaff, assertVisible, assertWorkable, audit, can, type Staff } from "@/server/access";
import { container } from "@/server/container";
import { getSetting } from "@/modules/workspace";
import { OrderingError, isOnlinePayment, kaspiPhone, type DealInvoice } from "@/modules/ordering";
import { maskPhone } from "@/modules/access";
import { transferRequisites } from "@/server/requisites";
import { sourceFromChannel } from "@/modules/sales";
import { channelLabel } from "@/modules/messaging";
import { isManualChannel } from "@/shared/domain/channels";
import { isPhoneLike, normalizePhone, phoneTail } from "@/shared/domain/phone";
import { messagesFor } from "@/i18n/messages";
import { planName } from "@/i18n/labels";
import { formatPrice } from "@/config/site";
import { storeTimeZone } from "@/shared/domain/time";

export type InvoiceResult = { ok: true; message: string; link: string; text: string; sent: boolean } | { ok: false; message: string };

const schema = z.object({
  dealId: z.union([uuid, z.literal("")]).default(""),
  conversationId: z.union([uuid, z.literal("")]).default(""),
  clientName: z.string().trim().max(100).default(""),
  locale: z.enum(["ru", "kk"]).default("ru"),
  channel: z.string().refine(isManualChannel, "Укажите, откуда пришёл клиент"),
  plan: z.string().refine((p) => !!getPlan(p), "Выберите тариф договорённости"),
  agreedTotal: z.coerce.number().int().min(1, "Укажите цену книги").max(10_000_000),
  amount: z.coerce.number().int().min(1, "Сумма счёта — больше нуля").max(10_000_000),
  purpose: z.enum(["prepayment", "remainder", "full", "custom"]),
  /** Ключ формы (uuid из браузера): двойное нажатие не выпускает второй счёт и не шлёт сообщение дважды. */
  issueKey: z.union([uuid, z.literal("")]).default(""),
  /** Выставить и счёт Kaspi на номер WhatsApp-чата клиента (номер подставляет сервер). */
  kaspiPush: z.coerce.boolean().default(false),
});

/** Способы оплаты, которые увидит клиент; пусто — выставлять счёт нельзя. */
async function availableMethods() {
  const c = container();
  const [kaspi, transfer] = await Promise.all([c.ordering.kaspi.available().catch(() => false), transferRequisites()]);
  return { kaspi, card: isOnlinePayment(), transfer: !!transfer };
}

/** Мобильный Казахстана (77XXXXXXXXX, без городских 7172/727…) — на него можно выставить счёт Kaspi. */
const isKzMobile = (digits: string | null) => !!kaspiPhone(digits);

/** Что нужно форме счёта: договорённость из сделки, остаток, открытый счёт, способы оплаты, счёт Kaspi на номер. */
export interface InvoiceFormInfo {
  dealId: string | null;
  dealNumber: number | null;
  plan: string | null;
  /** Цена книги по договорённости (сумма сделки); 0 — ещё не договорились. */
  agreedTotal: number;
  paid: number;
  hasOrder: boolean;
  open: { id: string; label: string; amount: number } | null;
  clientName: string;
  locale: "ru" | "kk";
  channel: string;
  methods: { kaspi: boolean; card: boolean; transfer: boolean };
  /** Счёт Kaspi на номер чата возможен: Kaspi подключён и номер — казахстанский мобильный; номер — с маской. */
  kaspiPhoneMasked: string | null;
  /** null — без лимита (руководитель); иначе скидка от прайса тарифа не больше N %. */
  maxDiscountPercent: number | null;
}

export async function invoiceFormInfoAction(raw: { dealId?: string; conversationId?: string }): Promise<{ ok: true; info: InvoiceFormInfo } | { ok: false; message: string }> {
  const staff = await assertStaff("chats.send", "deals.edit");
  const input = z.object({ dealId: z.union([uuid, z.literal("")]).default(""), conversationId: z.union([uuid, z.literal("")]).default("") }).safeParse(raw);
  if (!input.success) return { ok: false, message: "Неверный запрос" };
  const c = container();
  const conv0 = input.data.conversationId ? await conversationOf(staff, input.data.conversationId) : null;
  const dealId = input.data.dealId || conv0?.dealId || "";
  const deal = dealId ? await c.sales.deals.findById(dealId) : null;
  if (dealId && !deal) return { ok: false, message: "Сделка не найдена" };
  if (deal) assertWorkable(staff, deal.assigneeId);
  const conv = conv0 ?? (deal ? await c.messaging.queries.whatsappForDeal(deal.id) : null);
  const phone = conv?.channel === "whatsapp" && isPhoneLike(conv.chatId) ? normalizePhone(conv.chatId) : null;
  const [methods, plan, paid, open, maxDiscount] = await Promise.all([
    availableMethods(),
    deal ? c.sales.agreedPlan.get(deal.id) : Promise.resolve(null),
    deal ? c.sales.payments.paidTotal(deal.id) : Promise.resolve(0),
    deal ? c.ordering.invoices.listFor(deal.id).then((l) => l.find((i) => i.isPayable(new Date())) ?? null) : Promise.resolve(null),
    getSetting("crm.maxDiscount"),
  ]);
  return {
    ok: true,
    info: {
      dealId: deal?.id ?? null,
      dealNumber: deal?.number ?? null,
      plan: plan ?? null,
      agreedTotal: deal?.amount ?? 0,
      paid,
      hasOrder: !!deal?.orderId,
      open: open ? { id: open.id, label: open.label, amount: open.amount } : null,
      clientName: deal?.contactName || conv?.contactName || "",
      locale: "ru",
      channel: conv && isManualChannel(sourceFromChannel(conv.channel)) ? sourceFromChannel(conv.channel) : "",
      methods,
      kaspiPhoneMasked: methods.kaspi && isKzMobile(phone) ? maskPhone(phone) : null,
      maxDiscountPercent: can(staff, "deals.delete") ? null : Number(maxDiscount) || 0,
    },
  };
}

const payLink = (invoice: DealInvoice) => `${env.appUrl}${invoice.snapshot().locale === "kk" ? "/kk" : ""}/pay/${invoice.token}`;

/** Текст счёта для клиента — на языке счёта; номер для счёта Kaspi показываем с маской. */
function invoiceText(invoice: DealInvoice, kaspi: { phone: string; org: string | null } | null = null) {
  const s = invoice.snapshot();
  const t = messagesFor(s.locale).pay;
  const until = new Intl.DateTimeFormat(s.locale === "kk" ? "kk-KZ" : "ru-RU", { timeZone: storeTimeZone(), day: "numeric", month: "long" }).format(s.expiresAt);
  return t.message({ name: s.clientName.split(" ")[0] ?? "", label: invoice.label, plan: planName(s.plan, s.locale), purpose: t.purpose[s.purpose], amount: formatPrice(s.amount), link: payLink(invoice), until, kaspiPhone: kaspi ? maskPhone(kaspi.phone) : null, kaspiOrg: kaspi?.org ?? null });
}

async function conversationOf(staff: Staff, id: string) {
  const conv = await container().messaging.queries.conversation(id);
  if (!conv) throw new Error("Диалог не найден");
  assertVisible(staff, conv.assigneeId);
  assertWorkable(staff, conv.assigneeId);
  return conv;
}

/**
 * Счёт из чата или сделки: договорённость (тариф, цена) — в сделку, ссылка /pay/<token> — клиенту в WhatsApp. Диалог без
 * сделки — сделка заводится. Телефон плательщика — номер WhatsApp-чата (его подставляет сервер: менеджер номер не видит).
 * Цена ниже прайса сверх лимита скидки — только руководитель.
 */
export async function issueInvoiceAction(raw: z.input<typeof schema>): Promise<InvoiceResult> {
  const staff = await assertStaff("chats.send", "deals.edit");
  const parsed = schema.safeParse(raw);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message };
  const d = parsed.data;
  if (d.amount > d.agreedTotal) return { ok: false, message: "Сумма счёта больше цены книги" };
  const methods = await availableMethods();
  if (!methods.kaspi && !methods.card && !methods.transfer) return { ok: false, message: "Нет способа оплаты: подключите Kaspi или укажите реквизиты перевода в «Интеграциях»" };
  const c = container();
  let conv = d.conversationId ? await conversationOf(staff, d.conversationId) : null;
  let dealId = d.dealId || conv?.dealId || "";
  if (!dealId && conv) {
    // Диалог без сделки — заводим её, как «Создать сделку» из чата.
    const phone = isPhoneLike(conv.chatId) ? normalizePhone(conv.chatId) : null;
    const deal = await c.sales.deals.create({ title: `Заявка из ${channelLabel(conv.channel)}${conv.contactName ? `: ${conv.contactName}` : ""}`, source: sourceFromChannel(conv.channel), clientId: conv.clientId, contactName: conv.contactName, contactPhone: phone, assigneeId: conv.assigneeId ?? staff.user.id, createdById: staff.user.id });
    await c.messaging.chats.linkCreatedDeal(conv.id, deal);
    dealId = deal.id;
  }
  const deal = dealId ? await c.sales.deals.findById(dealId) : null;
  if (!deal) return { ok: false, message: "Сделка не найдена" };
  assertWorkable(staff, deal.assigneeId);
  // Со страницы сделки — её диалог WhatsApp (туда уйдёт счёт и потом доступ).
  conv ??= await c.messaging.queries.whatsappForDeal(deal.id);
  const phone = conv?.channel === "whatsapp" && isPhoneLike(conv.chatId) ? normalizePhone(conv.chatId) : null;
  const limit = can(staff, "deals.delete") ? null : Number(await getSetting("crm.maxDiscount")) || 0;
  let invoice: DealInvoice;
  let repeated = false;
  try {
    ({ invoice, repeated } = await c.ordering.invoices.issue({
      dealId: deal.id,
      conversationId: conv?.id ?? null,
      phone,
      clientName: d.clientName || deal.contactName,
      locale: d.locale,
      channel: d.channel,
      plan: d.plan,
      agreedTotal: d.agreedTotal,
      amount: d.amount,
      purpose: d.purpose,
      actor: { userId: staff.user.id, label: staff.user.email },
      maxDiscountPercent: limit,
      issueKey: d.issueKey || null,
    }));
  } catch (err) {
    if (OrderingError.is(err) && err.code === "paymentRule") return { ok: false, message: err.message };
    throw err;
  }
  const link = payLink(invoice);
  if (repeated) return { ok: true, message: `Счёт ${invoice.label} уже выставлен`, link, text: invoiceText(invoice), sent: false };
  // Счёт Kaspi на номер чата — после выпуска (вне транзакции: сеть). Не вышло — счёт остаётся, клиент платит по ссылке.
  const push = !d.kaspiPush ? null : methods.kaspi && isKzMobile(phone) ? await pushKaspi(invoice, phone!) : ({ ok: false, message: "Счёт Kaspi на номер не выставлен: Kaspi не подключён или номер чата не казахстанский мобильный" } as const);
  const text = invoiceText(invoice, push?.ok ? { phone: phone!, org: push.org } : null);
  let sent = false;
  if (conv) {
    const msg = await c.messaging.chats.send(conv.id, text, staff.user.id);
    sent = msg.status !== "error";
  }
  await audit(staff, "invoice.issue", "deal", deal.id, { invoice: invoice.label, amount: d.amount, agreed: d.agreedTotal, plan: d.plan, phone: phone ? phoneTail(phone) : null, kaspiPush: push ? push.ok : null });
  revalidatePath(`/admin/deals/${deal.id}`);
  revalidatePath("/admin/chats");
  const message = sent ? `Счёт ${invoice.label} отправлен клиенту` : conv ? `Счёт ${invoice.label} создан, но сообщение не ушло — скопируйте ссылку` : `Счёт ${invoice.label} создан — отправьте ссылку клиенту`;
  return { ok: true, message: push && !push.ok ? `${message}. ${push.message}` : message, link, text, sent };
}

/** Тексты для менеджера, когда счёт Kaspi на номер не выставился (счёт по ссылке при этом действует). */
const KASPI_PUSH_ERRORS: Partial<Record<string, string>> = {
  kaspiUnavailable: "Kaspi не ответил",
  kaspiNotConnected: "кассир Kaspi не подключён",
  phoneInvalid: "номер чата не подходит для Kaspi",
  notPayable: "счёт уже не ждёт оплаты",
};

/** Счёт Kaspi на номер клиента; ошибка Kaspi не отменяет счёт — менеджер получает понятный текст. */
async function pushKaspi(invoice: DealInvoice, phone: string): Promise<{ ok: true; org: string | null } | { ok: false; message: string }> {
  const ordering = container().ordering;
  try {
    await ordering.kaspi.pushDealInvoice(invoice.id, phone);
    return { ok: true, org: await ordering.kaspiRecipient() };
  } catch (err) {
    if (!OrderingError.is(err)) console.error("[invoices] kaspi push", err);
    const reason = (OrderingError.is(err) && KASPI_PUSH_ERRORS[err.code]) || "ошибка Kaspi";
    return { ok: false, message: `Счёт Kaspi на номер не выставлен (${reason}) — клиент может оплатить по ссылке` };
  }
}

async function invoiceOf(staff: Staff, id: string) {
  const invoice = await container().ordering.invoices.byId(uuid.parse(id));
  if (!invoice) throw new Error("Счёт не найден");
  const deal = await container().sales.deals.findById(invoice.dealId);
  if (!deal) throw new Error("Сделка не найдена");
  assertWorkable(staff, deal.assigneeId);
  return { invoice, deal };
}

export async function cancelInvoiceAction(id: string): Promise<{ ok: boolean; message: string }> {
  const staff = await assertStaff("deals.edit");
  const { invoice, deal } = await invoiceOf(staff, id);
  const done = await container().ordering.invoices.cancel(invoice.id, `отменил ${staff.user.email}`);
  if (!done) return { ok: false, message: "Счёт уже не ждёт оплаты" };
  await audit(staff, "invoice.cancel", "deal", deal.id, { invoice: invoice.label });
  revalidatePath(`/admin/deals/${deal.id}`);
  return { ok: true, message: `Счёт ${invoice.label} отменён` };
}

/** Отправить счёт клиенту ещё раз (тот же текст и ссылка) — в его диалог WhatsApp. */
export async function resendInvoiceAction(id: string): Promise<InvoiceResult> {
  const staff = await assertStaff("chats.send", "deals.edit");
  const { invoice, deal } = await invoiceOf(staff, id);
  if (!invoice.isPayable(new Date())) return { ok: false, message: "Счёт уже не ждёт оплаты — выставьте новый" };
  const convId = invoice.snapshot().conversationId;
  const text = invoiceText(invoice);
  const link = payLink(invoice);
  if (!convId) return { ok: true, message: "У счёта нет диалога — скопируйте ссылку", link, text, sent: false };
  const msg = await container().messaging.chats.send(convId, text, staff.user.id);
  await audit(staff, "invoice.resend", "deal", deal.id, { invoice: invoice.label });
  return { ok: true, message: msg.status === "error" ? "Сообщение не ушло — скопируйте ссылку" : "Отправлено ещё раз", link, text, sent: msg.status !== "error" };
}
