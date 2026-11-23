import { createElement, createRef, isValidElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ChapterPages, chapterContentKey } from "@/components/editor/preview/ChapterPages";
import { AnswerBlockView } from "@/components/interior/answer-block";
import { pageKit } from "@/components/interior/kit";
import { pxUnits } from "@/components/interior/units";
import { ru } from "@/i18n/messages/ru";
import { answerBlocks, type AnswerBlock } from "@/lib/book/answer-blocks";
import { editorBook, editorModel } from "@/lib/book/editor-data";
import { contentPages, editorContent } from "@/lib/book/editor-estimate";
import { previewFromContent, type PreviewChapter } from "@/lib/book/editor-model";
import { formats } from "@/lib/book/formats";
import { hyphenateWord, softHyphenate } from "@/lib/book/hyphenate";
import { applyInteriorStyle, getInteriorDesign, type InteriorDesign } from "@/lib/book/interiors";
import { LETTERS_CHAPTER } from "@/lib/book/layout";
import { printableText } from "@/lib/book/printable";
import { blockSpace, interiorSizes } from "@/lib/book/typesetting";
import { photoPlaceOf } from "@/lib/book/photo-place";
import { contentFor } from "@/modules/production/infrastructure/pdf/render";
import { bookSpreadSample } from "@/server/spreadSample";
import { bookToc } from "@/lib/book/toc";
import { flipbookData } from "@/components/book3d/flipbook-data";
import { printedCoverTitle } from "@/lib/book/cover-names";
import { FLOW_MARK } from "@/modules/production/infrastructure/pdf/flow";
import { InteriorDocument } from "@/modules/production/infrastructure/pdf/interior";
import { pdfKit } from "@/modules/production/infrastructure/pdf/interior/kit";
import { TextBlock } from "@/modules/production/infrastructure/pdf/interior/text-block";
import { fixtureSample, fixtureVariants, type FixtureBook } from "./fixtures/books";

// Владелец: книга везде должна выглядеть одинаково — превью в редакторе, развороты и PDF для типографии (эталон).
// Превью не может повторить react-pdf до строки, но правила у них одни: тот же текст и те же блоки, те же отбивки,
// те же переносы и те же решения доводки (по своей раскладке, тем же кодом flow-decisions). Здесь это и проверяется;
// сколько полос и где начинаются истории в браузере — scripts/visual/parity.ts (Chromium).

const books = [...fixtureSample(), ...fixtureVariants()];

/** Превью редактора тем же путём, что страница books/[id]/questions и PreviewPane. */
function editorPreview({ bundle }: FixtureBook) {
  const { book, questions, chapters, photos, letters } = bundle;
  const model = editorModel(book, questions, chapters, photos, (letters ?? []).filter((l) => l.status === "approved"));
  const eb = editorBook(book, model.coverPhotos);
  const content = editorContent(eb, model.questions, model.photos, model.letters, model.chapters);
  return { content, ...previewFromContent(content, model.questions, model.photos, { currentId: null, tocLines: book.tocLines, epigraphs: model.epigraphs, places: photoPlaceOf(content, model.photos, eb) }) };
}

/** Книга, как её печатает PDF (письма — только одобренные, как в authoring.queries.bundle). */
const printed = ({ bundle }: FixtureBook) => contentFor({ ...bundle, letters: bundle.letters?.filter((l) => l.status === "approved") });

describe("превью и PDF: одно содержимое", () => {
  it.each(books.map((b) => [b.key, b] as const))("%s: главы, истории, их текст и «с новой страницы» — как в печати", (_, book) => {
    const pdf = printed(book);
    const { chapters } = editorPreview(book);
    expect(chapters.map((c) => [c.key, c.number, c.title, c.epigraph ?? ""])).toEqual(pdf.chapters.map((c) => [c.key, c.number, c.title, c.epigraph ?? ""]));
    for (const [i, ch] of pdf.chapters.entries()) {
      // Части истории (продолжение после фото на всю страницу) превью склеивает обратно — сравниваем по истории.
      const stories = ch.items.filter((it) => !it.continued).map((it) => ({ id: it.id, heading: it.heading, pageBreak: !!it.pageBreak }));
      expect(chapters[i].entries.map((e) => ({ id: e.id, heading: e.heading, pageBreak: !!e.pageBreak }))).toEqual(stories);
      for (const e of chapters[i].entries) {
        // Текст — печатный (без эмодзи); у историй без фото на всю страницу он совпадает с текстом PDF целиком.
        expect(e.answer).toBe(printableText(e.answer));
        const parts = ch.items.filter((it) => it.id === e.id || it.id.startsWith(`${e.id}-p`));
        if (parts.length === 1) expect(e.answer).toBe(parts[0].answer);
      }
    }
  });

  it("объём в редакторе считает «с новой страницы» автора, как PDF", () => {
    const book = books.find((b) => b.key === "classic-a5-ru")!;
    const withBreaks: FixtureBook = { ...book, bundle: { ...book.bundle, questions: book.bundle.questions.map((q) => ({ ...q, pageBreak: true })) } };
    expect(contentPages(editorPreview(withBreaks).content).raw).toBeGreaterThan(contentPages(editorPreview(book).content).raw);
    // Письма близких — не вопросы: у них «с новой страницы» нет.
    expect(editorPreview(withBreaks).chapters.filter((c) => c.key !== LETTERS_CHAPTER).flatMap((c) => c.entries).every((e) => e.pageBreak)).toBe(true);
  });
});

/** Пометки доводки во всём дереве элементов react-pdf (функциональные компоненты раскрываются без рендера). */
function pdfMarks(node: ReactNode, out = new Set<string>()): Set<string> {
  if (Array.isArray(node)) {
    for (const n of node) pdfMarks(n, out);
    return out;
  }
  if (!isValidElement(node)) return out;
  const el = node as ReactElement<Record<string, unknown>>;
  if (typeof el.type === "function") return pdfMarks((el.type as (p: unknown) => ReactNode)(el.props), out);
  const mark = el.props[FLOW_MARK];
  if (typeof mark === "string") out.add(mark);
  return pdfMarks(el.props.children as ReactNode, out);
}

/** Глава превью без интерактивности — как на стенде; полосы на сервере не строятся, в разметке — копия для замера. */
function previewMarkup(chapter: PreviewChapter, design: InteriorDesign, format = formats.a5) {
  const px = 480 / format.widthMm;
  const kit = pageKit(design, format, pxUnits(px), "ru");
  return renderToStaticMarkup(
    createElement(ChapterPages, {
      chapter,
      contentKey: chapterContentKey(chapter),
      kit,
      pageW: 480,
      px,
      bookTitle: "Книга",
      language: "ru",
      t: ru.editor.preview,
      pages: 1,
      photoPages: {},
      currentId: null,
      selectedId: null,
      interactive: false,
      drag: null,
      scroll: createRef<HTMLDivElement>(),
      setMeasureRef: () => {},
      measure: () => {},
      onPageClick: () => {},
    }),
  );
}

describe("превью и PDF: одни блоки для доводки вёрстки", () => {
  it.each(books.filter((b) => !b.key.includes("bigphoto")).map((b) => [b.key, b] as const))("%s: превью помечает те же блоки, что PDF", (_, book) => {
    const pdf = printed(book);
    const images = new Map(pdf.chapters.flatMap((c) => c.items.flatMap((it) => (it.photos ?? []).map((p) => [p.id, { data: Buffer.alloc(0), width: p.width, height: p.height }] as const))));
    const marks = pdfMarks(createElement(InteriorDocument, { content: pdf, options: { bleedMm: 3, images } }));
    const { chapters } = editorPreview(book);
    for (const [i, ch] of pdf.chapters.entries()) {
      // Глава с фото на всю страницу в истории: у PDF её части — отдельные ответы (id-pN), превью держит историю целиком.
      if (ch.items.some((it) => it.continued || it.photoBefore)) continue;
      const items = new Set([...ch.items.map((it) => it.id), ch.key]);
      const own = [...marks].filter((m) => items.has(m.split(":")[1]));
      const html = new Set([...previewMarkup(chapters[i], pdf.interior, pdf.format).matchAll(/data-flow="([^"]+)"/g)].map((m) => m[1]));
      expect([...html].sort()).toEqual(own.sort());
    }
  });
});

describe("превью и PDF: одни отбивки блоков текста", () => {
  const design = getInteriorDesign("classic");
  const S = interiorSizes(design, 1);
  const blocks = answerBlocks(["Обычный абзац текста, который идёт дальше.", "«Цитата одной строкой»", "Ты мой тихий вечер", "и мой ранний рассвет", "— 1. раз", "— 2. два"], {});
  const content = { ...printed(books[0]), interior: design };
  const kit = pdfKit(content, { bleedMm: 0, images: new Map() });
  const html = pageKit(design, formats.a5, pxUnits(1), "ru");

  it.each(blocks.map((b, i) => [b.kind, b, i] as const))("%s: поля PDF и превью — blockSpace", (_, b: AnswerBlock, i) => {
    const space = blockSpace(design, S, b.kind);
    // Корневой элемент блока: функциональные компоненты раскрываются до примитива (View/Text у PDF, тег у превью).
    const root = (el: ReactElement): ReactElement<{ style?: Record<string, number | string> }> => (typeof el.type === "function" ? root((el.type as (p: unknown) => ReactElement)(el.props)) : (el as ReactElement<{ style?: Record<string, number | string> }>));
    const pdf = root(TextBlock({ kit, block: b, id: `b:x:${i}`, leadIn: false, first: true }) as ReactElement).props.style ?? {};
    const dom = root(createElement(AnswerBlockView, { kit: html, block: b, leadIn: false })).props.style ?? {};
    expect(Number(pdf.marginTop ?? 0)).toBeCloseTo(space.before, 3);
    expect(Number(pdf.marginBottom ?? 0)).toBeCloseTo(space.after, 3);
    // У превью px → pt (pxUnits(1): 1 мм = 1 px), отбивка снизу неделимой цитаты — полем внутри (как у react-pdf).
    const pt = (v: unknown) => (typeof v === "string" ? parseFloat(v) : Number(v ?? 0)) * (72 / 25.4);
    expect(pt(dom.marginTop)).toBeCloseTo(space.before, 2);
    expect(pt(b.kind === "quote" ? dom.paddingBottom : dom.marginBottom)).toBeCloseTo(space.after, 2);
  });
});

describe("превью редактора: правила PDF", () => {
  const indent = applyInteriorStyle(getInteriorDesign("classic"), { body: { indent: 1.25 } });
  const chapter = (entries: PreviewChapter["entries"]): PreviewChapter => ({ key: "intro", number: 1, title: "Глава", entries });
  const entry = (id: string, answer: string, extra: Partial<PreviewChapter["entries"][number]> = {}) => ({ id, heading: `История ${id}`, answer, photos: [], media: [], ...extra });
  const long = (s: string) => `${s} ${"Мы говорили о горах, о книгах и о том, что каждый хотел бы успеть в жизни. ".repeat(3)}`.trim();
  const paragraphs = (markup: string) => [...markup.matchAll(/<p [^>]*data-flow="b:[^"]+"[^>]*>/g)].map((m) => m[0]);

  it("красная строка — у всех абзацев ответа, кроме первого (как TextBlock), «и у первого» — у всех", () => {
    const ps = paragraphs(previewMarkup(chapter([entry("a", [long("Первый."), long("Второй."), long("Третий.")].join("\n"))]), indent));
    expect(ps.map((p) => /text-indent/.test(p))).toEqual([false, true, true]);
    const first = applyInteriorStyle(getInteriorDesign("classic"), { body: { indent: 1.25, indentFirst: true } });
    expect(paragraphs(previewMarkup(chapter([entry("a", [long("Первый."), long("Второй.")].join("\n"))]), first)).map((p) => /text-indent/.test(p))).toEqual([true, true]);
  });

  it("буквица — в начале главы, как в PDF", () => {
    const design = getInteriorDesign("novel");
    expect(design.dropCap).toBeTruthy();
    const markup = previewMarkup(chapter([entry("a", [long("Однажды летом."), long("Дальше.")].join("\n")), entry("b", long("Вторая история."))]), design);
    expect(markup.match(/float:left/g)).toHaveLength(1);
  });

  it("«с новой страницы» — разрыв колонки перед историей и без отбивки сверху", () => {
    const markup = previewMarkup(chapter([entry("a", "Текст."), entry("b", "Текст.", { pageBreak: true })]), indent);
    expect(markup).toMatch(/data-marker="b"[^>]*break-before:column/);
    expect(markup).not.toMatch(/data-marker="a"[^>]*break-before/);
  });

  it("концовка главы — после текста, с пометкой доводки", () => {
    expect(previewMarkup(chapter([entry("a", "Текст.")]), indent)).toMatch(/data-flow="t:intro"/);
    expect(previewMarkup(chapter([entry("a", "", { heading: null })]), indent)).not.toMatch(/data-flow="t:/);
  });
});

describe("переносы: одни у PDF и превью", () => {
  it("мягкие переносы превью — в местах слогов PDF, слово — кусок между пробелами со знаками препинания", () => {
    const text = "Мы встретились в самый обычный вторник, когда шёл первый снег.";
    const soft = softHyphenate(text, "ru");
    expect(soft.replaceAll("­", "")).toBe(text);
    for (const word of text.split(" ")) expect(soft).toContain(hyphenateWord(word, "ru").join("­"));
    expect(hyphenateWord("вторник,", "ru").length).toBeGreaterThan(1);
  });

  it("казахские слова — по слоговым правилам, короткие слова не переносятся", () => {
    expect(hyphenateWord("қалаймын", "kk").join("-")).toBe("қа-лай-мын");
    expect(hyphenateWord("сен", "kk")).toEqual(["сен"]);
    expect(softHyphenate("сен қалаймын", "kk")).toBe("сен қа­лай­мын");
  });
});

describe("разворот «Страниц»: то же, что в книге", () => {
  it.each(books.filter((b) => ["classic-a5-ru", "luna-a5-kk", "gender"].includes(b.key)).map((b) => [b.key, b] as const))("%s: строки оглавления (и письма близких), текст главы с фото и строфами, колонцифра", (_, book) => {
    const { bundle } = book;
    const letters = (bundle.letters ?? []).filter((l) => l.status === "approved");
    const sample = bookSpreadSample(bundle.book, bundle.questions, bundle.chapters, "", bundle.photos, null, letters);
    const pdf = printed(book);
    // Оглавление — строки PDF (bookToc), в том же порядке, вместе с главой писем.
    expect(sample.toc.map((l) => l.title)).toEqual(bookToc(pdf).map((e) => e.label));
    // Первая глава — истории PDF по порядку, с фото в тексте, QR и «с новой страницы».
    const first = pdf.chapters[0];
    sample.entries.forEach((e, i) => {
      const it = first.items[i];
      expect(e.heading).toBe(it.heading);
      expect(e.paragraphs.join("\n")).toBe(it.answer.split("\n").filter((p) => p.trim()).join("\n"));
      expect((e.photos ?? []).map((p) => p.id)).toEqual((it.photos ?? []).map((p) => p.id));
      expect(!!e.pageBreak).toBe(!!it.pageBreak);
    });
    // Колонцифра — первая полоса текста главы, не «7» из примера.
    expect(sample.folio).toBeGreaterThan(1);
  });
});

describe("обложка: название на 3D-книге — как в cover.pdf", () => {
  const book = books.find((b) => b.key === "classic-a5-ru")!.bundle;
  const flip = (patch: Partial<typeof book.book>) => flipbookData({ ...book.book, ...patch }, book.questions, book.chapters, book.photos);

  it("обложка из конструктора со стёртым названием — без названия и на лице, и на корешке (как печать, обращение №7)", () => {
    const data = flip({ title: "", coverDesign: { layers: [] } });
    expect(data.cover.title).toBe("");
    expect(data.title).toBe("");
    expect(printedCoverTitle({ title: "" }, true, "Наша история")).toBe("");
  });

  it("обложка шаблона с пустым названием — название по умолчанию, как в PDF", () => {
    const data = flip({ title: "", coverDesign: null });
    expect(data.cover.title).toBe(printed({ ...books[0], bundle: { ...book, book: { ...book.book, title: "" } } }).title);
    expect(data.cover.title).not.toBe("");
  });
});
