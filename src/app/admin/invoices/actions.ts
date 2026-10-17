"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { env } from "@/config/env";
import { getPlan, getVisiblePlans } from "@/config/site";
import { uuid } from "@/server/input";
import { assertStaff, assertVisible, assertWorkable, audit, can, canSeeAssigned, contactView, type Staff } from "@/server/access";
import { container } from "@/server/container";
import { rateLimit } from "@/server/rateLimit";
import { getSetting } from "@/modules/workspace";
import { DEAL_INVOICE_TTL_MS, OrderingError, type DealInvoice } from "@/modules/ordering";
import { planLabels } from "@/modules/ordering/ui/labels";
import { maskPhone } from "@/modules/access";
import { isPhoneEmail } from "@/modules/identity";
import { payLink } from "./view";
import { availableMethods, invoiceText, isKzMobile, pushKaspi } from "@/server/deal-invoices";
import { sourceFromChannel } from "@/modules/sales";
import { channelLabel } from "@/modules/messaging";
import { isManualChannel } from "@/shared/domain/channels";
import { formatPhone, isPhoneLike, normalizePhone, phoneTail } from "@/shared/domain/phone";
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
  /** Сколько книг оплачивает счёт (цена выше — за одну). */
  count: z.coerce.number().int("Количество книг — целое число").min(1, "Книг — хотя бы одна").max(20, "Не больше 20 книг в одном счёте").default(1),
  amount: z.coerce.number().int().min(1, "Сумма счёта — больше нуля").max(10_000_000),
  purpose: z.enum(["prepayment", "remainder", "full", "custom"]),
  /** Ключ формы (uuid из браузера): двойное нажатие не выпускает второй счёт и не шлёт сообщение дважды. */
  issueKey: z.union([uuid, z.literal("")]).default(""),
  /** Выставить и счёт Kaspi на номер WhatsApp-чата клиента (номер подставляет сервер). */
  kaspiPush: z.coerce.boolean().default(false),
});

/** Что нужно форме счёта: договорённость из сделки, остаток, открытый счёт, способы оплаты, счёт Kaspi на номер. */
export interface InvoiceFormInfo {
  dealId: string | null;
  dealNumber: number | null;
  plan: string | null;
  /** Цена одной книги по договорённости (сумма сделки); 0 — ещё не договорились. */
  agreedTotal: number;
  /** Сделка — пакет из N книг (счёт выставляется на весь пакет); null — обычная сделка. */
  batchSize?: number | null;
  paid: number;
  hasOrder: boolean;
  /** Заказ сделки: вместо формы — ссылка на него (оплата идёт в заказе). */
  orderId: string | null;
  /** Сделка закрыта (успех или отказ): счёт не выставить, пока её не вернут в работу. */
  closed: boolean;
  open: { id: string; label: string; amount: number } | null;
  clientName: string;
  /** Язык кабинета клиента сделки (есть аккаунт), иначе ru. */
  locale: "ru" | "kk";
  channel: string;
  /** Куда уйдёт счёт: канал диалога (WhatsApp…); null — диалога нет, ссылку менеджер отправит сам. */
  chat: string | null;
  /** Тарифы, которые сейчас продаются, с ценой из «Цены и тарифы» (+ тариф договорённости, если его сняли с продажи). */
  plans: { id: string; label: string; price: number }[];
  methods: { kaspi: boolean; card: boolean; transfer: boolean };
  /** Счёт Kaspi на номер чата возможен: Kaspi подключён и номер — казахстанский мобильный; номер — с маской. */
  kaspiPhoneMasked: string | null;
  /** null — без лимита (руководитель); иначе скидка от прайса тарифа не больше N %. */
  maxDiscountPercent: number | null;
  /** Для предпросмотра сообщения: срок счёта и вид ссылки на обоих языках (настоящая ссылка — при выпуске). */
  preview: { until: Record<"ru" | "kk", string>; link: Record<"ru" | "kk", string> };
}

/** Срок счёта словами — тот же формат, что в сообщении клиенту (invoiceText). */
const untilLabel = (d: Date, locale: "ru" | "kk") => new Intl.DateTimeFormat(locale === "kk" ? "kk-KZ" : "ru-RU", { timeZone: storeTimeZone(), day: "numeric", month: "long" }).format(d);

export async function invoiceFormInfoAction(raw: { dealId?: string; conversationId?: string }): Promise<{ ok: true; info: InvoiceFormInfo } | { ok: false; message: string }> {
  const staff = await assertStaff("chats.send", "deals.edit");
  const input = z.object({ dealId: z.union([uuid, z.literal("")]).default(""), conversationId: z.union([uuid, z.literal("")]).default("") }).safeParse(raw);
  if (!input.success) return { ok: false, message: "Неверный запрос" };
  const c = container();
  const conv0 = input.data.conversationId ? await conversationOf(staff, input.data.conversationId) : null;
  if (conv0?.dealId && input.data.dealId && conv0.dealId !== input.data.dealId) return { ok: false, message: "Диалог относится к другой сделке" };
  const dealId = input.data.dealId || conv0?.dealId || "";
  const deal = dealId ? await c.sales.deals.findById(dealId) : null;
  if (dealId && !deal) return { ok: false, message: "Сделка не найдена" };
  if (deal) assertWorkable(staff, deal.assigneeId);
  const conv = conv0 ?? (deal ? await c.messaging.queries.whatsappForDeal(deal.id) : null);
  const phone = conv?.channel === "whatsapp" && isPhoneLike(conv.chatId) ? normalizePhone(conv.chatId) : null;
  const clientId = deal?.clientId ?? conv?.clientId ?? null;
  const batchSize = deal ? (await c.sales.batch.money(deal.id)).size : null;
  const [methods, plan, paid, open, maxDiscount, stage, client] = await Promise.all([
    availableMethods(),
    deal ? c.sales.agreedPlan.get(deal.id) : Promise.resolve(null),
    deal ? c.sales.batch.money(deal.id).then((b) => (b.size ? b.paid : c.sales.payments.paidTotal(deal.id))) : Promise.resolve(0),
    deal ? c.ordering.invoices.listFor(deal.id).then((l) => l.find((i) => i.isPayable(new Date())) ?? null) : Promise.resolve(null),
    getSetting("crm.maxDiscount"),
    deal ? c.sales.deals.stage(deal.stageId) : Promise.resolve(null),
    clientId ? c.reporting.clientBrief(clientId) : Promise.resolve(null),
  ]);
  // Имя диалога бывает номером телефона: менеджер со скрытыми номерами его не видит и здесь.
  const name = deal?.contactName || conv?.contactName || "";
  const plans = getVisiblePlans().map((p) => ({ id: p.id, label: planLabels[p.id], price: p.price }));
  const agreedPlan = plan ? getPlan(plan) : undefined;
  if (agreedPlan && !plans.some((p) => p.id === agreedPlan.id)) plans.push({ id: agreedPlan.id, label: `${planLabels[agreedPlan.id]} (снят с продажи)`, price: agreedPlan.price });
  const until = new Date(Date.now() + DEAL_INVOICE_TTL_MS);
  return {
    ok: true,
    info: {
      dealId: deal?.id ?? null,
      dealNumber: deal?.number ?? null,
      plan: plan ?? null,
      agreedTotal: deal?.amount ?? 0,
      batchSize: batchSize && batchSize > 1 ? batchSize : null,
      paid,
      hasOrder: !!deal?.orderId,
      orderId: deal?.orderId ?? null,
      closed: !!stage && stage.kind !== "open",
      open: open ? { id: open.id, label: open.label, amount: open.amount } : null,
      clientName: isPhoneLike(name) && !can(staff, "clients.contacts") ? "" : name,
      locale: client?.role === "user" && client.locale === "kk" ? "kk" : "ru",
      channel: conv && isManualChannel(sourceFromChannel(conv.channel)) ? sourceFromChannel(conv.channel) : "",
      chat: conv ? channelLabel(conv.channel) : null,
      plans,
      methods,
      kaspiPhoneMasked: methods.kaspi && isKzMobile(phone) ? maskPhone(phone) : null,
      maxDiscountPercent: can(staff, "deals.delete") ? null : Number(maxDiscount) || 0,
      preview: { until: { ru: untilLabel(until, "ru"), kk: untilLabel(until, "kk") }, link: { ru: `${env.appUrl}/pay/…`, kk: `${env.appUrl}/kk/pay/…` } },
    },
  };
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
  if (d.amount > d.agreedTotal * d.count) return { ok: false, message: "Сумма счёта больше цены книги" };
  if (!(await rateLimit(`invoice:${staff.user.id}`, 20, 600_000))) return { ok: false, message: "Слишком много счетов подряд — подождите несколько минут" };
  const methods = await availableMethods();
  if (!methods.kaspi && !methods.card && !methods.transfer) return { ok: false, message: "Нет способа оплаты: подключите Kaspi или укажите реквизиты перевода в «Интеграциях»" };
  const c = container();
  let conv = d.conversationId ? await conversationOf(staff, d.conversationId) : null;
  if (conv?.dealId && d.dealId && conv.dealId !== d.dealId) return { ok: false, message: "Диалог относится к другой сделке" };
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
      // Имя для обращения, а не номер: номер в тексте счёта увидел бы и менеджер со скрытыми номерами.
      clientName: [d.clientName, deal.contactName].find((n) => n && !isPhoneLike(n)) ?? "",
      locale: d.locale,
      channel: d.channel,
      plan: d.plan,
      agreedTotal: d.agreedTotal,
      count: d.count,
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
  await audit(staff, "invoice.issue", "deal", deal.id, { invoice: invoice.label, amount: d.amount, agreed: d.agreedTotal, count: d.count, plan: d.plan, phone: phone ? phoneTail(phone) : null, kaspiPush: push ? push.ok : null });
  revalidatePath(`/admin/deals/${deal.id}`);
  revalidatePath("/admin/chats");
  const message = sent ? `Счёт ${invoice.label} отправлен клиенту` : conv ? `Счёт ${invoice.label} создан, но сообщение не ушло — скопируйте ссылку` : `Счёт ${invoice.label} создан — отправьте ссылку клиенту`;
  return { ok: true, message: push && !push.ok ? `${message}. ${push.message}` : message, link, text, sent };
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
  revalidatePath("/admin/chats");
  return { ok: true, message: `Счёт ${invoice.label} отменён` };
}

/** Отправить счёт клиенту ещё раз (тот же текст и ссылка) — в его диалог WhatsApp. */
export async function resendInvoiceAction(id: string): Promise<InvoiceResult> {
  const staff = await assertStaff("chats.send", "deals.edit");
  const { invoice, deal } = await invoiceOf(staff, id);
  if (!invoice.isPayable(new Date())) return { ok: false, message: "Счёт уже не ждёт оплаты — выставьте новый" };
  if (!(await rateLimit(`invoice-resend:${staff.user.id}`, 20, 600_000))) return { ok: false, message: "Слишком много повторов подряд — подождите несколько минут" };
  const convId = invoice.snapshot().conversationId;
  const text = invoiceText(invoice);
  const link = payLink(invoice);
  if (!convId) return { ok: true, message: "У счёта нет диалога — скопируйте ссылку", link, text, sent: false };
  const msg = await container().messaging.chats.send(convId, text, staff.user.id);
  await audit(staff, "invoice.resend", "deal", deal.id, { invoice: invoice.label });
  revalidatePath("/admin/chats");
  return { ok: true, message: msg.status === "error" ? "Сообщение не ушло — скопируйте ссылку" : "Отправлено ещё раз", link, text, sent: msg.status !== "error" };
}

/** Аккаунт клиента, которому можно выдать доступ: роль «клиент» и виден сотруднику (у «только свои» — свой или ничей). */
async function clientAccount(staff: Staff, userId: string) {
  const brief = await container().reporting.clientBrief(userId);
  return brief && brief.role === "user" && canSeeAssigned(staff, brief.managerId) ? brief : null;
}

/** Аккаунт в списке выбора: контакты — с маской у менеджера без права видеть их полностью. */
export interface AccessAccount {
  id: string;
  name: string;
  contact: string;
  /** Почему он в списке без поиска: клиент сделки, ему уже выдавали доступ по этому счёту. */
  hint: string | null;
}

const accountView = (staff: Staff, u: { id: string; name: string; email: string; phone: string | null }, hint: string | null): AccessAccount => {
  const v = contactView(staff, { email: u.email, phone: u.phone ? formatPhone(u.phone) : null });
  return { id: u.id, name: u.name || "Без имени", contact: [v.email, v.phone].filter(Boolean).join(" · "), hint };
};

/**
 * Чей аккаунт (доступ «нужен менеджер»): клиент сделки и прежний получатель — сразу, остальные — поиском по имени или почте.
 * Менеджер со скрытыми номерами ищет только по имени и настоящей почте: совпадение по цифрам телефона раскрывало бы номер.
 */
export async function invoiceAccountsAction(raw: { invoiceId: string; q?: string }): Promise<{ ok: true; accounts: AccessAccount[] } | { ok: false; message: string }> {
  const staff = await assertStaff("clients.create");
  const input = z.object({ invoiceId: uuid, q: z.string().trim().max(100).default("") }).safeParse(raw);
  if (!input.success) return { ok: false, message: "Неверный запрос" };
  if (!(await rateLimit(`invoice-accounts:${staff.user.id}`, 60, 60_000))) return { ok: false, message: "Слишком много запросов — подождите минуту" };
  const { invoice, deal } = await invoiceOf(staff, input.data.invoiceId);
  const c = container();
  const known = [
    { id: deal.clientId, hint: "клиент сделки" },
    { id: invoice.snapshot().accessUserId, hint: "доступ по счёту выдавали ему" },
  ].filter((k): k is { id: string; hint: string } => !!k.id);
  const accounts = new Map<string, AccessAccount>();
  for (const k of known) {
    const u = accounts.has(k.id) ? null : await clientAccount(staff, k.id);
    if (u) accounts.set(u.id, accountView(staff, u, k.hint));
  }
  const q = input.data.q;
  if (q.length >= 2 && can(staff, "clients.view")) {
    const { clientRows } = await c.reporting.search(q, { userId: staff.user.id, seesAll: staff.scope === "all" }, { clients: true, orders: false, deals: false, chats: false });
    const full = can(staff, "clients.contacts");
    const needle = q.toLowerCase();
    for (const u of clientRows) {
      if (u.role !== "user" || accounts.has(u.id)) continue;
      if (!full && !u.name.toLowerCase().includes(needle) && (isPhoneEmail(u.email) || !u.email.toLowerCase().includes(needle))) continue;
      accounts.set(u.id, accountView(staff, u, null));
    }
  }
  return { ok: true, accounts: [...accounts.values()].slice(0, 20) };
}

/**
 * «Отправить доступ ещё раз»: выдача доступа снова встаёт в очередь планировщика (новая ссылка, прежняя гаснет). При «нужен
 * менеджер» — только с выбранным аккаунтом: доступ получит он. Право — как у выдачи доступа клиенту (clients.create).
 */
export async function resendInvoiceAccessAction(raw: { invoiceId: string; userId?: string }): Promise<{ ok: boolean; message: string }> {
  const staff = await assertStaff("clients.create");
  const input = z.object({ invoiceId: uuid, userId: z.union([uuid, z.literal("")]).default("") }).safeParse(raw);
  if (!input.success) return { ok: false, message: "Неверный запрос" };
  const { invoice, deal } = await invoiceOf(staff, input.data.invoiceId);
  const s = invoice.snapshot();
  if (s.status !== "paid") return { ok: false, message: "Доступ в кабинет выдаётся после оплаты счёта" };
  if (s.accessStatus === "due") return { ok: false, message: "Доступ уже отправляется — подождите минуту" };
  const userId = input.data.userId || null;
  if (s.accessStatus === "needs_manager" && !userId) return { ok: false, message: "Выберите аккаунт клиента" };
  if (userId && !(await clientAccount(staff, userId))) return { ok: false, message: "Клиент не найден" };
  await container().ordering.invoices.setAccess(invoice.id, "due", userId ?? undefined);
  await audit(staff, "invoice.access", "deal", deal.id, { invoice: invoice.label, before: s.accessStatus, user: userId });
  revalidatePath(`/admin/deals/${deal.id}`);
  revalidatePath("/admin/chats");
  return { ok: true, message: userId ? "Доступ отправится выбранному клиенту в течение минуты" : "Доступ отправится ещё раз в течение минуты" };
}
