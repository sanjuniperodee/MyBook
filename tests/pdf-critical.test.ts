import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { PDFDocument } from "pdf-lib";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { messagesFor } from "@/i18n/messages";
import { mm, print } from "@/lib/book/formats";
import { interiorMetrics, photoPages, type BookContent, type ContentItem, type PhotoItem } from "@/lib/book/layout";
import type { InteriorResult } from "@/modules/production/infrastructure/pdf/render";
import { fixtureBooks, fixtureSample, fixtureVariants, type FixtureBook } from "./fixtures/books";
import { photoNames, useFixtureStorage, variantPhotoNames } from "./fixtures/photos";
import { edgeMax, grayPage, hasTool, textRows, type TextRow } from "./pdf-inspect";

/**
 * Критичное для типографии — по готовому блоку (режим print) книг из набора: кратность тетради, TrimBox и BleedBox,
 * фото «под обрез» до края вылета, ни один заголовок не остаётся последним на полосе, передняя часть; react-pdf ничего
 * не переносит и не отбрасывает молча.
 * По умолчанию каждое оформление один раз, формат и язык по кругу (fixtureSample), и варианты thin, bare, gender,
 * bigphoto (около минуты); PDF_CRITICAL=all — вся матрица (92 книги и варианты, около 4,5 минуты).
 *
 * Требуется poppler (pdftotext, pdftoppm; пакет poppler-utils): без него больше половины проверок не на чем делать,
 * и тест падает сразу. PDF_CRITICAL_ALLOW_SKIP=1 — пропустить проверки по тексту и растру (только локально, не в CI).
 */

const variants = fixtureVariants();
const books: FixtureBook[] = [...(process.env.PDF_CRITICAL === "all" ? fixtureBooks() : fixtureSample()), ...variants];

const missing = (["pdftotext", "pdftoppm"] as const).filter((tool) => !hasTool(tool));
const textless = missing.includes("pdftotext");
const rasterless = textless || missing.includes("pdftoppm");

const dir = mkdtempSync(path.join(tmpdir(), "mybook-pdf-critical-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));
let render: typeof import("@/modules/production/infrastructure/pdf/render");
beforeAll(async () => {
  if (missing.length && process.env.PDF_CRITICAL_ALLOW_SKIP !== "1") {
    throw new Error(`Нет ${missing.join(" и ")} (poppler-utils): без них не проверить текст и растр полос. Поставьте poppler-utils или запустите с PDF_CRITICAL_ALLOW_SKIP=1.`);
  }
  await useFixtureStorage(undefined, [...photoNames, ...variantPhotoNames]);
  render = await import("@/modules/production/infrastructure/pdf/render");
});

interface Rendered {
  file: string;
  res: InteriorResult;
  /** console.warn при сборке: так react-pdf сообщает, что узел не поместился и перенесён (или отброшен). */
  warnings: string[];
  doc: PDFDocument;
  content: BookContent;
  /** Строки полосы набора по полосам (без pdftotext — пусто). */
  pages: TextRow[][];
  /** Номера полос с названием каждой главы. */
  openers: number[][];
}

/** Без регистра и пробелов: pdftotext может разбить строку с разрядкой на куски. */
const norm = (s: string) => s.toLocaleLowerCase("ru").replace(/\s+/g, "");

/** Строки подряд, которые вместе дают ровно эту надпись: номера первой и последней. */
function findRows(rows: TextRow[], text: string): [number, number] | null {
  const target = norm(text);
  for (let i = 0; i < rows.length; i++) {
    let acc = "";
    for (let j = i; j < rows.length && target.startsWith(acc); j++) {
      acc += norm(rows[j].text);
      if (acc === target) return [i, j];
    }
  }
  return null;
}

/** Строки внутри полосы набора: без колонтитула сверху и колонцифры снизу. */
function bodyRows(c: BookContent, pages: TextRow[][]) {
  const m = interiorMetrics[c.format.id];
  const top = mm(print.bleedMm + m.marginTop) - 3;
  const bottom = mm(print.bleedMm + c.format.heightMm - m.marginBottom) + 4;
  return pages.map((rows) => rows.filter((r) => r.top >= top && r.bottom <= bottom));
}

const sheetPt = (c: BookContent) => ({ width: mm(c.format.widthMm + print.bleedMm * 2), height: mm(c.format.heightMm + print.bleedMm * 2) });

/** Полосы, где MediaBox и BleedBox — не весь лист с вылетами или TrimBox — не обрезной формат. */
function wrongBoxes({ doc, content }: Rendered) {
  const sheet = { x: 0, y: 0, ...sheetPt(content) };
  const trim = { x: mm(print.bleedMm), y: mm(print.bleedMm), width: mm(content.format.widthMm), height: mm(content.format.heightMm) };
  const same = (a: typeof sheet, b: typeof sheet) => (["x", "y", "width", "height"] as const).every((k) => Math.abs(a[k] - b[k]) < 0.01);
  return doc.getPages().flatMap((page, i) => {
    const boxes = [["MediaBox", page.getMediaBox(), sheet], ["BleedBox", page.getBleedBox(), sheet], ["TrimBox", page.getTrimBox(), trim]] as const;
    return boxes.flatMap(([name, got, want]) => (same(got, want) ? [] : [`с. ${i + 1}: ${name}`]));
  });
}

/**
 * Полосы (с 0) с фото «под обрез». Фотостраницы главы стоят перед начальной полосой следующей главы,
 * у последней главы — перед галереей или финалом; фото галереи — сразу после её начальной полосы.
 */
function bleedPages({ content: c, pages, openers }: Rendered) {
  const t = messagesFor(c.language).book;
  const find = (text: string) => pages.findIndex((rows) => findRows(rows, text));
  const gallery = c.galleryPhotos.length ? find(t.gallery) : -1;
  const isBleed = (g: PhotoItem[]) => g.length === 1 && g[0].layout === "bleed";
  const result: number[] = [];
  c.chapters.forEach((ch, i) => {
    const groups = photoPages(ch.photos);
    const next = openers[i + 1]?.[0] ?? (gallery >= 0 ? gallery : find(t.theEnd));
    groups.forEach((g, k) => isBleed(g) && result.push(next - groups.length + k));
  });
  photoPages(c.galleryPhotos).forEach((g, k) => isBleed(g) && result.push(gallery + 1 + k));
  return result;
}

/** Заголовки вопросов, которых нет на полосах, и заголовки — последние строки своей полосы. */
function hangingHeadings({ content, pages }: Rendered) {
  const headings = content.chapters.flatMap((ch) => ch.items.flatMap((it) => (it.heading ? [it.heading] : [])));
  const found = new Set<string>();
  const hanging: string[] = [];
  pages.forEach((rows, p) => {
    for (const h of headings) {
      const at = findRows(rows, h);
      if (!at) continue;
      found.add(h);
      if (at[1] === rows.length - 1) hanging.push(`с. ${p + 1}: ${h}`);
    }
  });
  return { missing: headings.filter((h) => !found.has(h)), hanging };
}

/** Начало ответа на полосе: его заголовок или первые слова (перенос в конце строки отброшен). */
const startsWith = (rows: TextRow[], it: ContentItem) =>
  it.heading ? findRows(rows, it.heading)?.[0] === 0 : rows.length > 0 && norm(it.answer).startsWith(norm(rows[0].text).replace(/-$/, ""));

/** Передняя часть по тексту полос (с 0): посвящение, оглавление и начальная полоса первой главы; -1 — нигде. */
function frontMatter({ content: c, pages, openers }: Rendered) {
  const find = (text: string) => (text ? pages.findIndex((rows) => findRows(rows, text)) : -1);
  return { dedication: find(c.dedication), toc: find(messagesFor(c.language).book.toc), opener: openers[0]?.[0] ?? -1 };
}

/** Номера (с 1) добавленных полос, на которых что-то нарисовано. */
const paddingWithContent = ({ doc, res }: Rendered) => doc.getPages().flatMap((p, i) => (i >= res.contentPages && p.node.Contents() ? [i + 1] : []));

async function renderBook(fb: FixtureBook): Promise<Rendered> {
  const file = path.join(dir, `${fb.key}.pdf`);
  const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
  let res: InteriorResult, warnings: string[];
  try {
    res = await render.renderInterior(fb.bundle, "print");
    warnings = warn.mock.calls.map((args) => String(args[0]));
  } finally {
    warn.mockRestore();
  }
  writeFileSync(file, res.pdf);
  const content = render.contentFor(fb.bundle);
  const pages = textless ? [] : bodyRows(content, textRows(file));
  const openers = content.chapters.map((ch) => pages.flatMap((rows, p) => (findRows(rows, ch.title) ? [p] : [])));
  return { file, res, warnings, doc: await PDFDocument.load(res.pdf), content, pages, openers };
}

/** Каждая книга собирается один раз: проверки вариантов берут блок, собранный для describe.each. */
const renders = new Map<string, Promise<Rendered>>();
function rendered(fb: FixtureBook) {
  if (!renders.has(fb.key)) renders.set(fb.key, renderBook(fb));
  return renders.get(fb.key)!;
}

describe.each(books.map((b) => [b.key, b] as const))("блок %s", (_key, fb) => {
  let b: Rendered;
  beforeAll(async () => void (b = await rendered(fb)), 120_000);

  it("полос кратно тетради и не меньше минимума; добавлены только недостающие пустые полосы", () => {
    const least = Math.max(b.res.contentPages, print.minPages);
    expect(b.doc.getPageCount()).toBe(b.res.pageCount);
    expect(b.res.pageCount % print.pageMultiple).toBe(0);
    expect(b.res.pageCount - least).toBeGreaterThanOrEqual(0);
    expect(b.res.pageCount - least).toBeLessThan(print.pageMultiple);
    expect(paddingWithContent(b)).toEqual([]);
  });

  it("react-pdf без предупреждений: ни один узел не перенесён на другую полосу как «не помещается»", () => {
    expect(b.warnings).toEqual([]);
  });

  it("на каждой полосе BleedBox — весь лист с вылетами, TrimBox — обрезной формат", () => {
    expect(wrongBoxes(b)).toEqual([]);
  });

  it.skipIf(rasterless)("фото «под обрез» — на полосе без текста и доходит до края вылета со всех сторон", () => {
    const list = bleedPages(b);
    // Фото «под обрез» есть у всех книг набора, кроме thin (из фото у неё только обложка).
    expect(list.length > 0).toBe(fb.bundle.photos.some((p) => p.layout === "bleed" && !p.questionId));
    // Край растра светлее 250 — бумага: фото не дошло до края.
    const white = (p: number) => Object.entries(edgeMax(grayPage(b.file, p + 1, 24, sheetPt(b.content)))).flatMap(([edge, v]) => (v >= 250 ? [edge] : []));
    expect(list.map((p) => ({ page: p + 1, text: b.pages[p].length, white: white(p) }))).toEqual(list.map((p) => ({ page: p + 1, text: 0, white: [] })));
  });

  it.skipIf(textless)("заголовок вопроса не последний на полосе: под ним на той же полосе есть строка текста", () => {
    // Фото строкой текста не считается: заголовок, за которым на полосе только фото, тоже висит.
    expect(hangingHeadings(b)).toEqual({ missing: [], hanging: [] });
  });

  it.skipIf(textless)("название главы — на своей начальной полосе, следующая полоса начинается с первого вопроса главы", () => {
    const { chapters } = b.content;
    const report = chapters.map((ch, i) => ({ chapter: ch.title, openers: b.openers[i].length, next: b.openers[i].length === 1 && startsWith(b.pages[b.openers[i][0] + 1] ?? [], ch.items[0]) }));
    expect(report).toEqual(chapters.map((ch) => ({ chapter: ch.title, openers: 1, next: true })));
  });

  it.skipIf(textless)("передняя часть: титул, оборот, посвящение и оглавление — если есть, затем начальная полоса первой главы", () => {
    const { dedication, showToc } = fb.bundle.book;
    const hasDedication = !!dedication.trim();
    const next = 2 + Number(hasDedication);
    expect(frontMatter(b)).toEqual({ dedication: hasDedication ? 2 : -1, toc: showToc ? next : -1, opener: next + Number(showToc) });
  });
});

describe("варианты набора: крайние случаи действительно проверены", () => {
  const variant = (key: string) => rendered(variants.find((v) => v.key === key)!);

  it("thin: своих полос меньше минимума — блок добит до print.minPages, добавленные полосы пустые", async () => {
    const b = await variant("thin");
    expect(b.res.contentPages).toBeLessThan(print.minPages - print.pageMultiple);
    expect(b.res.pageCount).toBe(print.minPages);
    // Проверка пустоты различает полосы: последняя своя полоса не пустая.
    expect(b.doc.getPage(b.res.contentPages - 1).node.Contents()).toBeDefined();
    expect(paddingWithContent(b)).toEqual([]);
  });

  it.skipIf(textless)("bare: ни посвящения, ни оглавления — первая глава сразу за оборотом титула", async () => {
    const b = await variant("bare");
    expect(b.content).toMatchObject({ dedication: "", showToc: false });
    expect(frontMatter(b)).toEqual({ dedication: -1, toc: -1, opener: 2 });
  });
});
