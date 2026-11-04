/**
 * Детерминированный seed для визуальных тестов.
 *
 * Запускается на отдельной БД (`TEST_DATABASE_URL`/`DATABASE_URL`), полностью очищает public-схему
 * и создаёт минимальный, но показательный набор: клиент с книгой и ответами, заказ, сделка,
 * переписка, отзыв, задача и заметка. Даты фиксированы.
 *
 * Запуск:
 *   TEST_DATABASE_URL=postgres://... npx tsx --import ./scripts/preload.mjs scripts/visual/seed.ts
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { db, pool } from "@/shared/infrastructure/db";
import * as t from "@/shared/infrastructure/db/schema";
import { DrizzleUnitOfWork, InProcessEventBus, OutboxDispatcher } from "@/shared/infrastructure";
import { BooksService } from "@/modules/authoring/application/services";
import { contentThemes } from "@/modules/authoring/infrastructure/adapters";
import { DrizzleBookRepository, DrizzleChapterRepository, DrizzleQuestionRepository } from "@/modules/authoring/infrastructure/persistence";

const PASSWORD = "visual-pass-123";
const NOW = new Date("2026-11-05T10:00:00+05:00");
const USER_CREATED = new Date("2026-10-25T09:00:00+05:00");
const BOOK_CREATED = new Date("2026-10-26T09:00:00+05:00");
const ORDER_CREATED = new Date("2026-10-27T09:00:00+05:00");
const PAID = new Date("2026-10-28T12:00:00+05:00");
const SILENT = { info() {}, warn() {}, error() {} };

async function reset() {
  const { rows } = await pool.query<{ tablename: string }>(
    "select tablename from pg_tables where schemaname = 'public' and tablename not like '__drizzle%'",
  );
  if (!rows.length) throw new Error("В базе нет таблиц — примените миграции");
  await pool.query(`truncate table ${rows.map((r) => `"${r.tablename}"`).join(", ")} restart identity cascade`);
}

async function main() {
  if (!process.env.DATABASE_URL && !process.env.TEST_DATABASE_URL) {
    throw new Error("Нужен DATABASE_URL или TEST_DATABASE_URL тестовой базы");
  }
  if (process.env.DATABASE_URL && !/test|visual/i.test(process.env.DATABASE_URL)) {
    throw new Error(`DATABASE_URL не похож на тестовую базу: ${process.env.DATABASE_URL}. Остановлено.`);
  }
  await reset();

  const passwordHash = await bcrypt.hash(PASSWORD, 10);
  const [admin] = await db
    .insert(t.users)
    .values({
      email: "admin@visual.local",
      passwordHash,
      name: "Айгуль Менеджер",
      role: "admin",
      locale: "ru",
      createdAt: USER_CREATED,
      updatedAt: USER_CREATED,
    })
    .returning({ id: t.users.id });

  const [client] = await db
    .insert(t.users)
    .values({
      email: "client@visual.local",
      passwordHash,
      name: "Алия Сапарова",
      phone: "+7 700 123 45 67",
      role: "user",
      locale: "ru",
      createdAt: USER_CREATED,
      updatedAt: USER_CREATED,
    })
    .returning({ id: t.users.id });

  const uow = new DrizzleUnitOfWork(new OutboxDispatcher(new InProcessEventBus(SILENT), SILENT));
  const books = new DrizzleBookRepository();
  const questions = new DrizzleQuestionRepository();
  const chapters = new DrizzleChapterRepository();
  const files = { get: async () => Buffer.alloc(0), put: async () => {}, delete: async () => {}, deletePrefix: async () => {} };
  const ids = { uuid: () => crypto.randomUUID(), inviteToken: () => crypto.randomUUID(), revision: () => "r1" };
  const service = new BooksService(
    books,
    questions,
    contentThemes,
    { bookHasOrders: async () => false },
    files,
    ids,
    uow,
    { now: () => NOW },
    chapters,
  );

  const book = await service.start(client.id, {
    theme: "love",
    language: "ru",
    authorName: "Алия",
    authorGender: "f",
    recipientName: "Марғұлан",
    recipientGender: "m",
    title: "История нашей любви",
    occasion: "anniversary",
    occasionDate: "2026-12-20",
  });

  await db
    .update(t.books)
    .set({
      title: "История нашей любви",
      subtitle: "О том, как всё началось",
      dedication: "Марғұлану — с любовью, которой уже десять лет.",
      coverTemplate: "peony",
      interior: "romance",
      inviteToken: "visual-invite-token",
      createdAt: BOOK_CREATED,
      updatedAt: BOOK_CREATED,
    })
    .where(eq(t.books.id, book.id));

  const bookQuestions = await db.select().from(t.bookQuestions).where(eq(t.bookQuestions.bookId, book.id)).orderBy(t.bookQuestions.position);
  const answers = [
    "Мы познакомились в кофейне на Абая в первый снег. Я опаздывала, а ты держал дверь и улыбался так, будто ждал именно меня.",
    "Ты показался мне очень серьёзным — пока не рассказал про кота, который живёт у тебя на балконе. С тех пор я знала: с тобой будет тепло.",
    "Первое свидание было в том же кофейне. Мы просидели четыре часа, а официант уже давно перестал к нам подходить.",
  ];
  for (let i = 0; i < Math.min(answers.length, bookQuestions.length); i++) {
    await db.update(t.bookQuestions).set({ answer: answers[i], updatedAt: BOOK_CREATED }).where(eq(t.bookQuestions.id, bookQuestions[i].id));
  }

  const [order] = await db
    .insert(t.orders)
    .values({
      userId: client.id,
      bookId: book.id,
      plan: "hardcover",
      quantity: 1,
      itemsAmount: 30000,
      amount: 30000,
      currency: "KZT",
      status: "in_production",
      paymentProvider: "manual",
      contactName: "Алия Сапарова",
      contactPhone: "+7 700 123 45 67",
      contactEmail: "client@visual.local",
      deliveryMethod: "courier",
      city: "Алматы",
      address: "ул. Абая, 10, кв. 5",
      desiredDate: "2026-12-20",
      giftNote: "С нашей годовщиной. Я люблю тебя.",
      assigneeId: admin.id,
      paidAt: PAID,
      receivedAmount: 30000,
      createdAt: ORDER_CREATED,
      updatedAt: PAID,
    })
    .returning({ id: t.orders.id, number: t.orders.number });

  await db.insert(t.orderPayments).values({
    orderId: order.id,
    amount: 30000,
    method: "manual",
    paidAt: PAID,
    note: "Перевод на Kaspi",
    createdById: admin.id,
    createdAt: PAID,
  });
  await db.insert(t.orderEvents).values([
    { orderId: order.id, status: "pending_payment", actor: "client", createdAt: ORDER_CREATED },
    { orderId: order.id, status: "paid", actor: "admin", createdAt: PAID },
    { orderId: order.id, status: "in_production", actor: "admin", createdAt: new Date("2026-10-29T09:00:00+05:00") },
  ]);

  const [pipeline] = await db
    .insert(t.crmPipelines)
    .values({ name: "Продажи", position: 0, createdAt: BOOK_CREATED, updatedAt: BOOK_CREATED })
    .returning({ id: t.crmPipelines.id });
  const [newStage] = await db
    .insert(t.crmStages)
    .values({ pipelineId: pipeline.id, name: "Новая заявка", color: "#9a8f86", position: 0, kind: "open", createdAt: BOOK_CREATED, updatedAt: BOOK_CREATED })
    .returning({ id: t.crmStages.id });
  const [paidStage] = await db
    .insert(t.crmStages)
    .values({ pipelineId: pipeline.id, name: "Оплачено", color: "#3f7d5a", position: 1, kind: "won", createdAt: BOOK_CREATED, updatedAt: BOOK_CREATED })
    .returning({ id: t.crmStages.id });

  const [deal] = await db
    .insert(t.crmDeals)
    .values({
      title: "Книга для Марғұлана",
      stageId: paidStage.id,
      amount: 30000,
      clientId: client.id,
      contactName: "Алия Сапарова",
      contactPhone: "+7 700 123 45 67",
      contactEmail: "client@visual.local",
      source: "site",
      assigneeId: admin.id,
      assignedAt: PAID,
      orderId: order.id,
      createdById: client.id,
      stageChangedAt: PAID,
      createdAt: ORDER_CREATED,
      updatedAt: PAID,
    })
    .returning({ id: t.crmDeals.id, number: t.crmDeals.number });

  await db.insert(t.crmNotes).values({
    clientId: client.id,
    dealId: deal.id,
    orderId: order.id,
    authorId: admin.id,
    kind: "note",
    text: "Клиент просил успеть к годовщине 20 декабря. Обсудили доставку курьером.",
    createdAt: new Date("2026-10-29T10:00:00+05:00"),
  });

  await db.insert(t.crmTasks).values({
    title: "Позвонить Алие и подтвердить адрес доставки",
    dueAt: new Date("2026-11-06T12:00:00+05:00"),
    clientId: client.id,
    orderId: order.id,
    dealId: deal.id,
    kind: "call",
    assigneeId: admin.id,
    createdById: admin.id,
    createdAt: new Date("2026-10-29T10:00:00+05:00"),
  });

  const [conversation] = await db
    .insert(t.crmConversations)
    .values({
      channel: "whatsapp",
      channelId: "visual",
      chatId: "77001234567",
      contactName: "Алия Сапарова",
      clientId: client.id,
      dealId: deal.id,
      assigneeId: admin.id,
      status: "open",
      unread: 1,
      lastMessageAt: new Date("2026-11-04T18:20:00+05:00"),
      lastMessageText: "Спасибо! А когда книгу отправят?",
      awaitingSince: new Date("2026-11-04T18:20:00+05:00"),
      createdAt: BOOK_CREATED,
      updatedAt: new Date("2026-11-04T18:20:00+05:00"),
    })
    .returning({ id: t.crmConversations.id });

  await db.insert(t.crmMessages).values([
    {
      conversationId: conversation.id,
      direction: "in",
      type: "text",
      text: "Здравствуйте! Хотела уточнить, успеваем ли мы к 20 декабря?",
      status: "received",
      createdAt: new Date("2026-11-04T18:10:00+05:00"),
    },
    {
      conversationId: conversation.id,
      direction: "out",
      authorId: admin.id,
      type: "text",
      text: "Здравствуйте, Алия! Да, успеваем. Книга уже в производстве, отправим курьером 15 декабря.",
      status: "read",
      createdAt: new Date("2026-11-04T18:15:00+05:00"),
    },
    {
      conversationId: conversation.id,
      direction: "in",
      type: "text",
      text: "Спасибо! А когда книгу отправят?",
      status: "received",
      createdAt: new Date("2026-11-04T18:20:00+05:00"),
    },
  ]);

  await db.insert(t.reviews).values({
    orderId: order.id,
    userId: client.id,
    rating: 5,
    text: "Книга получилась волшебной. Мы читали её вдвоём и плакали. Спасибо за вашу работу!",
    authorName: "Алия",
    city: "Алматы",
    consent: true,
    status: "published",
    featured: true,
    locale: "ru",
    theme: "love",
    publishedAt: new Date("2026-11-01T12:00:00+05:00"),
    createdAt: new Date("2026-11-01T12:00:00+05:00"),
    updatedAt: new Date("2026-11-01T12:00:00+05:00"),
  });

  const seed = {
    generatedAt: NOW.toISOString(),
    adminId: admin.id,
    clientId: client.id,
    adminEmail: "admin@visual.local",
    clientEmail: "client@visual.local",
    password: PASSWORD,
    bookId: book.id,
    orderId: order.id,
    orderNumber: order.number,
    dealId: deal.id,
    dealNumber: deal.number,
    pipelineId: pipeline.id,
    newStageId: newStage.id,
    paidStageId: paidStage.id,
    conversationId: conversation.id,
  };
  mkdirSync(path.join(process.cwd(), "tests/visual"), { recursive: true });
  writeFileSync(path.join(process.cwd(), "tests/visual/.seed.json"), `${JSON.stringify(seed, null, 2)}\n`);
  console.log(JSON.stringify(seed, null, 2));
  await pool.end();
}

main().catch(async (err) => {
  console.error(err);
  await pool.end().catch(() => {});
  process.exitCode = 1;
});
