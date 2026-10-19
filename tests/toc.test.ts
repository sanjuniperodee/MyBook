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

describe("главы по-своему: переименовать во всей книге, убрать — истории в предыдущей главе", () => {
  const { bundle } = fixtureBook("classic", "a5", "ru");
  const content = (tocLines: Record<string, { title?: string; hidden?: boolean; epigraph?: string }>) =>
    buildBookContent({ ...bundle.book, tocLines }, bundle.questions, bundle.photos.map(toPhotoItem), [], 2026, bundle.letters);
  const base = content({});

  it("убранная глава: её истории — в конце предыдущей, номера глав подряд, в оглавлении её нет, редактор её видит", () => {
    const [first, second, third] = base.chapters;
    const c = content({ [tocKey.chapter(second.key)]: { hidden: true } });
    expect(c.chapters.map((ch) => ch.key)).toEqual(base.chapters.filter((ch) => ch.key !== second.key).map((ch) => ch.key));
    expect(c.chapters[0].items.map((it) => it.id)).toEqual([...first.items, ...second.items].map((it) => it.id));
    expect(c.chapters[0].folded).toEqual([{ key: second.key, title: second.title, at: first.items.length }]);
    expect(c.chapters.map((ch) => ch.number)).toEqual(c.chapters.map((_, i) => i + 1));
    expect(c.chapters[1]).toMatchObject({ key: third.key, number: 2 });
    expect(bookToc(c).some((l) => l.key === tocKey.chapter(second.key))).toBe(false);
    expect(tocCandidates(c).find((x) => x.key === tocKey.chapter(second.key))).toMatchObject({ folded: true, label: second.title });
  });

  it("первую главу убрать некуда — она остаётся в книге, скрыта только строка оглавления", () => {
    const first = base.chapters[0];
    const c = content({ [tocKey.chapter(first.key)]: { hidden: true } });
    expect(c.chapters[0].key).toBe(first.key);
    expect(bookToc(c).some((l) => l.key === tocKey.chapter(first.key))).toBe(false);
  });

  it("переименованная глава — новое название в книге, прежнее — подсказкой редактору", () => {
    const second = base.chapters[1];
    const c = content({ [tocKey.chapter(second.key)]: { title: "Своя глава 🌙" } });
    expect(c.chapters[1]).toMatchObject({ title: "Своя глава", defaultTitle: second.title });
    expect(tocCandidates(c).find((x) => x.key === tocKey.chapter(second.key))?.label).toBe(second.title);
    expect(bookToc(c).find((l) => l.key === tocKey.chapter(second.key))?.label).toBe("Своя глава");
  });

  it("свой эпиграф главы — на начальной полосе вместо эпиграфа темы; прежний — подсказкой редактору", () => {
    const first = base.chapters[0];
    const c = content({ [tocKey.chapter(first.key)]: { epigraph: "Всё в мире начинается с мамы 🌷" } });
    expect(c.chapters[0]).toMatchObject({ epigraph: "Всё в мире начинается с мамы", defaultEpigraph: first.epigraph ?? "" });
    expect(tocCandidates(c)[0].epigraph).toBe(first.epigraph);
    expect(parseTocLines({ "c:intro": { epigraph: "  Своё  " }, "q:x": { epigraph: "нет" } })).toEqual({ "c:intro": { epigraph: "Своё" } });
  });

  it("письма тоже можно убрать — они идут в конце последней главы", () => {
    const letters = base.chapters.at(-1)!;
    if (letters.key !== "__letters") return;
    const c = content({ "c:__letters": { hidden: true } });
    expect(c.chapters.some((ch) => ch.key === "__letters")).toBe(false);
    expect(c.chapters.at(-1)!.items.slice(-letters.items.length).map((it) => it.id)).toEqual(letters.items.map((it) => it.id));
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

  it("убранная глава: страницы с её названием нет, её истории в книге", async () => {
    const fb = fixtureBook("classic", "a5", "ru");
    const base = buildBookContent(fb.bundle.book, fb.bundle.questions, fb.bundle.photos.map(toPhotoItem), [], undefined, fb.bundle.letters);
    const hidden = base.chapters[1];
    const { content, pages } = await build(fb, { tocMode: "chapters", tocLines: { [tocKey.chapter(hidden.key)]: { hidden: true } } });
    const text = pages.map((rows) => norm(rows.join(" ")));
    // Название — отдельной строкой (начальная полоса, колонтитул, оглавление); внутри текста ответа фраза может встретиться.
    const at = pages.flatMap((rows, i) => rows.filter((r) => norm(r).replace(/^\d+\.?/, "").replace(/\d+$/, "") === norm(hidden.title)).map((r) => `с. ${i + 1}: ${r}`));
    expect(at, hidden.title).toEqual([]);
    for (const it of hidden.items.filter((x) => x.heading)) expect(text.some((p) => p.includes(norm(it.heading!))), it.heading!).toBe(true);
    expect(content.chapters.length).toBe(base.chapters.length - 1);
  }, 120_000);
});
