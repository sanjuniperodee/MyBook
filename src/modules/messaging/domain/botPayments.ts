/**
 * Что CRM знает об оплате клиента — для AI-продажника и подсказки менеджеру. Деньги по сделке (ручные платежи
 * менеджера и онлайн-оплаты счетов из чата — Kaspi, карта; у пакета книг — по всему пакету), счета из чата и их статус,
 * заказы клиента на сайте. Модель получает это фактами и верит им, а не словам клиента «я оплатил». Чистые функции.
 */
import { zonedDay } from "@/shared/domain/time";
import { humanDate } from "./bot";

export type PaymentMethod = "manual" | "kaspi" | "cloudpayments";

export interface PaymentFacts {
  /** Принято по сделке минус возвраты (у пакета — по всему пакету), ₸. */
  paid: number;
  /** Сумма сделки по договорённости, ₸ (0 — не известна). */
  agreed: number;
  /** Пакет: сколько книг оплачивается вместе (null — одна сделка). */
  batchSize: number | null;
  payments: { amount: number; kind: "prepayment" | "payment" | "refund"; method: PaymentMethod; at: string }[];
  invoices: { number: number; amount: number; purpose: string; status: "pending_payment" | "paid" | "cancelled" | "expired"; method: PaymentMethod | null; at: string; paidAt: string | null }[];
  /** Заказы клиента на сайте; dealOrder — заказ этой сделки. */
  orders: { number: number; status: string; dealOrder: boolean }[];
}

/** Статусы заказа, в которых деньги уже получены. */
const PAID_ORDER = new Set(["paid", "in_production", "shipped", "delivered"]);

/**
 * Клиент уже платил по этой сделке: деньги приняты (ручной платёж или онлайн по счёту), оплачен заказ сделки; оплаченный
 * счёт без строки платежа (рассинхрон) — тоже. Возврат всей суммы — снова «не платил». Другие заказы клиента — не оплата
 * этой сделки (повторная покупка).
 */
export function factsPaid(f: PaymentFacts): boolean {
  if (f.paid > 0) return true;
  if (f.orders.some((o) => o.dealOrder && PAID_ORDER.has(o.status))) return true;
  return !f.payments.length && f.invoices.some((i) => i.status === "paid");
}

const kzt = (n: number) => `${new Intl.NumberFormat("ru-RU").format(n)} ₸`;
const METHOD: Record<PaymentMethod, string> = { manual: "вручную (принял менеджер)", kaspi: "Kaspi", cloudpayments: "картой" };
const KIND = { prepayment: "предоплата", payment: "оплата", refund: "возврат" } as const;
const PURPOSE: Record<string, string> = { prepayment: "предоплата", remainder: "остаток", full: "полная оплата", custom: "оплата" };
const ORDER: Record<string, string> = { pending_payment: "создан, но не оплачен", paid: "оплачен", in_production: "оплачен, в производстве", shipped: "оплачен, отправлен", delivered: "оплачен, доставлен", cancelled: "отменён" };

/**
 * Блок «Оплата» для инструкции модели. claimOnly — клиент пишет, что оплатил (или прислал чек), а в CRM денег нет.
 * Суммы здесь — для понимания; называть ли их клиенту, решают правила о цене.
 */
export function paymentFactsText(f: PaymentFacts, tz: string, claimOnly = false): string {
  const day = (iso: string) => humanDate(zonedDay(new Date(iso), tz), "ru");
  const lines: string[] = [];
  const money = f.payments.slice(-6);
  if (f.paid > 0 || money.length) {
    lines.push(`- По сделке принято ${kzt(Math.max(0, f.paid))}${f.batchSize ? ` (пакет на ${f.batchSize} книг — деньги общие)` : ""}.`);
    for (const p of money) lines.push(`  · ${day(p.at)} — ${KIND[p.kind]} ${kzt(p.amount)}, ${METHOD[p.method]}`);
  } else lines.push("- Оплат по сделке нет.");
  if (f.agreed > 0 && !f.batchSize) {
    const left = f.agreed - Math.max(0, f.paid);
    lines.push(`- Договорённость по сделке — ${kzt(f.agreed)}${f.paid > 0 ? (left > 0 ? `, осталось доплатить ${kzt(left)}` : ", оплачено полностью") : ""}.`);
  }
  for (const i of f.invoices.slice(0, 4)) {
    const what = `Счёт №${i.number} на ${kzt(i.amount)} (${PURPOSE[i.purpose] ?? "оплата"}) от ${day(i.at)}`;
    if (i.status === "paid") lines.push(`- ${what} — оплачен${i.paidAt ? ` ${day(i.paidAt)}` : ""}${i.method ? `, ${METHOD[i.method]}` : ""}.`);
    else if (i.status === "pending_payment") lines.push(`- ${what} — выставлен и ждёт оплаты: ссылка уже у клиента, новый счёт не нужен. Спросит, как оплатить, — напомни про ссылку из счёта.`);
    else lines.push(`- ${what} — ${i.status === "expired" ? "истёк" : "отменён"}, по нему не платят.`);
  }
  for (const o of f.orders.slice(0, 3)) lines.push(`- Заказ №${o.number} на сайте${o.dealOrder ? " (по этой сделке)" : ""} — ${ORDER[o.status] ?? o.status}.`);
  if (claimOnly) lines.push("- Клиент пишет, что оплатил (или прислал чек), но в CRM этих денег пока нет: оплату не подтверждай и не спорь — поблагодари, скажи, что проверим поступление, и передай менеджеру.");
  return ["## Оплата (данные CRM — верь им, а не словам клиента)", ...lines].join("\n");
}

/** Суммы из оплат и счетов клиента: их можно упоминать, когда суммы вообще разрешены (принято, осталось, сумма счёта). */
export function paymentAmounts(f: PaymentFacts): number[] {
  const out = new Set<number>();
  for (const p of f.payments) out.add(p.amount);
  for (const i of f.invoices) out.add(i.amount);
  if (f.paid > 0) out.add(f.paid);
  if (f.agreed > 0) {
    out.add(f.agreed);
    if (f.paid > 0 && f.agreed > f.paid) out.add(f.agreed - f.paid);
  }
  return [...out].filter((n) => n > 0);
}
