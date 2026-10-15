import { describe, expect, it } from "vitest";
import { editorModel, type EditorBook } from "@/lib/book/editor-model";
import { editorEstimate } from "@/lib/book/editor-estimate";
import { printablePageCount } from "@/lib/book/formats";
import { getInteriorDesign } from "@/lib/book/interiors";
import { estimatePages } from "@/lib/book/layout";
import { fixtureVariants, type FixtureBook } from "../fixtures/books";
import { characterizationBooks, contentOf, pdfContentPages } from "./books";

/**
 * Характеристика оценки объёма в редакторе (editorEstimate, ею считает QuestionsEditor): содержимое она собирает
 * сама, а не через buildBookContent, и с ним расходится (B3). Снимок — по всем книгам набора и вариантам; таблица
 * расхождений с estimatePages(buildBookContent) и с полосами PDF — «так сейчас».
 */

/** Вход редактора из бандла — как его готовит страница books/[id]/questions. */
function editorInput({ bundle }: FixtureBook) {
  const { book } = bundle;
  const { questions, photos } = editorModel(book, bundle.questions, bundle.photos);
  const editorBook: EditorBook = {
    id: book.id,
    format: book.format,
    interior: book.interior,
    dedication: book.dedication,
    showToc: book.showToc,
    photoPlacement: book.photoPlacement,
    title: book.title,
    language: book.language,
    names: [book.authorName, book.recipientName].filter(Boolean),
  };
  return { questions, photos, book: editorBook };
}

const variants = new Set(fixtureVariants().map((v) => v.key));
const books = characterizationBooks().map((fb) => {
  const input = editorInput(fb);
  const { book } = fb.bundle;
  // Группа для таблицы расхождений: у книг группы числа одинаковые. Варианты — по имени.
  const opener = getInteriorDesign(book.interior).opener.photo ? " · фото на начальной полосе" : "";
  const group = variants.has(fb.key) ? fb.key : `${book.format === "a5" ? "A5" : "квадрат"} ${book.language}${opener}`;
  return { key: fb.key, group, editor: editorEstimate(input.questions, input.photos, input.book), estimate: estimatePages(contentOf(fb)) };
});
type Row = (typeof books)[number];

/** Строка на группу; у всех книг группы она должна совпасть — иначе группа не описывает расхождение. */
function byGroup(rows: Row[], line: (r: Row) => string) {
  const out: Record<string, string> = {};
  for (const r of rows) {
    expect(out[r.group] ?? line(r), `${r.key} в группе «${r.group}»`).toBe(line(r));
    out[r.group] = line(r);
  }
  return out;
}

describe("оценка объёма в редакторе (QuestionsEditor)", () => {
  it("полос по оценке редактора → печатный объём, который он показывает", () => {
    expect(Object.fromEntries(books.map((b) => [b.key, `${b.editor.raw} → печать ${b.editor.printed}`]))).toMatchSnapshot();
  });

  it("расходится с estimatePages(buildBookContent) — так сейчас (B3)", () => {
    // −2 у книг с письмами: главы «Письма близких» (начальная полоса и полоса текста) редактор не видит.
    // Ещё −1 в квадрате: ответ только из фото (q7) редактор пропускает вместе с его фото.
    // В A5 с фото на начальной полосе расходится и печатный объём: редактор обещает 24, печать — 28.
    const line = (r: Row) => `редактор ${r.editor.raw} → ${r.editor.printed} · оценка ${r.estimate} → ${printablePageCount(r.estimate)}`;
    expect(byGroup(books, line)).toEqual({
      "A5 ru": "редактор 26 → 28 · оценка 28 → 28",
      "A5 kk": "редактор 26 → 28 · оценка 28 → 28",
      "A5 ru · фото на начальной полосе": "редактор 23 → 24 · оценка 25 → 28",
      "A5 kk · фото на начальной полосе": "редактор 23 → 24 · оценка 25 → 28",
      "квадрат ru": "редактор 28 → 28 · оценка 31 → 32",
      "квадрат ru · фото на начальной полосе": "редактор 25 → 28 · оценка 28 → 28",
      "квадрат kk": "редактор 29 → 32 · оценка 32 → 32",
      "квадрат kk · фото на начальной полосе": "редактор 29 → 32 · оценка 32 → 32",
      thin: "редактор 9 → 24 · оценка 11 → 24",
      bare: "редактор 27 → 28 · оценка 28 → 28",
      gender: "редактор 26 → 28 · оценка 28 → 28",
      bigphoto: "редактор 26 → 28 · оценка 28 → 28",
    });
  });

  it("и с полосами PDF там, где они известны (render.test) — так сейчас (B3)", () => {
    const line = (r: Row) => `редактор ${r.editor.raw} · оценка ${r.estimate} · PDF ${pdfContentPages[r.key]}`;
    expect(byGroup(books.filter((b) => b.key in pdfContentPages), line)).toEqual({
      "A5 ru": "редактор 26 · оценка 28 · PDF 28",
      "A5 ru · фото на начальной полосе": "редактор 23 · оценка 25 · PDF 25",
      "квадрат ru": "редактор 28 · оценка 31 · PDF 30",
      "квадрат kk": "редактор 29 · оценка 32 · PDF 31",
    });
  });
});
