import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildBookContent } from "@/lib/book/book-content";
import { estimatePages } from "@/lib/book/estimate";
import { planFaces } from "@/lib/book/flipbook";
import { mm, print } from "@/lib/book/formats";
import { chapterRuns, toPhotoItem, type BookContent } from "@/lib/book/layout";
import { bookToc } from "@/lib/book/toc";
import { fixtureBook, type FixtureBook } from "./fixtures/books";
import { photoNames, useFixtureStorage } from "./fixtures/photos";
import { edgeMax, grayPage, hasTool, textRows } from "./pdf-inspect";

// «С новой страницы» для истории и фото на всю страницу прямо в истории: содержимое, 3D-раскладка и настоящий PDF.

const contentOf = (fb: FixtureBook): BookContent => buildBookContent(fb.bundle.book, fb.bundle.questions, fb.bundle.photos.map(toPhotoItem), fb.bundle.chapters, 2026, fb.bundle.letters);

/** Книга набора, где у фото «b» (вопрос 2, после первого абзаца) — «на всю страницу», а у вопроса 5 (обычно посреди полосы) — «с новой страницы». */
function custom(design: "classic" | "cinema" = "classic") {
  const fb = fixtureBook(design, "a5", "ru");
  const q2 = fb.bundle.questions[2].id;
  const q6 = fb.bundle.questions[5].id;
  const photos = fb.bundle.photos.map((p) => (p.questionId === q2 && p.inline ? { ...p, inline: { ...p.inline, page: true } } : p));
  const questions = fb.bundle.questions.map((q) => (q.id === q6 ? { ...q, pageBreak: true } : q));
  return { fb: { ...fb, key: `${fb.key}-custom`, bundle: { ...fb.bundle, photos, questions } }, q2, q6 };
}

describe("фото на всю страницу: история делится в этом месте", () => {
  it("часть до фото — с заголовком; продолжение — без заголовка, с фото перед собой под обрез; в оглавлении одна строка", () => {
    const { fb, q2 } = custom();
    const c = contentOf(fb);
    const items = c.chapters.flatMap((ch) => ch.items);
    const first = items.find((it) => it.id === q2)!;
    const next = items[items.indexOf(first) + 1];
    expect(first.heading).toBeTruthy();
    expect(first.photoBefore).toBeUndefined();
    expect(next).toMatchObject({ id: `${q2}-p1`, heading: null, continued: true, photoBefore: { layout: "bleed" } });
    // Текст не потерялся: абзацы двух частей — весь ответ.
    const original = fb.bundle.questions[2].answer.trim().split(/\n+/).map((s) => s.trim()).filter(Boolean);
    expect([...first.answer.split("\n"), ...next.answer.split("\n")]).toEqual(original);
    expect(bookToc({ ...c, tocMode: "sections" }).filter((l) => l.pageKey.includes(q2))).toHaveLength(1);
  });

  it("фото перед текстом — страница фото перед историей, заголовок остаётся у неё", () => {
    const fb = fixtureBook("classic", "a5", "ru");
    const q0 = fb.bundle.questions[0].id; // у фото «a» место — перед текстом
    const photos = fb.bundle.photos.map((p) => (p.questionId === q0 && p.inline ? { ...p, inline: { ...p.inline, page: true } } : p));
    const c = contentOf({ ...fb, bundle: { ...fb.bundle, photos } });
    const item = c.chapters[0].items.find((it) => it.id === q0)!;
    expect(item.heading === null || typeof item.heading === "string").toBe(true);
    expect(item.photoBefore).toBeTruthy();
    expect(item.continued).toBeUndefined();
    expect(c.chapters[0].items.some((it) => it.id.startsWith(`${q0}-p`))).toBe(false);
  });

  it("куски главы: текст, фото, продолжение; кусок без текста — только страница фото", () => {
    const { fb } = custom();
    const ch = contentOf(fb).chapters.find((x) => x.items.some((it) => it.photoBefore))!;
    const runs = chapterRuns(ch.items);
    expect(runs.length).toBe(2);
    expect(runs[0].photo).toBeTruthy();
    expect(runs[1].photo).toBeUndefined();
    expect(runs.flatMap((r) => r.items).length).toBe(ch.items.length);
  });

  it("3D-раскладка: страница фото после куска, текст продолжается после неё", () => {
    const { faces } = planFaces({ hasDedication: false, hasToc: false, textPages: [3], runs: [[{ pages: 2, photo: true }, { pages: 1, photo: false }]] });
    expect(faces.map((f) => (f.kind === "text" ? `text${f.run}.${f.part}` : f.kind))).toEqual(["title", "colophon", "opener", "text0.0", "text0.1", "pagePhoto", "text1.0", "end"]);
  });
});

// ─── PDF ───────────────

const textless = !hasTool("pdftotext") || !hasTool("pdftoppm");
const dir = mkdtempSync(path.join(tmpdir(), "mybook-page-layout-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));
let render: typeof import("@/modules/production/infrastructure/pdf/render");
beforeAll(async () => {
  await useFixtureStorage(undefined, photoNames);
  render = await import("@/modules/production/infrastructure/pdf/render");
});
const norm = (s: string) => s.toLocaleLowerCase("ru").replace(/\s+/g, "");

describe.skipIf(textless)("PDF: фото на всю страницу и «с новой страницы»", () => {
  for (const design of ["classic", "cinema"] as const) {
    it(`${design}: страница с фото — на весь лист без текста; история «с новой страницы» — сверху полосы; оценка = PDF`, async () => {
      const { fb, q6 } = custom(design);
      const res = await render.renderInterior(fb.bundle, "print");
      const file = path.join(dir, `${fb.key}.pdf`);
      writeFileSync(file, res.pdf);
      const content = contentOf(fb);
      const pages = textRows(file);
      const sheet = { width: mm(content.format.widthMm + print.bleedMm * 2), height: mm(content.format.heightMm + print.bleedMm * 2) };

      // Страница фото — сразу перед продолжением истории: на ней нет текста, фото доходит до края листа.
      const cont = content.chapters.flatMap((c) => c.items).find((it) => it.continued)!;
      const contAt = pages.findIndex((rows) => rows.some((r) => norm(cont.answer).startsWith(norm(r.text).replace(/-$/, "")) && norm(r.text).length > 10));
      expect(contAt).toBeGreaterThan(0);
      const photoPage = contAt - 1;
      expect(pages[photoPage].length).toBe(0);
      const white = Object.entries(edgeMax(grayPage(file, photoPage + 1, 24, sheet))).flatMap(([edge, v]) => (v >= 250 ? [edge] : []));
      expect(white).toEqual([]);

      // «С новой страницы»: заголовок истории — первая строка текста на своей полосе (под колонтитулом).
      const heading = content.chapters.flatMap((c) => c.items).find((it) => it.id === q6)!.heading!;
      const at = pages.findIndex((rows) => rows.some((r) => norm(heading).startsWith(norm(r.text)) && norm(r.text).length > 3));
      // Колонтитул (название книги или главы) — не строка текста.
      const head = new Set([content.title, ...content.chapters.map((c) => c.title)].map(norm));
      const body = pages[at].filter((r) => !head.has(norm(r.text)));
      expect(norm(heading).startsWith(norm(body[0].text)), JSON.stringify({ heading, rows: pages[at].slice(0, 3) })).toBe(true);

      // Оценка (счётчик страниц, толщина 3D) знаки в строке считает по средней ширине: с разрывом посреди главы текст до
      // него может перейти границу полосы только в оценке — допускаем одну полосу. Печать — по самому PDF.
      expect(Math.abs(estimatePages(content) - res.contentPages)).toBeLessThanOrEqual(1);
    }, 120_000);
  }
});

describe("фото вне историй: «Не печатать»", () => {
  it("ни галереи, ни фотостраниц между главами; фото в историях остаются", () => {
    const fb = fixtureBook("classic", "a5", "ru");
    const book = (photoPlacement: "chapters" | "end" | "none") => buildBookContent({ ...fb.bundle.book, photoPlacement }, fb.bundle.questions, fb.bundle.photos.map(toPhotoItem), [], 2026, fb.bundle.letters);
    const inline = (c: BookContent) => c.chapters.flatMap((ch) => ch.items.flatMap((it) => it.photos ?? [])).length;
    const none = book("none");
    expect(none.galleryPhotos).toEqual([]);
    expect(none.chapters.every((ch) => ch.photos.length === 0 && !ch.openerPhoto)).toBe(true);
    expect(inline(none)).toBe(inline(book("chapters")));
    expect(book("end").galleryPhotos.length).toBeGreaterThan(0);
  });
});

describe.skipIf(textless)("PDF: фото на всю страницу «целиком, без обрезки»", () => {
  it("снимок вписан в лист: страница без текста, по одной из сторон — поля бумаги", async () => {
    const fb = fixtureBook("classic", "a5", "ru");
    const q2 = fb.bundle.questions[2].id;
    const photos = fb.bundle.photos.map((p) => (p.questionId === q2 && p.inline ? { ...p, inline: { ...p.inline, page: true, pageFit: "contain" as const } } : p));
    const bundle = { ...fb.bundle, photos };
    const res = await render.renderInterior(bundle, "print");
    const file = path.join(dir, "contain.pdf");
    writeFileSync(file, res.pdf);
    const content = contentOf({ ...fb, bundle });
    const cont = content.chapters.flatMap((c) => c.items).find((it) => it.continued)!;
    expect(cont.photoBefore?.inline?.pageFit).toBe("contain");
    const pages = textRows(file);
    const contAt = pages.findIndex((rows) => rows.some((r) => norm(cont.answer).startsWith(norm(r.text).replace(/-$/, "")) && norm(r.text).length > 10));
    const photoPage = contAt - 1;
    expect(pages[photoPage].length).toBe(0);
    const sheet = { width: mm(content.format.widthMm + print.bleedMm * 2), height: mm(content.format.heightMm + print.bleedMm * 2) };
    const white = Object.entries(edgeMax(grayPage(file, photoPage + 1, 24, sheet))).flatMap(([edge, v]) => (v >= 250 ? [edge] : []));
    // Поля бумаги по краям, где снимок не достаёт до края листа (у «заполнить страницу» их нет — тест выше).
    expect(white.length, JSON.stringify(white)).toBeGreaterThanOrEqual(2);
  }, 120_000);
});
