/**
 * Настоящие книги для сверки паритета (parity.ts --real <каталог>): строки книги, вопросов, глав, фото и одобренных
 * писем одним JSON на книгу, как их отдаёт psql (row_to_json — ключи в snake_case). Тексты клиентов — только в
 * локальном каталоге вне репозитория (tests/visual/out в .gitignore), в коммиты не идут.
 *
 * Снимков клиента здесь нет: каждое фото печатается снимком набора с близкими пропорциями, а его размеры (width,
 * height) и вставка (inline, кадр) — настоящие. На вёрстку влияют только они.
 *
 * Выгрузка книги (только чтение):
 *   psql "$DATABASE_URL" -At -c "set default_transaction_read_only=on;" -c "select json_build_object('book', row_to_json(b),
 *     'questions', coalesce((select json_agg(q order by q.position) from book_questions q where q.book_id=b.id),'[]'),
 *     'chapters', coalesce((select json_agg(c order by c.position) from book_chapters c where c.book_id=b.id),'[]'),
 *     'photos', coalesce((select json_agg(p order by p.position) from photos p where p.book_id=b.id),'[]'),
 *     'letters', coalesce((select json_agg(l) from book_letters l where l.book_id=b.id and l.status='approved'),'[]'))
 *     from books b where b.id='<id>'" > <каталог>/<id>.json
 */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import type { FixtureBook } from "../../tests/fixtures/books";
import { photoKey, photoNames, photoSpecs, thumbKey } from "../../tests/fixtures/photos";

const camel = (key: string) => key.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
/** Ключи строки — как у drizzle (camelCase); значения (в том числе JSON-поля) — как есть. */
const row = <T>(r: Record<string, unknown>): T => Object.fromEntries(Object.entries(r).map(([k, v]) => [camel(k), v])) as T;

/** Снимок набора с пропорциями, ближайшими к фото клиента. */
function nearest(width: number, height: number) {
  const ratio = width / Math.max(1, height);
  return photoNames.reduce((best, name) => {
    const [w, h] = photoSpecs[name];
    return Math.abs(w / h - ratio) < Math.abs(photoSpecs[best][0] / photoSpecs[best][1] - ratio) ? name : best;
  });
}

export function realBooks(dir: string): FixtureBook[] {
  return readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => {
      const raw = JSON.parse(readFileSync(path.join(dir, f), "utf8")) as Record<string, Record<string, unknown>[] & Record<string, unknown>>;
      type Bundle = FixtureBook["bundle"];
      const photos = (raw.photos as Record<string, unknown>[]).map((p) => {
        const r = row<Bundle["photos"][number]>(p);
        const name = nearest(r.width, r.height);
        return { ...r, storageKey: photoKey(name), thumbKey: thumbKey(name) };
      });
      const book = row<Bundle["book"]>(raw.book as unknown as Record<string, unknown>);
      return {
        key: `real-${book.id.slice(0, 8)}`,
        bundle: {
          book,
          questions: (raw.questions as Record<string, unknown>[]).map((q) => row<Bundle["questions"][number]>(q)),
          chapters: (raw.chapters as Record<string, unknown>[]).map((c) => row<Bundle["chapters"][number]>(c)),
          photos,
          letters: (raw.letters as Record<string, unknown>[]).map((l) => row<NonNullable<Bundle["letters"]>[number]>(l)),
        },
      } satisfies FixtureBook;
    });
}
