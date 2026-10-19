import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { FaceView } from "@/components/book3d/pages";
import { flipbookData } from "@/components/book3d/flipbook-data";
import { cqwUnits } from "@/components/interior/units";
import { pageKit } from "@/components/interior/kit";
import { bookMessagesFor } from "@/i18n/messages/partial";
import { messagesFor } from "@/i18n/messages";
import { buildBookContent } from "@/lib/book/book-content";
import { getFormat } from "@/lib/book/formats";
import { planFaces } from "@/lib/book/flipbook";
import { getInteriorDesign } from "@/lib/book/interiors";
import { toPhotoItem } from "@/lib/book/layout";
import { bookSpreadSample } from "@/server/spreadSample";
import { fixtureBook, fixtureVariants, type FixtureBook } from "./fixtures/books";
import { photoNames, useFixtureStorage, variantPhotoNames } from "./fixtures/photos";
import { hasTool, textRows } from "./pdf-inspect";

/**
 * Подписи по виду книги — «Из семейного альбома» / «Фотографии», «Записано со слов автора» — одни и те же в PDF
 * (оборот титула, оглавление, начальная полоса галереи), в HTML-полосах и в раскладке 3D-книги; рукопись и пример
 * разворота до первых ответов тоже зависят от вида.
 */

const variants = fixtureVariants();
const variant = (key: string) => variants.find((v) => v.key === key)!;
const withLanguage = (fb: FixtureBook, language: "ru" | "kk"): FixtureBook => ({ ...fb, bundle: { ...fb.bundle, book: { ...fb.bundle.book, language } } });
const contentOf = ({ bundle }: FixtureBook) => buildBookContent(bundle.book, bundle.questions, bundle.photos.map(toPhotoItem), bundle.chapters, 2026, bundle.letters);

const dir = mkdtempSync(path.join(tmpdir(), "mybook-print-kinds-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));
let render: typeof import("@/modules/production/infrastructure/pdf/render");
beforeAll(async () => {
  await useFixtureStorage(undefined, [...photoNames, ...variantPhotoNames]);
  render = await import("@/modules/production/infrastructure/pdf/render");
});

/** Текст полос PDF по порядку: каждая полоса — строки через перевод строки. */
async function pdfPages(fb: FixtureBook) {
  const res = await render.renderInterior(fb.bundle, "print");
  const file = path.join(dir, `${fb.key}-${fb.bundle.book.language}.pdf`);
  writeFileSync(file, res.pdf);
  return textRows(file).map((rows) => rows.map((r) => r.text).join("\n"));
}

const autobiography = variant("autobiography");
const blank = variant("blank");
const gift = fixtureBook("classic", "a5", "ru");

describe.skipIf(!hasTool("pdftotext"))("PDF: подписи по виду книги", () => {
  it("автобиография (ru): «записано со слов» на обороте титула, галерея — «Из семейного альбома» в оглавлении и на начальной полосе", async () => {
    const pages = await pdfPages(autobiography);
    expect(pages[1]).toContain("Записано со слов автора — внучка Аружан");
    expect(pages[1]).toContain("© ");
    expect(pages.findIndex((p) => p.includes("Из семейного альбома") && p.toLowerCase().includes("содержание"))).toBeGreaterThan(-1);
    // Оглавление и начальная полоса галереи (дизайн может набирать название прописными).
    expect(pages.filter((p) => p.toLowerCase().replace(/\s+/g, " ").includes("из семейного альбома"))).toHaveLength(2);
    expect(pages.join("\n")).not.toContain("Наши моменты");
  });

  it("автобиография (kk): строка и галерея на казахском", async () => {
    const pages = await pdfPages(withLanguage(autobiography, "kk"));
    expect(pages[1]).toContain("Автордың айтуымен жазып алған — внучка Аружан");
    expect(pages.join("\n")).toContain("Отбасылық альбомнан");
  });

  it("своя книга: галерея — «Фотографии», строки «записано со слов» нет", async () => {
    const withGallery: FixtureBook = { ...blank, bundle: { ...blank.bundle, book: { ...blank.bundle.book, photoPlacement: "end" } } };
    const pages = await pdfPages(withGallery);
    expect(pages[1]).not.toContain("Записано со слов");
    expect(pages.findIndex((p) => p.includes("Фотографии") && p.toLowerCase().includes("содержание"))).toBeGreaterThan(-1);
  });

  it("подарок: «Наши моменты» и никакой строки «записано со слов», даже если поле заполнено", async () => {
    const odd: FixtureBook = { ...gift, bundle: { ...gift.bundle, book: { ...gift.bundle.book, recordedBy: "кто-то", photoPlacement: "end" } } };
    const pages = await pdfPages(odd);
    expect(pages[1]).not.toContain("Записано");
    expect(pages.findIndex((p) => p.includes("Наши моменты") && p.toLowerCase().includes("содержание"))).toBeGreaterThan(-1);
  });
});

describe("рукопись (plainText)", () => {
  it("автобиография: автор, затем «записано со слов»; названия глав — без повторов ключей банка", () => {
    const { text } = render.plainText(autobiography.bundle);
    const lines = text.split("\r\n");
    const author = lines.indexOf(autobiography.bundle.book.authorName);
    expect(lines[author + 1]).toBe("Записано со слов автора — внучка Аружан");
    expect(text).toContain("ГЛАВА 1. ВМЕСТО ПРЕДИСЛОВИЯ");
  });

  it("своя книга: главы автора по порядку, без названия — «Без названия», пустая глава не попадает, заголовков-разделителей нет", () => {
    const { title, text } = render.plainText(blank.bundle);
    expect(title).toBe("Моя книга");
    const heads = text.split("\r\n").filter((l) => l.startsWith("ГЛАВА "));
    expect(heads).toEqual(["ГЛАВА 1. С ЧЕГО ВСЁ НАЧАЛОСЬ", "ГЛАВА 2. ВСТРЕЧА", "ГЛАВА 3. БЕЗ НАЗВАНИЯ", "ГЛАВА 4. ЧТО ДАЛЬШЕ", "ГЛАВА 5. ПИСЬМА БЛИЗКИХ"]);
    expect(text).not.toContain("Пока пустая глава");
    expect(text).not.toContain("Записано");
    expect(text).toContain("Мы [Аня|Анна] — так нас звали во дворе");
  });

  it("подарок: рукопись как раньше, без строки «записано со слов»", () => {
    expect(render.plainText(gift.bundle).text).not.toContain("Записано");
  });
});

describe("HTML-полосы и 3D-книга", () => {
  const dataOf = (fb: FixtureBook) => {
    const { book, questions, chapters, photos, letters } = fb.bundle;
    return flipbookData(book, questions, chapters, photos, letters ?? []);
  };
  const ctxOf = (fb: FixtureBook) => {
    const data = dataOf(fb);
    const kit = pageKit(getInteriorDesign(data.interiorId), getFormat(data.formatId), cqwUnits(getFormat(data.formatId).widthMm), data.language);
    const plan = planFaces({
      hasDedication: !!data.dedication,
      hasToc: data.showToc,
      textPages: data.chapters.map((c) => (c.entries.length ? 2 : 0)),
      photoPages: data.chapters.map((c) => c.photoPages?.length ?? 0),
      galleryPages: data.gallery?.pages.length ?? 0,
    });
    return { data, ctx: { data, kit, chapterStarts: plan.chapterStarts, galleryStart: plan.galleryStart }, plan };
  };
  const html = (fb: FixtureBook, kind: "colophon" | "toc" | "galleryOpener") => {
    const { ctx } = ctxOf(fb);
    return renderToStaticMarkup(<FaceView face={kind === "toc" ? { kind, part: 0 } : { kind }} no={3} ctx={ctx} />);
  };
  const withGallery = (fb: FixtureBook): FixtureBook => ({ ...fb, bundle: { ...fb.bundle, book: { ...fb.bundle.book, photoPlacement: "end" } } });

  it("оборот титула автобиографии: та же строка, что в PDF; у остальных видов её нет", () => {
    const t = bookMessagesFor("ru");
    expect(html(autobiography, "colophon")).toContain(t.recordedBy("внучка Аружан"));
    expect(html(blank, "colophon")).not.toContain("Записано");
    expect(html(gift, "colophon")).not.toContain("Записано");
  });

  it("оглавление 3D содержит галерею без номера, как PDF, и номер её полосы из раскладки", () => {
    const fb = withGallery(autobiography);
    const { data, plan } = ctxOf(fb);
    expect(data.gallery?.title).toBe("Из семейного альбома");
    expect(plan.galleryStart).not.toBeNull();
    const toc = html(fb, "toc");
    expect(toc).toContain("Из семейного альбома");
    expect(toc).toContain(`>${plan.galleryStart}<`);
    expect(toc).not.toMatch(/\d\. Из семейного альбома/);
    expect(html(fb, "galleryOpener")).toContain("Из семейного альбома");
  });

  it("раскладка: полоса галереи — начальная полоса галереи; без галереи null", () => {
    const { plan } = ctxOf(withGallery(autobiography));
    expect(plan.faces[(plan.galleryStart ?? 0) - 1].kind).toBe("galleryOpener");
    const chapters: FixtureBook = { ...autobiography, bundle: { ...autobiography.bundle, book: { ...autobiography.bundle.book, photoPlacement: "chapters" } } };
    expect(ctxOf(chapters).plan.galleryStart).toBeNull();
  });

  it("название обложки в 3D — название, которое печатается (у своей книги с пустым полем — «Моя книга»), имена — как на обложке PDF", () => {
    const data = dataOf(blank);
    expect(data.cover.title).toBe(contentOf(blank).title);
    expect(data.cover.title).toBe("Моя книга");
    const auto = dataOf(autobiography);
    expect(auto.cover.names).toBe(autobiography.bundle.book.authorName.trim());
    expect(auto.recordedBy).toBe("внучка Аружан");
    expect(dataOf(gift).recordedBy).toBe("");
  });
});

describe("пример разворотов до первых ответов", () => {
  const empty = (fb: FixtureBook) => ({ book: fb.bundle.book, questions: fb.bundle.questions.map((q) => ({ ...q, answer: "" })), chapters: fb.bundle.chapters });
  const sample = (fb: FixtureBook) => {
    const e = empty(fb);
    return bookSpreadSample(e.book, e.questions, e.chapters, "", []);
  };
  const love = messagesFor("ru").landing.sample;

  it("подарок: любовная история лендинга, как раньше", () => {
    const s = sample(gift);
    expect(s.entries[0].heading).toBe(love.h1);
    expect(s.captions).toBeUndefined();
  });

  it("автобиография: свой рассказ о детстве, подписи к фото о семье, без любовного сюжета", () => {
    const s = sample(autobiography);
    const t = messagesFor("ru").book.sampleByKind.autobiography;
    expect(s.chapter).toEqual({ number: 1, title: t.chapterTitle, epigraph: t.epigraph });
    expect(s.entries[0]).toEqual({ heading: t.h1, paragraphs: [t.p1, t.p2] });
    expect(s.captions).toEqual(t.photos);
    expect(JSON.stringify(s)).not.toContain(love.h1);
    expect(JSON.stringify(s)).not.toContain(bookMessagesFor("ru").samplePhotos[0]);
  });

  it("автобиография (kk): образец на казахском", () => {
    const s = sample(withLanguage(autobiography, "kk"));
    expect(s.chapter.title).toBe(messagesFor("kk").book.sampleByKind.autobiography.chapterTitle);
  });

  it("своя книга: нейтральный образец; главы и эпиграфы — автора, образец эпиграфа не подставляется", () => {
    const s = sample(blank);
    const t = messagesFor("ru").book.sampleByKind.blank;
    expect(s.entries[0].heading).toBe(t.h1);
    expect(s.captions).toEqual(t.photos);
    expect(s.chapter.title).toBe("С чего всё началось");
    expect(s.chapter.epigraph).toBe("Всё, что помню, записываю, пока помню.");
    const noChapters = bookSpreadSample(blank.bundle.book, [], [], "", []);
    expect(noChapters.chapter).toEqual({ number: 1, title: t.chapterTitle, epigraph: undefined });
    expect(JSON.stringify(noChapters)).not.toContain("Кок-Тобе");
  });
});
