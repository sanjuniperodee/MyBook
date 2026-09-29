import "server-only";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { and, eq, isNull, lte, sql } from "drizzle-orm";
import { db } from "./db";
import { bookQuestions, books, crmNotes, emailLog, orderEvents, orders, users, type User } from "./db/schema";
import { env } from "./env";
import { emailLayout, escapeHtml, sendMail } from "./mail";
import { deadlineFor, getOccasion, humanDay, inDays } from "./occasions";
import { formatPrice } from "@/config/site";
import { pluralRu } from "./book/layout";

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

export function unsubscribeUrl(userId: string) {
  return `${env.appUrl}/unsubscribe?u=${userId}&t=${unsubscribeToken(userId)}`;
}

function footnote(user: Pick<User, "id">) {
  return `Если нужна помощь — просто ответьте на это письмо. <a href="${unsubscribeUrl(user.id)}" style="color:#7a7068">Не присылать такие письма</a>`;
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
      answered: sql<number>`(select count(*)::int from ${bookQuestions} q where q.book_id = ${books.id} and length(trim(q.answer)) > 0)`,
      firstEmpty: sql<number | null>`(select min(q.position) from ${bookQuestions} q where q.book_id = ${books.id} and length(trim(q.answer)) = 0)`,
      hasOrder: sql<boolean>`exists(select 1 from ${orders} o where o.book_id = ${books.id} and o.status <> 'cancelled')`,
    })
    .from(books)
    .innerJoin(users, eq(users.id, books.userId))
    .where(and(eq(books.status, "draft"), eq(users.emailOptOut, false), eq(users.role, "user"), lte(books.createdAt, new Date(Date.now() - DAY))))
    .limit(500);
  return rows;
}

const answersText = (n: number) => `${n} ${pluralRu(n, "ответ", "ответа", "ответов")}`;
const hello = (u: User) => `Здравствуйте${u.name ? `, ${escapeHtml(u.name)}` : ""}!`;
const bookLink = (c: Candidate) => `${env.appUrl}/books/${c.book.id}/questions?q=${(c.firstEmpty ?? 0) + 1}`;

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
      await sendMail(
        c.user.email,
        `Чтобы успеть к празднику «${o.label}», закажите книгу до ${humanDay(by)}`,
        emailLayout({
          title: `До ${o.until} ${inDays(dl.daysToTarget)}`,
          paragraphs: [
            hello(c.user),
            premiumOnly
              ? `Обычное производство уже не успевает, но тариф «Премиум» печатается вне очереди — оформите заказ до <b>${humanDay(by)}</b>, и книга «${escapeHtml(c.book.title)}» приедет вовремя.`
              : `Чтобы книга «${escapeHtml(c.book.title)}» приехала вовремя, оформите заказ до <b>${humanDay(by)}</b>. Если не успеваете — тариф «Премиум» печатается вне очереди.`,
            c.answered >= 10 ? `В книге уже ${answersText(c.answered)} — посмотрите макет: возможно, она уже готова.` : "Даже 15–20 коротких ответов складываются в трогательную книгу — это пара вечеров.",
          ],
          button: { label: c.answered >= 10 ? "Посмотреть макет" : "Продолжить книгу", url: c.answered >= 10 ? `${env.appUrl}/books/${c.book.id}/preview` : bookLink(c) },
          footnote: footnote(c.user),
        }),
      );
      return `напоминание о дедлайне (${o.label}, заказать до ${humanDay(by)})`;
    },
  },
  // Книга почти готова — зовём посмотреть макет и оформить заказ.
  {
    key: (c) => `almost:${c.book.id}`,
    when: (c, now) => !c.hasOrder && c.answered >= ALMOST_READY_ANSWERS && now.getTime() - c.book.updatedAt.getTime() > 2 * DAY,
    send: async (c) => {
      await sendMail(
        c.user.email,
        `Книга «${c.book.title}» почти готова`,
        emailLayout({
          title: "Ваша книга почти готова",
          paragraphs: [
            hello(c.user),
            `В книге «${escapeHtml(c.book.title)}» уже ${answersText(c.answered)} — это полноценная книга. Пролистайте макет: страницы свёрстаны так, как их напечатают.`,
            "Если всё нравится — оформите заказ, и через несколько дней книга будет у вас в руках.",
          ],
          button: { label: "Посмотреть макет", url: `${env.appUrl}/books/${c.book.id}/preview` },
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
      await sendMail(
        c.user.email,
        "С чего начать книгу: три совета",
        emailLayout({
          title: "Как начать, если не знаете как",
          paragraphs: [
            hello(c.user),
            `Книга «${escapeHtml(c.book.title)}» ждёт первых строк. Три совета от тех, кто уже написал свою:`,
            "<b>1. Не по порядку.</b> Начните с вопроса, на который ответ приходит сразу — остальные подтянутся.",
            "<b>2. Как подруге за чаем.</b> Не нужно писать красиво — пишите так, как рассказали бы вслух. Можно даже надиктовать голосом.",
            "<b>3. По 10 минут.</b> Два-три ответа в день — и через пару недель книга готова.",
          ],
          button: { label: "Ответить на первый вопрос", url: bookLink(c) },
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
      await sendMail(
        c.user.email,
        `Ваша книга «${c.book.title}» ждёт продолжения`,
        emailLayout({
          title: "Ваша книга ждёт продолжения",
          paragraphs: [
            hello(c.user),
            `В книге уже ${answersText(c.answered)} — хорошее начало. Даже пара ответов за вечер сделает её богаче.`,
            "Все ответы сохраняются автоматически, писать можно и с телефона.",
          ],
          button: { label: "Продолжить книгу", url: bookLink(c) },
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
    await sendMail(
      order.contactEmail,
      `Заказ №${order.number} ждёт оплаты`,
      emailLayout({
        title: "Заказ ждёт оплаты",
        paragraphs: [hello(user), `Заказ №${order.number} на ${formatPrice(order.amount)} оформлен, но ещё не оплачен. Как только оплата поступит, книга уйдёт в печать.`, "Если возникли сложности с оплатой — ответьте на это письмо, поможем."],
        button: { label: "Перейти к оплате", url: `${env.appUrl}/orders/${order.id}` },
        footnote: footnote(user),
      }),
    );
    await logToCrm(user.id, `напоминание об оплате заказа №${order.number}`);
    touched.add(user.id);
    sent++;
  }

  for (const { order, user } of await deliveredOrders(now)) {
    if (touched.has(user.id) || !(await claim(user.id, `review:${order.id}`))) continue;
    await sendMail(
      order.contactEmail,
      "Как вам книга?",
      emailLayout({
        title: "Как вам книга?",
        paragraphs: [
          hello(user),
          "Надеемся, подарок получился особенным. Нам очень важно ваше мнение: расскажите в ответном письме, как прошло вручение, — или пришлите фото книги.",
          `Хотите подарить такую же книгу маме, папе или другу? Для них есть отдельные наборы вопросов, а ещё — <a href="${env.appUrl}/gift" style="color:#7a1f2b">подарочный сертификат</a>, чтобы книгу написали вам.`,
        ],
        button: { label: "Начать новую книгу", url: `${env.appUrl}/books/new` },
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
