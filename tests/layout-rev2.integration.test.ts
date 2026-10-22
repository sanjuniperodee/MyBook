import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { db, pool } from "@/shared/infrastructure/db";
import { DrizzleUnitOfWork, InProcessEventBus, OutboxDispatcher } from "@/shared/infrastructure";
import { DrizzleLayoutRevStore, layoutRevSql, pgArray, photoPinsSql, reservedKeySql } from "@/modules/authoring/infrastructure/layoutRevStore";
import { LayoutRev2Service, type LayoutRevBackupBook } from "@/modules/authoring/application/layout-rev2";

/**
 * Запись перевода на правила раскладки фото 2 прямым SQL: места и позиции фото и books.layout_rev меняются одной
 * транзакцией, updated_at книги и фото — нет (по нему отчёты «писала/забросила»); откат из копии возвращает всё.
 * Запуск SQL на базе: INTEGRATION=1 npx vitest run tests/layout-rev2.integration.test.ts (база из DATABASE_URL с миграциями).
 */
describe("запись перевода: вид SQL", () => {
  const dialect = new PgDialect();

  it("массив одним параметром: строки в кавычках, NULL, t/f, числа", () => {
    expect(pgArray(["a", null, 'x"y\\z'])).toBe('{"a",NULL,"x\\"y\\\\z"}');
    expect(pgArray([true, false])).toBe("{t,f}");
    expect(pgArray([0, 12])).toBe("{0,12}");
  });

  it("места фото — один update по книге, без updated_at; версия — только с прежней", () => {
    const pins = dialect.sqlToQuery(photoPinsSql("b1", [{ id: "p1", chapter: null, opener: false, position: 3 }, { id: "p2", chapter: "__gallery", opener: false, position: 0 }]));
    expect(pins.sql).toMatch(/^\s*update "photos" p set chapter = s\.chapter, opener = s\.opener, position = s\.position\s+from unnest\(\$1::uuid\[\], \$2::text\[\], \$3::boolean\[\], \$4::int\[\]\)/);
    expect(pins.sql).toContain("where p.book_id = $5 and p.id = s.id");
    expect(pins.sql).not.toContain("updated_at");
    expect(pins.params).toEqual(['{"p1","p2"}', '{NULL,"__gallery"}', "{f,f}", "{3,0}", "b1"]);
    const rev = dialect.sqlToQuery(layoutRevSql("b1", 1, 2));
    expect(rev.sql).toBe('update "books" set layout_rev = $1 where id = $2 and layout_rev = $3');
    expect(rev.params).toEqual([2, "b1", 1]);
  });

  it("служебные ключи мест считаются только у книг на правилах 1: на правилах 2 это выбор автора", () => {
    const q = dialect.sqlToQuery(reservedKeySql());
    expect(q.sql).toBe('select count(*)::int as n from "photos" p join "books" b on b.id = p.book_id where b.layout_rev = 1 and p.chapter in ($1, $2)');
    expect(q.params).toEqual(["__gallery", "__off"]);
  });
});

const run = process.env.INTEGRATION === "1" ? describe : describe.skip;
const tag = `lr2${Date.now()}`;
const silent = { info() {}, warn() {}, error() {} };

run("перевод книги на PostgreSQL", () => {
  const q = async <T extends Record<string, unknown>>(query: ReturnType<typeof sql>) => (await db.execute<T>(query)).rows;
  const service = new LayoutRev2Service(new DrizzleLayoutRevStore(), new DrizzleUnitOfWork(new OutboxDispatcher(new InProcessEventBus(silent), silent)), true);
  const past = new Date("2026-01-01T00:00:00Z");
  let bookId = "";
  const state = async () => ({
    book: (await q<{ layout_rev: number; updated_at: Date }>(sql`select layout_rev, updated_at from books where id = ${bookId}`))[0],
    photos: await q<{ storage_key: string; chapter: string | null; opener: boolean; position: number; updated_at: Date }>(sql`select storage_key, chapter, opener, position, updated_at from photos where book_id = ${bookId} order by storage_key`),
  });

  beforeAll(async () => {
    const [u] = await q<{ id: string }>(sql`insert into users (email, password_hash, name) values (${tag + "@t.kz"}, 'x', 'Автор') returning id`);
    // Своя книга в оформлении с фото главы: две главы с текстом, четыре фото без мест (по два на главу, первое — на начальной полосе).
    const [b] = await q<{ id: string }>(sql`insert into books (user_id, theme, interior, title, updated_at) values (${u.id}, 'blank', 'photobook', 'Перевод', ${past}) returning id`);
    bookId = b.id;
    await q(sql`insert into book_chapters (book_id, key, position, title) values (${bookId}, 'a', 0, 'Первая'), (${bookId}, 'b', 1, 'Вторая')`);
    await q(sql`insert into book_questions (book_id, position, chapter, question_key, prompt, title, answer) values (${bookId}, 0, 'a', 'custom', '', 'Раз', 'Текст.'), (${bookId}, 1, 'b', 'custom', '', 'Два', 'Текст.')`);
    for (const i of [0, 1, 2, 3]) await q(sql`insert into photos (book_id, position, storage_key, thumb_key, width, height, updated_at) values (${bookId}, ${i}, ${`p${i}`}, ${`p${i}t`}, 1600, 1200, ${past})`);
  });
  afterAll(async () => {
    await q(sql`delete from users where email = ${tag + "@t.kz"}`);
    await pool.end();
  });

  it("пробный проход ничего не пишет; --apply ставит места и версию одной транзакцией, updated_at не трогает; откат возвращает всё", async () => {
    const before = await state();
    expect(before.book.layout_rev).toBe(1);
    expect(await service.pending(100_000)).toContain(bookId);

    expect(await service.migrate(bookId, { apply: false })).toMatchObject({ applied: false, plan: { ok: true, plan: "A" } });
    expect(await state()).toEqual(before);

    const saved: LayoutRevBackupBook[] = [];
    expect(await service.migrate(bookId, { apply: true, backup: (rows) => void saved.push(rows) })).toMatchObject({ applied: true });
    const after = await state();
    expect(after.book).toEqual({ layout_rev: 2, updated_at: before.book.updated_at });
    expect(after.photos.map((p) => [p.storage_key, p.chapter, p.opener, p.position])).toEqual([
      ["p0", "a", true, 0],
      ["p1", null, false, 1],
      ["p2", "b", true, 2],
      ["p3", null, false, 3],
    ]);
    expect(after.photos.map((p) => p.updated_at)).toEqual(before.photos.map((p) => p.updated_at));
    expect(await service.pending(100_000)).not.toContain(bookId);
    expect(await service.migrate(bookId, { apply: true })).toEqual({ bookId, skipped: "done" });

    expect(await service.restore(saved[0], { apply: true })).toBe("restored");
    expect(await state()).toEqual(before);
  });

  it("фото на служебных ключах мест считаются только у книг на правилах 1", async () => {
    const n = await service.reservedKeyCount();
    await q(sql`update photos set chapter = '__off' where book_id = ${bookId} and storage_key = 'p3'`);
    expect(await service.reservedKeyCount()).toBe(n + 1);
    await q(sql`update books set layout_rev = 2 where id = ${bookId}`);
    expect(await service.reservedKeyCount()).toBe(n);
    await q(sql`update books set layout_rev = 1 where id = ${bookId}`);
    await q(sql`update photos set chapter = null where book_id = ${bookId} and storage_key = 'p3'`);
  });
});
