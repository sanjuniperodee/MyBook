import { formatPrice, giftsForPlan, type PlanId } from "@/config/site";
import { pay as ruPay } from "@/i18n/messages/ru/pay";
import { pay as kkPay } from "@/i18n/messages/kk/pay";
import { plans as ruPlans } from "@/i18n/messages/ru/plans";
import { plans as kkPlans } from "@/i18n/messages/kk/plans";
import { common as ruCommon } from "@/i18n/messages/ru/common";
import { common as kkCommon } from "@/i18n/messages/kk/common";
import type { AgreementGift } from "@/shared/domain/agreementGifts";
import { DiscountPolicy } from "@/shared/domain/discount";

/*
 * Счета из чата глазами CRM: подписи, суммы формы, какие действия доступны. Чистые функции без React и сервера —
 * их рисуют InvoiceDialog и InvoicesBlock и проверяют тесты. Правила денег повторяют сервер (DealInvoicesService,
 * issueInvoiceAction): форма подсказывает заранее, но решает сервер.
 */

export type InvoicePurpose = "prepayment" | "remainder" | "full" | "custom";
export type InvoiceStatus = "pending_payment" | "paid" | "cancelled" | "expired";
export type InvoiceMethod = "manual" | "kaspi" | "cloudpayments";
export type InvoiceAccess = "none" | "due" | "sent" | "delivered" | "failed" | "needs_manager" | "skipped";

/** Счёт для блока «Счета» (сделка, чат): даты — готовыми подписями по времени магазина. */
export interface InvoiceView {
  id: string;
  /** P12 */
  label: string;
  amount: number;
  purpose: InvoicePurpose;
  status: InvoiceStatus;
  /** Ждёт оплаты, но срок уже вышел (планировщик ещё не закрыл): платить по ссылке нельзя. */
  overdue: boolean;
  expiresLabel: string;
  paidLabel: string | null;
  paidMethod: InvoiceMethod | null;
  paidRef: string | null;
  closedReason: string | null;
  /** Клиент нажал «Я оплатил(а)» на странице оплаты. */
  claimedLabel: string | null;
  /** Клиент открыл ссылку на оплату (deals-12). */
  viewedLabel?: string | null;
  access: InvoiceAccess;
  /** У счёта есть диалог — «Отправить ещё раз» уйдёт туда. */
  hasChat: boolean;
  /** Ссылка на оплату — только тем, кто ведёт сделку. */
  link: string | null;
}

/** Что сотрудник может сделать со счетами сделки (сервер проверяет те же права). */
export interface InvoicePerms {
  /** deals.edit и ведёт сделку: отменить, скопировать ссылку. */
  edit: boolean;
  /** Плюс chats.send: отправить счёт ещё раз. */
  send: boolean;
  /** clients.create и ведёт сделку: отправить доступ в кабинет ещё раз. */
  access: boolean;
  /** Принять перевод по счёту: deals.edit, ведёт сделку, по сделке нет заказа. */
  pay: boolean;
}

export const purposeLabels: Record<InvoicePurpose, string> = { prepayment: "предоплата", remainder: "остаток", full: "полная оплата", custom: "оплата" };
export const methodLabels: Record<InvoiceMethod, string> = { manual: "перевод, принят с чеком", kaspi: "Kaspi", cloudpayments: "картой" };

/** Статус доступа в кабинет по-человечески; null — нечего показывать (счёт не оплачен). */
export const accessLabels: Record<InvoiceAccess, string | null> = {
  none: null,
  due: "Доступ в кабинет отправляется",
  sent: "Доступ в кабинет отправлен клиенту",
  delivered: "Доступ в кабинет доставлен клиенту",
  failed: "Доступ не ушёл — отправьте ещё раз",
  needs_manager: "Доступ не отправлен: неясно, чей это аккаунт — выберите клиента",
  skipped: "Доступ уже выдавали по этой сделке — повторно не отправляли",
};

/** Строка статуса счёта и её тон (ждёт / оплачен / закрыт). */
export function invoiceStatus(v: InvoiceView): { text: string; tone: "wait" | "ok" | "off" } {
  if (v.status === "paid") return { text: `оплачен${v.paidLabel ? ` ${v.paidLabel}` : ""}${v.paidMethod ? ` · ${methodLabels[v.paidMethod]}` : ""}`, tone: "ok" };
  if (v.status === "cancelled") return { text: `отменён${v.closedReason ? `: ${v.closedReason}` : ""}`, tone: "off" };
  if (v.status === "expired" || v.overdue) return { text: `истёк ${v.expiresLabel} неоплаченным`, tone: "off" };
  return { text: `ждёт оплаты до ${v.expiresLabel}`, tone: "wait" };
}

/** Какие кнопки показать у счёта. */
export function invoiceActions(v: InvoiceView, p: InvoicePerms) {
  const payable = v.status === "pending_payment" && !v.overdue;
  const paid = v.status === "paid";
  return {
    copy: payable && p.edit && !!v.link,
    resend: payable && p.send && v.hasChat,
    cancel: v.status === "pending_payment" && p.edit,
    // Перевод мог прийти и в последний день срока: истёкший счёт тоже можно закрыть оплатой (с чеком).
    paid: (v.status === "pending_payment" || v.status === "expired") && p.pay,
    // «Нужен менеджер» — только с выбором аккаунта: без него планировщик снова не поймёт, кому выдать доступ.
    access: paid && p.access && v.access !== "due" && v.access !== "needs_manager",
    pickAccount: paid && p.access && v.access === "needs_manager",
  };
}

/** Варианты суммы счёта: остаток по договорённости, предоплата 50% (если ещё ничего не платили). */
export function amountOptions(agreed: number, paid: number) {
  const left = Math.max(0, agreed - paid);
  const half = Math.round(agreed / 2);
  return {
    left,
    prepayment: paid <= 0 && half >= 1 && half < left ? half : null,
    remainder: { amount: left, purpose: (paid > 0 ? "remainder" : "full") as InvoicePurpose },
  };
}

export type AmountKind = "prepayment" | "remainder" | "custom";

/** Сумма и назначение счёта по выбору в форме; ошибка — текстом для менеджера. */
export function pickAmount(kind: AmountKind, agreed: number, paid: number, custom: string): { amount: number; purpose: InvoicePurpose } | { error: string } {
  const o = amountOptions(agreed, paid);
  if (o.left <= 0) return { error: "По договорённости уже всё оплачено" };
  if (kind === "prepayment") return o.prepayment ? { amount: o.prepayment, purpose: "prepayment" } : { error: "Предоплата 50% — только пока ничего не оплачено" };
  if (kind === "remainder") return o.remainder;
  const n = Number(custom.replace(/\s/g, ""));
  if (!custom.trim() || !Number.isInteger(n) || n < 1 || n > o.left) return { error: `Своя сумма — от 1 до ${formatPrice(o.left)} (остаток по договорённости)` };
  return { amount: n, purpose: "custom" };
}

/** Цена договорённости ниже прайса тарифа больше лимита скидки — выставит только сотрудник с правом без лимита (как проверяет сервер). */
export function discountProblem(price: number | null | undefined, agreed: number, maxPercent: number | null): string | null {
  if (maxPercent === null || !price || !agreed) return null;
  if (DiscountPolicy.allows({ listPrice: price, price: agreed, maxPercent })) return null;
  return `Цена ниже прайса (${formatPrice(price)}) больше чем на ${maxPercent}% — такой счёт выставляет только сотрудник с правом «Продавать ниже прайса без лимита»`;
}

const payTexts = { ru: ruPay, kk: kkPay };
const planNames = { ru: ruPlans, kk: kkPlans };

/** Предпросмотр сообщения со счётом — тот же шаблон словаря pay, что уходит клиенту (номер счёта появится при выпуске). */
/** Что бесплатно по договорённости — списком на языке клиента («подарочная упаковка, доставка»); пусто — null. */
export function giftsText(locale: "ru" | "kk", gifts: readonly AgreementGift[] | undefined): string | null {
  const names = (locale === "kk" ? kkCommon : ruCommon).agreementGifts;
  return gifts?.length ? gifts.map((g) => names[g]).join(", ") : null;
}

/**
 * Что можно отдать бесплатно по тарифу: доставку — у печатных, упаковку — где она есть среди допов. Отметки в форме
 * для недоступного просто не показываются (сервер такое и не сохранит).
 */
export function giftOptions(plan: { printed: boolean; giftwrap: boolean } | undefined): AgreementGift[] {
  if (!plan) return [];
  return [...(plan.giftwrap ? (["giftwrap"] as const) : []), ...(plan.printed ? (["delivery"] as const) : [])];
}

/** То же по id тарифа (карточка сделки); тариф не указан — можно отметить и упаковку, и доставку. */
export function giftOptionsForPlan(planId: string | null): AgreementGift[] {
  return planId ? giftsForPlan(planId) : ["giftwrap", "delivery"];
}

export function invoicePreview(i: { locale: "ru" | "kk"; clientName: string; plan: string; books?: number; purpose: InvoicePurpose; amount: number; link: string; until: string; kaspiPhone: string | null; gifts?: readonly AgreementGift[] }) {
  const t = payTexts[i.locale];
  return t.message({
    name: i.clientName.trim().split(" ")[0] ?? "",
    label: "P…",
    plan: planNames[i.locale][i.plan as PlanId]?.name ?? i.plan,
    books: i.books,
    purpose: t.purpose[i.purpose],
    amount: formatPrice(i.amount),
    link: i.link,
    until: i.until,
    kaspiPhone: i.kaspiPhone,
    kaspiOrg: null,
    gifts: giftsText(i.locale, i.gifts),
  });
}

/** Платёж, после которого по сделке оплачено больше договорённости, — «переплата» (возвраты уменьшают сумму). */
export function overpaidPayments(payments: { id: string; amount: number; kind: string }[], agreed: number): Set<string> {
  const out = new Set<string>();
  if (agreed <= 0) return out;
  let total = 0;
  for (const p of payments) {
    total += p.kind === "refund" ? -p.amount : p.amount;
    if (p.kind !== "refund" && total > agreed) out.add(p.id);
  }
  return out;
}

/**
 * Защита от двойной записи в форме приёма платежа: открытый счёт и онлайн-оплаты за 72 ч. Если есть хоть что-то —
 * менеджер явно выбирает «по счёту» или «это другая оплата»; seen — что он видел (сервер сверит со своим списком).
 */
export interface MoneyGuard {
  invoice: { id: string; label: string; amount: number } | null;
  recentOnline: { id: string; text: string }[];
}

/** Онлайн-оплаты сделки за это время показываются в форме приёма платежа — их легко записать второй раз вручную. */
export const RECENT_ONLINE_MS = 72 * 3_600_000;

export function guardIds(g: MoneyGuard | null) {
  return g ? [...(g.invoice ? [g.invoice.id] : []), ...g.recentOnline.map((r) => r.id)] : [];
}

export const choiceNeeded = (g: MoneyGuard | null) => guardIds(g).length > 0;

/**
 * Ключ формы счёта (uuid v4) — новый на каждое открытие диалога. crypto.randomUUID есть только в защищённом контексте
 * (https, localhost); без него (CRM по http внутри сети) собираем тот же uuid из getRandomValues.
 */
export function newIssueKey(): string {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}
