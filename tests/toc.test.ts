import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { messagesFor } from "@/i18n/messages";
import { buildBookContent } from "@/lib/book/book-content";
import { estimateTocPages, textMetrics } from "@/lib/book/estimate";
import { toPhotoItem, type BookContent } from "@/lib/book/layout";
import { bookToc, parseTocLines, selectToc, tocCandidates, tocKey, type TocCandidate } from "@/lib/book/toc";
import { fixtureBook, type FixtureBook } from "./fixtures/books";
import { photoNames, useFixtureStorage } from "./fixtures/photos";
import { hasTool, textRows } from "./pdf-inspect";

const candidates: TocCandidate[] = [
  { key: "c:intro", pageKey: "intro", kind: "chapter", number: 1, label: "Вместо предисловия" },
  { key: "q:a", pageKey: "q:a", kind: "section", number: null, label: "Почему я пишу", parent: "c:intro" },
  { key: "q:b", pageKey: "q:b", kind: "section", number: null, label: "", parent: "c:intro" },
  { key: "c:meet", pageKey: "meet", kind: "chapter", number: 2, label: "Знакомство" },
  { key: "q:c", pageKey: "q:c", kind: "section", number: null, label: "Как мы встретились", parent: "c:meet" },
  { key: "c:__gallery", pageKey: "__gallery", kind: "chapter", number: null, label: "Наши моменты" },
];
const labels = (mode: Parameters<typeof selectToc>[1], lines: Parameters<typeof selectToc>[2] = {}) => selectToc(candidates, mode, lines).map((l) => `${l.level}|${l.number ?? "-"}|${l.label}`);

describe("оглавление: режимы и свои строки (lib/book/toc)", () => {
  it("по главам — главы с номерами и галерея; разделов нет", () => {
    expect(labels("chapters")).toEqual(["0|1|Вместо предисловия", "0|2|Знакомство", "0|-|Наши моменты"]);
  });

  it("по заголовкам — заголовки без номеров и галерея; раздел без заголовка не печатается", () => {
    expect(labels("sections")).toEqual(["0|-|Почему я пишу", "0|-|Как мы встретились", "0|-|Наши моменты"]);
  });

  it("главы и заголовки — разделы под своей главой со сдвигом", () => {
    expect(labels("both")).toEqual(["0|1|Вместо предисловия", "1|-|Почему я пишу", "0|2|Знакомство", "1|-|Как мы встретились", "0|-|Наши моменты"]);
  });

  it("своё название, скрытая строка и название для раздела без заголовка", () => {
    const lines = { "q:a": { title: "Первая страница" }, "q:b": { title: "Без слов" }, "c:__gallery": { hidden: true }, "q:c": { title: "  " } };
    expect(labels("sections", lines)).toEqual(["0|-|Первая страница", "0|-|Без слов", "0|-|Как мы встретились"]);
  });

  it("настройки из запроса: чужие ключи, пустые и длинные названия отбрасываются или обрезаются", () => {
    expect(
      parseTocLines({
        "q:abc-1": { title: "  Своё  ", hidden: false },
        "c:intro": { hidden: true },
        "x:bad": { title: "нет" },
        "q:empty": { title: "   " },
        "q:long": { title: "я".repeat(300) },
        "q:<script>": { title: "x" },
      }),
    ).toEqual({ "q:abc-1": { title: "Своё" }, "c:intro": { hidden: true }, "q:long": { title: "я".repeat(200) } });
    expect(parseTocLines(null)).toEqual({});
    expect(parseTocLines([1, 2])).toEqual({});
  });
});

describe("оглавление в содержимом книги", () => {
  const { bundle } = fixtureBook("classic", "a5", "ru");
  const content = (book: Partial<typeof bundle.book>) => buildBookContent({ ...bundle.book, ...book }, bundle.questions, bundle.photos.map(toPhotoItem), [], 2026, bundle.letters);

  it("по умолчанию ключей нет — отпечаток прежних книг не меняется", () => {
    const c = content({});
    expect("tocMode" in c).toBe(false);
    expect("tocLines" in c).toBe(false);
  });

  it("свои названия печатаются без эмодзи; ключи кандидатов — главы и ответы книги", () => {
    const base = content({});
    const first = base.chapters[0].items[0];
    const c = content({ tocMode: "sections", tocLines: { [tocKey.section(first.id)]: { title: "Начало 🌸 истории" } } });
    expect(c.tocMode).toBe("sections");
    expect(bookToc(c)[0]).toMatchObject({ key: tocKey.section(first.id), label: "Начало истории", number: null });
    expect(tocCandidates(c).filter((x) => x.kind === "chapter").length).toBe(c.chapters.length + (c.galleryPhotos.length ? 1 : 0));
  });
});

// ─── PDF: оглавление по заголовкам с настоящими номерами страниц ───────────────

const textless = !hasTool("pdftotext");
const dir = mkdtempSync(path.join(tmpdir(), "mybook-toc-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));
let render: typeof import("@/modules/production/infrastructure/pdf/render");
beforeAll(async () => {
  await useFixtureStorage(undefined, photoNames);
  render = await import("@/modules/production/infrastructure/pdf/render");
});

const norm = (s: string) => s.toLocaleLowerCase("ru").replace(/\s+/g, "");

describe.skipIf(textless)("PDF: оглавление по заголовкам", () => {
  async function build(fb: FixtureBook, book: Partial<FixtureBook["bundle"]["book"]>) {
    const bundle = { ...fb.bundle, book: { ...fb.bundle.book, ...book } };
    const res = await render.renderInterior(bundle, "print");
    const file = path.join(dir, `${fb.key}-${book.tocMode}.pdf`);
    writeFileSync(file, res.pdf);
    const content: BookContent = buildBookContent(bundle.book, bundle.questions, bundle.photos.map(toPhotoItem), bundle.chapters, undefined, bundle.letters);
    return { res, content, pages: textRows(file).map((rows) => rows.map((r) => r.text)) };
  }

  for (const [design, format] of [
    ["classic", "a5"],
    ["stars", "square"],
  ] as const) {
    it(`${design}-${format}: номер у каждой строки — страница, где стоит заголовок; скрытой строки нет`, async () => {
      const fb = fixtureBook(design, format, "ru");
      const items = buildBookContent(fb.bundle.book, fb.bundle.questions, [], []).chapters.flatMap((c) => c.items.filter((it) => it.heading));
      const [hiddenItem, renamedItem] = items;
      const { res, content, pages } = await build(fb, {
        tocMode: "sections",
        tocLines: { [tocKey.section(hiddenItem.id)]: { hidden: true }, [tocKey.section(renamedItem.id)]: { title: "Строка по-своему" } },
      });
      const lines = bookToc(content);
      expect(lines.some((l) => l.key === tocKey.section(hiddenItem.id))).toBe(false);
      expect(lines.find((l) => l.key === tocKey.section(renamedItem.id))?.label).toBe("Строка по-своему");

      const tocAt = pages.findIndex((rows) => rows.some((r) => norm(r) === norm(messagesFor("ru").book.toc)));
      const firstOpener = pages.findIndex((rows, i) => i > tocAt && rows.some((r) => norm(r).includes(norm(content.chapters[0].title))));
      const tocText = norm(pages.slice(tocAt, firstOpener).flat().join(" "));
      // Оценка полос оглавления сходится с PDF.
      expect(estimateTocPages(content, textMetrics(content.format, content.interior))).toBe(firstOpener - tocAt);

      for (const line of lines.filter((l) => l.pageKey.startsWith("q:"))) {
        const item = content.chapters.flatMap((c) => c.items).find((it) => tocKey.section(it.id) === line.pageKey)!;
        const page = res.chapterPages[line.pageKey];
        // Заголовок раздела стоит на этой полосе (полосы pdftotext — с 0).
        expect(pages[page - 1].some((r) => norm(item.heading!).startsWith(norm(r)) && norm(r).length > 3), `${item.heading} → с. ${page}`).toBe(true);
        expect(tocText).toContain(norm(line.label));
      }
    }, 120_000);
  }
});
