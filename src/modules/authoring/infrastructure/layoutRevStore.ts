import "server-only";
import { and, asc, eq, gt, sql, type SQL } from "drizzle-orm";
import { bookChapters, bookLetters, bookQuestions, books, photos } from "@/shared/infrastructure/db/schema";
import { executor } from "@/shared/infrastructure/database";
import { PHOTO_OFF_KEY } from "@/lib/book/layout";
import { GALLERY_KEY } from "@/lib/book/toc";
import type { LayoutBundle, LayoutRevStore, PhotoPin } from "../application/layout-rev2";

const isUuid = (v: string) => /^[0-9a-f-]{36}$/i.test(v);

/**
 * Массив PostgreSQL одним параметром (drizzle раскрывает массив в sql`` списком параметров): строки — в кавычках с
 * экранированием, null — NULL, логические — t/f, числа — как есть.
 */
export const pgArray = (values: readonly (string | number | boolean | null)[]) =>
  `{${values.map((v) => (v === null ? "NULL" : typeof v === "boolean" ? (v ? "t" : "f") : typeof v === "number" ? String(v) : `"${v.replace(/["\\]/g, "\\$&")}"`)).join(",")}}`;

/** Места и позиции фото книги одним запросом — без updated_at (по нему отчёты и напоминания: «писала/забросила»). */
export function photoPinsSql(bookId: string, pins: readonly ({ id: string } & PhotoPin)[]): SQL {
  return sql`
    update ${photos} p set chapter = s.chapter, opener = s.opener, position = s.position
    from unnest(${pgArray(pins.map((x) => x.id))}::uuid[], ${pgArray(pins.map((x) => x.chapter))}::text[], ${pgArray(pins.map((x) => x.opener))}::boolean[], ${pgArray(pins.map((x) => x.position))}::int[]) as s(id, chapter, opener, position)
    where p.book_id = ${bookId} and p.id = s.id`;
}

/** Фото книг на правилах 1 на служебных ключах мест: книги на правилах 2 ставят их по выбору автора и в счёт не идут. */
export const reservedKeySql = (): SQL =>
  sql`select count(*)::int as n from ${photos} p join ${books} b on b.id = p.book_id where b.layout_rev = 1 and p.chapter in (${GALLERY_KEY}, ${PHOTO_OFF_KEY})`;

/** Версия правил раскладки книги from → to — сырым SQL: drizzle update() сам поставил бы updated_at ($onUpdate). */
export const layoutRevSql = (bookId: string, from: number, to: number): SQL => sql`update ${books} set layout_rev = ${to} where id = ${bookId} and layout_rev = ${from}`;

/**
 * Хранилище перевода книг на правила раскладки фото 2 (application/layout-rev2.ts): книга со всем для сборки — те же
 * запросы, что queries.bundle, но через текущую транзакцию и с блокировкой; запись — прямым SQL, мимо репозиториев
 * (PhotosService не правит заказанные книги, а save ставит updated_at).
 */
export class DrizzleLayoutRevStore implements LayoutRevStore {
  async load(bookId: string, opts: { lock: boolean }): Promise<LayoutBundle | null> {
    if (!isUuid(bookId)) return null;
    const bookQuery = executor().select().from(books).where(eq(books.id, bookId)).limit(1);
    // «no key update» у книги — как у правок (BookRepository.findById): фото и письма с её id вставляются, не дожидаясь.
    const [book] = opts.lock ? await bookQuery.for("no key update") : await bookQuery;
    if (!book) return null;
    const photoQuery = executor().select().from(photos).where(eq(photos.bookId, bookId)).orderBy(asc(photos.position));
    const rows = opts.lock ? await photoQuery.for("update") : await photoQuery;
    const questions = await executor().select().from(bookQuestions).where(eq(bookQuestions.bookId, bookId)).orderBy(asc(bookQuestions.position));
    const chapters = await executor().select().from(bookChapters).where(eq(bookChapters.bookId, bookId)).orderBy(asc(bookChapters.position), asc(bookChapters.createdAt));
    const letters = await executor()
      .select()
      .from(bookLetters)
      .where(and(eq(bookLetters.bookId, bookId), eq(bookLetters.status, "approved")))
      .orderBy(asc(bookLetters.createdAt));
    return { book, questions, chapters, photos: rows, letters };
  }

  async writePins(bookId: string, pins: readonly ({ id: string } & PhotoPin)[]) {
    if (pins.length) await executor().execute(photoPinsSql(bookId, pins));
  }

  async setLayoutRev(bookId: string, from: number, to: number) {
    const res = await executor().execute(layoutRevSql(bookId, from, to));
    return (res.rowCount ?? 0) > 0;
  }

  async pending(limit: number, afterId: string | null) {
    const rows = await executor()
      .select({ id: books.id })
      .from(books)
      .where(afterId ? and(eq(books.layoutRev, 1), gt(books.id, afterId)) : eq(books.layoutRev, 1))
      .orderBy(asc(books.id))
      .limit(limit);
    return rows.map((r) => r.id);
  }

  async reservedKeyCount() {
    const { rows } = await executor().execute<{ n: number }>(reservedKeySql());
    return Number(rows[0]?.n ?? 0);
  }
}
