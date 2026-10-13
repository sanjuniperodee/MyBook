import { describe, expect, it } from "vitest";
import type { EditorBook, EditorPhoto, EditorQuestion } from "@/components/editor/QuestionsEditor";
import { applyGender } from "@/lib/content/gender";
import { chapterTitle, getTheme } from "@/lib/content/themes";
import { getFormat, printablePageCount, type BookFormat } from "@/lib/book/formats";
import { getInteriorDesign } from "@/lib/book/interiors";
import { estimatePages, type BookContent, type ContentChapter } from "@/lib/book/layout";
import { fixtureVariants, type FixtureBook } from "../fixtures/books";
import { characterizationBooks, contentOf, pdfContentPages } from "./books";

/**
 * Характеристика собственной оценки объёма в редакторе (QuestionsEditor, useMemo pages): содержимое она собирает
 * сама, а не через buildBookContent, и с ним расходится (B3). Снимок — по всем книгам набора и вариантам; таблица
 * расхождений с estimatePages(buildBookContent) и с полосами PDF — «так сейчас».
 */

/** Вход редактора из бандла — копия questions/page.tsx@8ae30f9: заголовки в роде автора и адресата, фото без обложки. */
function editorInput({ bundle }: FixtureBook) {
  const { book } = bundle;
  const theme = getTheme(book.theme, book.language);
  const g = (s: string) => applyGender(s, book.authorGender, book.recipientGender);
  const questions: EditorQuestion[] = bundle.questions.map((r) => ({
    id: r.id,
    chapter: r.chapter,
    chapterTitle: g(chapterTitle(theme, r.chapter, book.language)),
    prompt: g(r.prompt),
    hint: r.hint ? g(r.hint) : null,
    defaultTitle: g(r.title),
    displayText: r.displayText,
    hideHeading: r.hideHeading,
    answer: r.answer,
    isCustom: r.questionKey === "custom",
  }));
  const photos: EditorPhoto[] = bundle.photos
    .filter((p) => p.id !== book.coverPhotoId)
    .map((p) => ({ id: p.id, width: p.width, height: p.height, caption: p.caption, layout: p.layout, questionId: p.questionId, inline: p.inline }));
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
  return { questions, photos, book: editorBook, format: getFormat(editorBook.format) };
}

/**
 * Копия QuestionsEditor.tsx@8ae30f9 (useMemo pages, строки 259–293), удалить в C7 — вынесенная функция должна
 * повторить этот снимок. Тело дословное (с точностью до отступа), добавлена только обёртка в функцию.
 */
function editorEstimate(questions: EditorQuestion[], photos: EditorPhoto[], format: BookFormat, book: EditorBook) {
  const chapters: ContentChapter[] = [];
  for (const x of questions) {
    if (!x.answer.trim()) continue;
    let ch = chapters[chapters.length - 1];
    if (!ch || ch.key !== x.chapter) {
      ch = { key: x.chapter, number: chapters.length + 1, title: x.chapterTitle, items: [], photos: [] };
      chapters.push(ch);
    }
    const inline = photos.filter((p) => p.questionId === x.id).map((p) => ({ ...p, storageKey: "", thumbKey: "" }));
    ch.items.push({ id: x.id, heading: x.hideHeading ? null : (x.displayText ?? x.defaultTitle), answer: x.answer, photos: inline });
  }
  const loose = photos.filter((p) => !p.questionId).map((p) => ({ ...p, storageKey: "", thumbKey: "" }));
  const toGallery = book.photoPlacement === "end" || !chapters.length;
  if (!toGallery) loose.forEach((p, i) => chapters[Math.min(chapters.length - 1, Math.floor((i * chapters.length) / loose.length))].photos.push(p));
  const interior = getInteriorDesign(book.interior);
  // Как в buildBookContent: в оформлениях с фото в начале главы первое фото главы уходит на её начальную полосу.
  if (interior.opener.photo) for (const ch of chapters) ch.openerPhoto = ch.photos.shift();
  const content: BookContent = {
    language: book.language,
    format,
    interior,
    title: book.title,
    subtitle: "",
    authorName: "",
    recipientName: "",
    dedication: book.dedication,
    showToc: book.showToc,
    chapters,
    galleryPhotos: toGallery ? loose : [],
    year: 2000,
  };
  const raw = chapters.length ? estimatePages(content) : 0;
  return { raw, printed: raw ? printablePageCount(raw) : 0 };
}

const variants = new Set(fixtureVariants().map((v) => v.key));
const books = characterizationBooks().map((fb) => {
  const input = editorInput(fb);
  const { book } = fb.bundle;
  // Группа для таблицы расхождений: у книг группы числа одинаковые. Варианты — по имени.
  const opener = getInteriorDesign(book.interior).opener.photo ? " · фото на начальной полосе" : "";
  const group = variants.has(fb.key) ? fb.key : `${book.format === "a5" ? "A5" : "квадрат"} ${book.language}${opener}`;
  return { key: fb.key, group, editor: editorEstimate(input.questions, input.photos, input.format, input.book), estimate: estimatePages(contentOf(fb)) };
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
