import "server-only";
import { randomBytes } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import { db } from "../db";
import { books, orders, users, type CrmConversation } from "../db/schema";
import { appLink } from "../mail";
import { formatDate } from "../utils";
import type { Locale } from "@/i18n/config";
import { getSetting } from "./settings";

/** Что менеджер может отправить клиенту из чата одной кнопкой. */
export interface ChatOffers {
  order: { number: number } | null;
  book: { title: string } | null;
  maxDiscount: number;
}

async function context(conv: Pick<CrmConversation, "clientId">) {
  if (!conv.clientId) return { locale: "ru" as Locale, order: null, book: null };
  const [client, order, book] = await Promise.all([
    db.query.users.findFirst({ where: eq(users.id, conv.clientId), columns: { locale: true } }),
    db.query.orders.findFirst({ where: and(eq(orders.userId, conv.clientId), eq(orders.status, "pending_payment")), orderBy: desc(orders.createdAt) }),
    db.query.books.findFirst({ where: and(eq(books.userId, conv.clientId), eq(books.status, "draft")), orderBy: desc(books.updatedAt) }),
  ]);
  return { locale: (client?.locale ?? "ru") as Locale, order: order ?? null, book: book ?? null };
}

export async function chatOffers(conv: Pick<CrmConversation, "clientId">, canDiscount: boolean): Promise<ChatOffers> {
  const c = await context(conv);
  return {
    order: c.order ? { number: c.order.number } : null,
    book: c.book ? { title: c.book.title || "Книга" } : null,
    maxDiscount: canDiscount ? Math.min(50, Math.max(0, Number(await getSetting("crm.maxDiscount")) || 0)) : 0,
  };
}

/** Тексты — на языке клиента (из его профиля на сайте). */
const texts = {
  ru: {
    order: (n: number, url: string) => `Ваш заказ №${n}: ${url}\nТам можно оплатить и следить за статусом.`,
    book: (title: string, url: string) => `Ваша книга «${title}» — продолжить можно здесь: ${url}`,
    discount: (p: number, code: string, until: string, url: string) => `Дарим персональную скидку ${p}% — промокод ${code}, действует до ${until}. Скидка применится сама по ссылке: ${url}`,
  },
  kk: {
    order: (n: number, url: string) => `Сіздің №${n} тапсырысыңыз: ${url}\nСол жерден төлеп, мәртебесін қадағалай аласыз.`,
    book: (title: string, url: string) => `«${title}» кітабыңызды осы жерден жалғастыра аласыз: ${url}`,
    discount: (p: number, code: string, until: string, url: string) => `Сізге жеке ${p}% жеңілдік — ${code} промокоды, ${until} дейін жарамды. Сілтеме арқылы жеңілдік өзі қосылады: ${url}`,
  },
} satisfies Record<Locale, unknown>;

export type OfferRequest = { kind: "order" } | { kind: "book" } | { kind: "discount"; percent: number; hours: number };

/** Готовит текст сообщения (и персональный промокод для скидки). Отправляет вызывающий. */
export async function buildOffer(conv: Pick<CrmConversation, "clientId">, req: OfferRequest, staffLabel: string): Promise<{ text: string; promo?: string }> {
  const c = await context(conv);
  const t = texts[c.locale];
  if (req.kind === "order") {
    if (!c.order) throw new Error("У клиента нет неоплаченного заказа");
    return { text: t.order(c.order.number, appLink(`/orders/${c.order.id}`, c.locale)) };
  }
  if (req.kind === "book") {
    if (!c.book) throw new Error("У клиента нет книги в работе");
    return { text: t.book(c.book.title || "—", appLink(`/books/${c.book.id}`, c.locale)) };
  }
  const max = Math.min(50, Number(await getSetting("crm.maxDiscount")) || 0);
  if (!Number.isInteger(req.percent) || req.percent < 1 || req.percent > max) throw new Error(`Скидка — от 1 до ${max}%`);
  if (![24, 48, 72, 168].includes(req.hours)) throw new Error("Неверный срок действия");
  const { container } = await import("@/server/container");
  const promo = await container().ordering.promos.issuePersonal({ code: `MB-${randomBytes(4).toString("hex").toUpperCase().slice(0, 6)}`, percent: req.percent, validHours: req.hours, note: `Персональная скидка из чата · ${staffLabel}` });
  if (!promo) throw new Error("Не удалось выпустить промокод, попробуйте ещё раз");
  const code = promo.code;
  const expiresAt = promo.expiresAt!;
  const url = c.book ? appLink(`/books/${c.book.id}/checkout?promo=${code}`, c.locale) : appLink("/", c.locale);
  return { text: t.discount(req.percent, code, formatDate(expiresAt, true, c.locale), url), promo: code };
}
