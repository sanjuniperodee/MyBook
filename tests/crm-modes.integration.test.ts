import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { db, pool } from "@/shared/infrastructure/db";
import { DrizzleUnitOfWork, InProcessEventBus, OutboxDispatcher } from "@/shared/infrastructure";
import { DrizzleBookRepository, DrizzleChapterRepository } from "@/modules/authoring/infrastructure/persistence";
import { DrizzleAuthoringQueries } from "@/modules/authoring/infrastructure/queries";
import { contentThemes } from "@/modules/authoring/infrastructure/adapters";
import { BooksService, QuestionsService } from "@/modules/authoring/application/services";
import { DrizzleQuestionRepository, DrizzlePhotoRepository } from "@/modules/authoring/infrastructure/persistence";
import type { BookViewer } from "@/modules/authoring/domain";
import { DrizzleLifecycleSource } from "@/modules/notifications/infrastructure/persistence";
import { bookList } from "@/modules/reporting/infrastructure/Books";
import { clientCard } from "@/modules/reporting/infrastructure/ClientCard";
import { dealCard } from "@/modules/reporting/infrastructure/DealCard";
import { dealList } from "@/modules/reporting/infrastructure/Deals";
import { queryClients } from "@/modules/reporting/infrastructure/Clients";
import { search } from "@/modules/reporting/infrastructure/Search";
import { crmAssistantData } from "@/modules/assistant/infrastructure/data";

/**
 * CRM, автописьма и помощник по видам книг на настоящем PostgreSQL: ссылки писем по id раздела, вид книги заказа для
 * письма об отзыве, слова и вид книги в карточках клиента и сделки, доске, списке клиентов, поиске и досье помощника.
 * Запуск: INTEGRATION=1 npx vitest run tests/crm-modes.integration.test.ts (база из DATABASE_URL с миграциями).
 */
const run = process.env.INTEGRATION === "1" ? describe : describe.skip;
const tag = `crm${Date.now()}`;
const silent = { info() {}, warn() {}, error() {} };

run("CRM и автописьма по видам книг (PostgreSQL)", () => {
  const q = async <T extends Record<string, unknown>>(query: ReturnType<typeof sql>) => (await db.execute<T>(query)).rows;
  const uow = new DrizzleUnitOfWork(new OutboxDispatcher(new InProcessEventBus(silent), silent));
  const books = new DrizzleBookRepository();
  const questions = new DrizzleQuestionRepository();
  const chapters = new DrizzleChapterRepository();
  const files = { get: async () => Buffer.alloc(0), put: async () => {}, delete: async () => {}, deletePrefix: async () => {} };
  const ids = { uuid: () => crypto.randomUUID(), inviteToken: () => crypto.randomUUID(), revision: () => "r" };
  const service = new BooksService(books, questions, contentThemes, { bookHasOrders: async () => false }, files, ids, uow, { now: () => new Date() }, chapters);
  const sections = new QuestionsService(books, questions, uow, new DrizzlePhotoRepository(), chapters);
  const queries = new DrizzleAuthoringQueries();
  let viewer: BookViewer;

  const newBook = (theme: string, extra: Record<string, string> = {}) =>
    service.start(viewer.userId, { theme, language: "ru", authorName: "Алия", authorGender: "f", recipientName: "", recipientGender: "m", ...extra });

  beforeAll(async () => {
    const [u] = await q<{ id: string }>(sql`insert into users (email, password_hash, name) values (${tag + "@t.kz"}, 'x', 'Автор') returning id`);
    viewer = { userId: u.id, isStaff: false, staffEdits: false };
  });
  afterAll(async () => {
    await q(sql`delete from orders where user_id = ${viewer.userId}`);
    await q(sql`delete from users where email = ${tag + "@t.kz"}`);
    await pool.end();
  });

  it("ссылка письма: id первого раздела без текста; у заполненной книги — null", async () => {
    const own = await newBook("blank");
    const rows = await queries.questions(own.id);
    expect(rows).toHaveLength(1);
    const lifecycle = new DrizzleLifecycleSource();
    const draftOf = async (bookId: string) => (await lifecycle.draftCandidates(new Date(Date.now() + 60_000))).find((d) => d.recipient.id === viewer.userId && d.book.bookId === bookId)?.book;
    expect((await draftOf(own.id))?.firstEmpty).toBe(rows[0].id);
    expect((await lifecycle.latestDraft(viewer.userId))?.firstEmpty).toBeTruthy();

    // Раздел с одними пробелами — всё ещё пустой; с текстом — книга без пустых разделов, ссылка уходит в корень редактора.
    await sections.edit(own.id, viewer, rows[0].id, { answer: " \n " });
    expect((await draftOf(own.id))?.firstEmpty).toBe(rows[0].id);
    await sections.edit(own.id, viewer, rows[0].id, { answer: "Первое слово и второе" });
    expect((await draftOf(own.id))?.firstEmpty).toBeNull();
    expect((await draftOf(own.id))?.words).toBe(4);

    // У книги с банком — первый вопрос без ответа по позиции.
    const gift = await newBook("mom", { recipientName: "Мама" });
    const giftRows = await queries.questions(gift.id);
    await sections.edit(gift.id, viewer, giftRows[0].id, { answer: "Ответ" });
    expect((await draftOf(gift.id))?.firstEmpty).toBe(giftRows[1].id);
  });

  it("письмо об отзыве знает вид книги заказа", async () => {
    const auto = await newBook("autobiography", { recipientName: "" });
    await q(sql`insert into orders (user_id, book_id, plan, items_amount, amount, currency, status, payment_provider, contact_name, contact_phone, contact_email, paid_at)
      values (${viewer.userId}, ${auto.id}, 'digital', 1000, 1000, 'KZT', 'paid', 'manual', 'Автор', '77010000000', ${tag + "@t.kz"}, now() - interval '30 days')`);
    const due = (await new DrizzleLifecycleSource().reviewDue(new Date(), new Date(Date.now() - 86_400_000))).filter((o) => o.recipient.id === viewer.userId);
    expect(due).toHaveLength(1);
    expect(due[0].theme).toBe("autobiography");
  });

  it("карточки, доска, список клиентов, поиск и досье: вид книги и слова", async () => {
    const own = await newBook("blank", { authorName: "Айгерим" });
    const rows = await queries.questions(own.id);
    await sections.edit(own.id, viewer, rows[0].id, { answer: "раз два три четыре пять" });

    const card = await clientCard(viewer.userId, { deals: false });
    expect(card.bookRows.find((r) => r.book.id === own.id)).toMatchObject({ answered: 1, total: 1, words: 5 });

    const deal = await dealCard({ id: crypto.randomUUID(), clientId: viewer.userId, orderId: null }, { calls: false, chats: false });
    expect(deal.bookRows.find((r) => r.id === own.id)).toMatchObject({ theme: "blank", authorName: "Айгерим", words: 5 });

    const staff = { userId: viewer.userId, seesAll: true };
    const found = await search(own.title, staff, { orders: false, clients: true, deals: false, chats: false });
    expect(found.bookRows.find((b) => b.id === own.id)).toMatchObject({ theme: "blank" });

    const [stage] = await q<{ id: string; pipeline_id: string }>(sql`select id, pipeline_id from crm_stages where kind = 'open' order by position limit 1`);
    const [dealRow] = await q<{ id: string }>(sql`insert into crm_deals (title, source, client_id, stage_id) values ('Своя книга', 'site', ${viewer.userId}, ${stage.id}) returning id`);
    try {
      const board = await dealList(staff, { id: stage.pipeline_id }, {}, [], "board");
      const mine = board.find((d) => d.deal.id === dealRow.id);
      expect(mine?.book).toEqual({ theme: expect.any(String), answered: expect.any(Number), total: expect.any(Number), words: expect.any(Number) });

      const dossier = await crmAssistantData({ get: async () => "" } as never, { list: async () => [] } as never, { messages: async () => [] } as never).dossier(dealRow.id);
      expect(dossier?.books.find((b) => b.title === own.title)).toMatchObject({ theme: "blank", author: "Айгерим", words: 5, recordedBy: "" });
    } finally {
      await q(sql`delete from crm_deals where id = ${dealRow.id}`);
    }

    const clients = await queryClients({ segment: "all", q: tag, limit: 5, offset: 0 });
    expect(clients.rows[0]).toMatchObject({ booksCount: expect.any(Number), bestAnswered: expect.any(Number), bestWords: 5 });

    // «Почти готовы» в списке книг: 3000 слов у своей книги, а не 25 «ответов».
    await sections.edit(own.id, viewer, rows[0].id, { answer: "слово ".repeat(3000) });
    const ready = await bookList("ready", { q: tag, staleDays: 7, now: Date.now(), viewer: { userId: "", seesAll: true } });
    expect(ready.map((r) => r.book.id)).toContain(own.id);
  });
});
