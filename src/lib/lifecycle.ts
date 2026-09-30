import "server-only";
import { booksId } from "@/lib/db/refs";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { and, eq, isNull, lte, sql } from "drizzle-orm";
import { db } from "./db";
import { bookQuestions, books, crmNotes, emailLog, orderEvents, orders, users, type User } from "./db/schema";
import { appLink, emailLayout, escapeHtml, sendMail } from "./mail";
import { deadlineFor, getOccasion } from "./occasions";
import { formatPrice } from "@/config/site";
import type { Locale } from "@/i18n/config";
import { messagesFor } from "@/i18n/messages";

/**
 * Автоматические письма, которые возвращают клиента к книге и доводят до заказа.
 * Каждое письмо уходит один раз (журнал email_log), только днём по Алматы и только тем, кто не отписался.
 * Письма о заказе (оплата, отправка) — транзакционные и живут в lib/orders.
 */

const DAY = 86_400_000;
const TZ = "Asia/Almaty";
/** Порог «книга почти готова» — ответов. */
export const ALMOST_READY_ANSWERS = 25;

function secret() {
  return process.env.APP_SECRET || createHash("sha256").update(`mybook:${process.env.DATABASE_URL ?? ""}`).digest("hex");
}

export function unsubscribeToken(userId: string) {
  return createHmac("sha256", secret()).update(`unsub:${userId}`).digest("base64url").slice(0, 32);
}

export function verifyUnsubscribe(userId: string, token: string) {
  const a = Buffer.from(unsubscribeToken(userId));
  const b = Buffer.from(token);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function unsubscribeUrl(userId: string, locale: Locale = "ru") {
  return appLink(`/unsubscribe?u=${userId}&t=${unsubscribeToken(userId)}`, locale);
}

function footnote(user: Pick<User, "id" | "locale">) {
  const m = messagesFor(user.locale).mail;
  return `${m.helpFootnote} <a href="${unsubscribeUrl(user.id, user.locale)}" style="color:#7a7068">${m.unsubscribe}</a>`;
}

/** Часы по Алматы: письма уходят с 10 до 20. */
export function isSendingHour(now: Date) {
  const h = Number(new Intl.DateTimeFormat("en-GB", { hour: "numeric", hourCycle: "h23", timeZone: TZ }).format(now));
  return h >= 10 && h < 20;
}

/** Помечает письмо отправленным; false — такое письмо уже было. */
async function claim(userId: string, key: string) {
  const rows = await db.insert(emailLog).values({ userId, key }).onConflictDoNothing().returning({ id: emailLog.id });
  return rows.length > 0;
}

async function logToCrm(userId: string, text: string) {
  await db.insert(crmNotes).values({ clientId: userId, authorId: null, kind: "email", text: `Автописьмо: ${text}` });
}

interface Candidate {
  book: typeof books.$inferSelect;
  user: User;
  answered: number;
  firstEmpty: number | null;
  hasOrder: boolean;
}

async function draftCandidates(): Promise<Candidate[]> {
  const rows = await db
    .select({
      book: books,
      user: users,
      answered: sql<number>`(select count(*)::int from ${bookQuestions} q where q.book_id = ${booksId} and length(trim(q.answer)) > 0)`,
      firstEmpty: sql<number | null>`(select min(q.position) from ${bookQuestions} q where q.book_id = ${booksId} and length(trim(q.answer)) = 0)`,
      hasOrder: sql<boolean>`exists(select 1 from ${orders} o where o.book_id = ${booksId} and o.status <> 'cancelled')`,
    })
    .from(books)
    .innerJoin(users, eq(users.id, books.userId))
    .where(and(eq(books.status, "draft"), eq(users.emailOptOut, false), eq(users.role, "user"), lte(books.createdAt, new Date(Date.now() - DAY))))
    .limit(500);
  return rows;
}

const msg = (u: Pick<User, "locale">) => messagesFor(u.locale);
const hello = (u: User) => msg(u).mail.hello(escapeHtml(u.name));
const bookLink = (c: Candidate) => appLink(`/books/${c.book.id}/questions?q=${(c.firstEmpty ?? 0) + 1}`, c.user.locale);
const previewLink = (c: Candidate) => appLink(`/books/${c.book.id}/preview`, c.user.locale);

type Rule = { key: (c: Candidate) => string; when: (c: Candidate, now: Date) => boolean; send: (c: Candidate, now: Date) => Promise<string> };

const rules: Rule[] = [
  // Дедлайн к празднику — самое важное, проверяем первым.
  {
    key: (c) => `deadline:${c.book.id}:${c.book.occasionDate}`,
    when: (c, now) => {
      if (!c.book.occasionDate || c.hasOrder || !getOccasion(c.book.occasion)) return false;
      const dl = deadlineFor(c.book.occasionDate, now);
      return (dl.state === "soon" || dl.state === "urgent" || dl.state === "premium") && dl.daysToOrder <= 5;
    },
    send: async (c, now) => {
      const o = getOccasion(c.book.occasion)!;
      const dl = deadlineFor(c.book.occasionDate!, now);
      const premiumOnly = dl.state === "premium";
      const by = premiumOnly ? dl.orderByPremium : dl.orderBy;
      const m = msg(c.user);
      const t = m.mail.lifecycle.deadline;
      const occasion = m.common.occasions[o.id];
      // «до 14 февраля» / «14 ақпанға дейін» — предлог и падеж берёт на себя словарь.
      const until = m.common.until(by);
      await sendMail(
        c.user.email,
        t.subject(occasion.label, until),
        emailLayout({
          locale: c.user.locale,
          title: t.title(occasion.until, m.common.inDays(dl.daysToTarget)),
          paragraphs: [
            hello(c.user),
            premiumOnly ? t.premium(escapeHtml(c.book.title), until) : t.normal(escapeHtml(c.book.title), until),
            c.answered >= 10 ? t.ready(c.answered) : t.short,
          ],
          button: { label: c.answered >= 10 ? t.preview : t.continue, url: c.answered >= 10 ? previewLink(c) : bookLink(c) },
          footnote: footnote(c.user),
        }),
      );
      return `напоминание о дедлайне (${messagesFor("ru").common.occasions[o.id].label}, заказать ${messagesFor("ru").common.until(by)})`;
    },
  },
  // Книга почти готова — зовём посмотреть макет и оформить заказ.
  {
    key: (c) => `almost:${c.book.id}`,
    when: (c, now) => !c.hasOrder && c.answered >= ALMOST_READY_ANSWERS && now.getTime() - c.book.updatedAt.getTime() > 2 * DAY,
    send: async (c) => {
      const t = msg(c.user).mail.lifecycle.almost;
      await sendMail(
        c.user.email,
        t.subject(c.book.title),
        emailLayout({
          locale: c.user.locale,
          title: t.title,
          paragraphs: [hello(c.user), t.text(escapeHtml(c.book.title), c.answered), t.next],
          button: { label: t.button, url: previewLink(c) },
          footnote: footnote(c.user),
        }),
      );
      return `книга почти готова (${c.answered} ответов)`;
    },
  },
  // Не начали писать через сутки — три простых совета.
  {
    key: (c) => `start:${c.book.id}`,
    when: (c) => c.answered === 0,
    send: async (c) => {
      const t = msg(c.user).mail.lifecycle.start;
      await sendMail(
        c.user.email,
        t.subject,
        emailLayout({
          locale: c.user.locale,
          title: t.title,
          paragraphs: [hello(c.user), t.intro(escapeHtml(c.book.title)), ...t.tips],
          button: { label: t.button, url: bookLink(c) },
          footnote: footnote(c.user),
        }),
      );
      return "советы, как начать книгу";
    },
  },
  // Начали и бросили — мягкое напоминание (один раз за книгу).
  {
    key: (c) => `nudge:${c.book.id}`,
    when: (c, now) =>
      c.answered > 0 && c.answered < ALMOST_READY_ANSWERS && now.getTime() - c.book.updatedAt.getTime() > 5 * DAY && (!c.user.remindedAt || now.getTime() - c.user.remindedAt.getTime() > 3 * DAY),
    send: async (c) => {
      const t = msg(c.user).mail.lifecycle.nudge;
      await sendMail(
        c.user.email,
        t.subject(c.book.title),
        emailLayout({
          locale: c.user.locale,
          title: t.title,
          paragraphs: [hello(c.user), t.text(c.answered), t.autosave],
          button: { label: t.button, url: bookLink(c) },
          footnote: footnote(c.user),
        }),
      );
      await db.update(users).set({ remindedAt: new Date() }).where(eq(users.id, c.user.id));
      return `напоминание дописать книгу (${c.answered} ответов)`;
    },
  },
];

async function unpaidOrders(now: Date) {
  return db
    .select({ order: orders, user: users })
    .from(orders)
    .innerJoin(users, eq(users.id, orders.userId))
    .where(and(eq(orders.status, "pending_payment"), isNull(orders.paymentClaimedAt), lte(orders.createdAt, new Date(now.getTime() - DAY)), eq(users.emailOptOut, false)))
    .limit(100);
}

async function deliveredOrders(now: Date) {
  return db
    .select({ order: orders, user: users, deliveredAt: orderEvents.createdAt })
    .from(orderEvents)
    .innerJoin(orders, eq(orders.id, orderEvents.orderId))
    .innerJoin(users, eq(users.id, orders.userId))
    .where(and(eq(orderEvents.status, "delivered"), eq(orders.status, "delivered"), lte(orderEvents.createdAt, new Date(now.getTime() - 3 * DAY)), eq(users.emailOptOut, false)))
    .limit(100);
}

/** Один проход планировщика. Возвращает количество отправленных писем. */
export async function runLifecycle(now = new Date(), opts: { ignoreHours?: boolean } = {}) {
  if (!opts.ignoreHours && !isSendingHour(now)) return 0;
  let sent = 0;
  const touched = new Set<string>(); // не больше одного письма клиенту за проход

  for (const c of await draftCandidates()) {
    if (touched.has(c.user.id)) continue;
    for (const rule of rules) {
      if (!rule.when(c, now)) continue;
      if (!(await claim(c.user.id, rule.key(c)))) continue;
      const note = await rule.send(c, now);
      await logToCrm(c.user.id, note);
      touched.add(c.user.id);
      sent++;
      break;
    }
  }

  for (const { order, user } of await unpaidOrders(now)) {
    if (touched.has(user.id) || !(await claim(user.id, `unpaid:${order.id}`))) continue;
    const t = msg(user).mail.lifecycle.unpaid;
    await sendMail(
      order.contactEmail,
      t.subject(order.number),
      emailLayout({
        locale: user.locale,
        title: t.title,
        paragraphs: [hello(user), t.text(order.number, formatPrice(order.amount)), t.help],
        button: { label: t.button, url: appLink(`/orders/${order.id}`, user.locale) },
        footnote: footnote(user),
      }),
    );
    await logToCrm(user.id, `напоминание об оплате заказа №${order.number}`);
    touched.add(user.id);
    sent++;
  }

  for (const { order, user } of await deliveredOrders(now)) {
    if (touched.has(user.id) || !(await claim(user.id, `review:${order.id}`))) continue;
    const t = msg(user).mail.lifecycle.review;
    await sendMail(
      order.contactEmail,
      t.subject,
      emailLayout({
        locale: user.locale,
        title: t.title,
        paragraphs: [hello(user), t.text, t.gift(appLink("/gift", user.locale))],
        button: { label: t.button, url: appLink("/books/new", user.locale) },
        footnote: footnote(user),
      }),
    );
    await logToCrm(user.id, `просьба об отзыве по заказу №${order.number}`);
    touched.add(user.id);
    sent++;
  }
  return sent;
}

export async function unsubscribe(userId: string) {
  await db.update(users).set({ emailOptOut: true }).where(eq(users.id, userId));
}
