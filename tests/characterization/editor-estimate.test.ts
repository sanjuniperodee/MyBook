import { describe, expect, it } from "vitest";
import { editorModel, type EditorBook, type EditorPhoto } from "@/lib/book/editor-model";
import { editorEstimate } from "@/lib/book/editor-estimate";
import { printablePageCount } from "@/lib/book/formats";
import { getInteriorDesign } from "@/lib/book/interiors";
import { estimatePages } from "@/lib/book/layout";
import { fixtureVariants, type FixtureBook } from "../fixtures/books";
import { characterizationBooks, contentOf, pdfContentPages } from "./books";

/**
 * Характеристика оценки объёма в редакторе (editorEstimate, ею считает QuestionsEditor). Она собирает ту же книгу,
 * что PDF (buildBookContent), и считает той же estimatePages — число в редакторе равно оценке кабинета (B3).
 * Снимок — по всем книгам набора и вариантам; таблица с полосами PDF — «так сейчас» (B14).
 */

/** Вход редактора из бандла — как его готовит страница books/[id]/questions. */
function editorInput({ bundle }: FixtureBook) {
  const { book } = bundle;
  const { questions, photos, letters } = editorModel(book, bundle.questions, bundle.photos, bundle.letters);
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
    theme: book.theme,
    authorGender: book.authorGender,
    recipientGender: book.recipientGender,
  };
  return { questions, photos, letters, book: editorBook };
}

const variants = new Set(fixtureVariants().map((v) => v.key));
const books = characterizationBooks().map((fb) => {
  const input = editorInput(fb);
  const { book } = fb.bundle;
  // Группа для таблицы расхождений: у книг группы числа одинаковые. Варианты — по имени.
  const opener = getInteriorDesign(book.interior).opener.photo ? " · фото на начальной полосе" : "";
  const group = variants.has(fb.key) ? fb.key : `${book.format === "a5" ? "A5" : "квадрат"} ${book.language}${opener}`;
  return { key: fb.key, group, editor: editorEstimate(input.book, input.questions, input.photos, input.letters), estimate: estimatePages(contentOf(fb)) };
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

  it("равна estimatePages(buildBookContent) у каждой книги набора: те же полосы и тот же печатный объём (B3)", () => {
    const mismatches = books.filter((b) => b.editor.raw !== b.estimate || b.editor.printed !== printablePageCount(b.estimate)).map((b) => b.key);
    expect(mismatches).toEqual([]);
  });

  it("с полосами PDF там, где они известны (render.test) — так сейчас (B14: в квадрате на полосу больше)", () => {
    const line = (r: Row) => `редактор ${r.editor.raw} · оценка ${r.estimate} · PDF ${pdfContentPages[r.key]}`;
    expect(byGroup(books.filter((b) => b.key in pdfContentPages), line)).toEqual({
      "A5 ru": "редактор 28 · оценка 28 · PDF 28",
      "A5 ru · фото на начальной полосе": "редактор 25 · оценка 25 · PDF 25",
      "квадрат ru": "редактор 31 · оценка 31 · PDF 30",
      "квадрат kk": "редактор 32 · оценка 32 · PDF 31",
    });
  });
});

describe("что редактор берёт в счёт (B3)", () => {
  // Тонкая книга: два коротких ответа, из фото — только обложка; письма близких есть.
  const thin = editorInput(fixtureVariants().find((v) => v.key === "thin")!);
  const count = (photos: EditorPhoto[] = thin.photos, letters = thin.letters) => editorEstimate(thin.book, thin.questions, photos, letters).raw;
  const base = count([], []);

  it("вопрос без текста, но с фото печатается — значит считается", () => {
    // В главе «Как всё начиналось» нет ни одного ответа: снимок в пустом ответе открывает её — начальная полоса и полоса текста.
    const empty = thin.questions.find((q) => q.chapter === "meet")!;
    const photo: EditorPhoto = { id: "photo-in-empty-answer", width: 4000, height: 3000, caption: "", layout: "full", questionId: empty.id, inline: null };
    expect(count([photo], [])).toBe(base + 2);
  });

  it("письма близких — последняя глава книги: начальная полоса и полоса текста", () => {
    expect(thin.letters.length).toBeGreaterThan(0);
    expect(count([], thin.letters)).toBe(base + 2);
  });

  it("пока в книге нечего печатать, счётчик показывает 0", () => {
    const blank = thin.questions.map((q) => ({ ...q, answer: "" }));
    expect(editorEstimate(thin.book, blank, [], [])).toEqual({ raw: 0, printed: 0 });
  });
});
