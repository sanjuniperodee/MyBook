import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import type { Book, BookQuestion, Photo } from "@/shared/infrastructure/db/schema";

// Хранилище фото — во временной папке: модуль env читает STORAGE_DIR при загрузке, поэтому рендер импортируем после.
const dir = mkdtempSync(path.join(tmpdir(), "mybook-photos-"));
process.env.STORAGE_DIR = dir;
afterAll(() => rmSync(dir, { recursive: true, force: true }));

const now = new Date();
const photos: Photo[] = [];
beforeAll(async () => {
  mkdirSync(path.join(dir, "photos/b"), { recursive: true });
  const sizes: [number, number][] = [[1200, 900], [900, 1200], [1000, 1000], [1400, 900], [900, 1300], [1100, 800], [800, 1100]];
  for (const [i, [w, h]] of sizes.entries()) {
    const jpg = await sharp({ create: { width: w, height: h, channels: 3, background: { r: 40 * i, g: 120, b: 200 - 20 * i } } }).jpeg().toBuffer();
    writeFileSync(path.join(dir, `photos/b/${i}.jpg`), jpg);
    writeFileSync(path.join(dir, `photos/b/${i}_t.jpg`), jpg);
    photos.push({ id: `00000000-0000-0000-0000-0000000000${10 + i}`, bookId: "b", position: i, storageKey: `photos/b/${i}.jpg`, thumbKey: `photos/b/${i}_t.jpg`, width: w, height: h, caption: i % 2 ? "Наше первое лето" : "", layout: i < 4 ? "grid" : i === 4 ? "half" : "full", questionId: null, inline: null, crop: null, chapter: null, opener: false, createdAt: now, updatedAt: now });
  }
});

const book: Book = {
  id: "00000000-0000-0000-0000-000000000001",
  userId: "00000000-0000-0000-0000-000000000002",
  theme: "love",
  status: "draft",
  title: "Наша история",
  subtitle: "",
  authorName: "Алия",
  authorGender: "f",
  recordedBy: "",
  recipientName: "Марғұлан",
  recipientGender: "m",
  hideRecipientOnCover: false,
  coverLines: true,
  namesOnCover: "",
  coverTemplate: "mosaic",
  coverPhotoId: null,
  coverPhotoExtra: [],
  backText: "Каждая страница — о тебе.",
  backLayout: "polaroids",
  backPhotoId: null,
  backPhotoExtra: [], photoFrames: {},
  dedication: "",
  interior: "photobook",
  interiorStyle: {},
  coverDesign: null,
  coverBack: null,
  format: "a5",
  photoPlacement: "chapters",
  showToc: false,
  tocMode: "chapters",
  tocLines: {},
  layoutRev: 1,
  paginationRev: 1,
  inviteToken: null,
  inviteText: "",
  endText: null,
  titlePage: true,
  chapterStart: "page",
  occasion: null,
  occasionDate: null,
  language: "ru",
  createdAt: now,
  updatedAt: now,
};
const questions: BookQuestion[] = Array.from({ length: 3 }, (_, i) => ({
  id: `q${i}`,
  bookId: book.id,
  position: i,
  chapter: ["intro", "meet", "date"][i],
  questionKey: null,
  prompt: "Вопрос",
  title: `Заголовок ${i + 1}`,
  hint: null,
  displayText: null,
  hideHeading: false,
  pageBreak: false,
  answer: "Мы встретились в самый обычный вторник, когда в Алматы шёл первый снег.",
  media: [],
  createdAt: now,
  updatedAt: now,
}));

describe("PDF с фотографиями", () => {
  it.each(["photobook", "memories", "album", "vintage", "classic", "gallery", "arches", "cinema", "luna"])("оформление %s: фото в начале глав, сетка и подписи — ровно расчётное число полос", async (interior) => {
    const { renderInterior, contentFor } = await import("@/modules/production/infrastructure/pdf/render");
    const { estimatePages } = await import("@/lib/book/estimate");
    const { getInteriorDesign } = await import("@/lib/book/interiors");
    const bundle = { book: { ...book, interior }, questions, chapters: [], photos };
    const content = contentFor(bundle);
    const opener = !!getInteriorDesign(interior).opener.photo;
    expect(content.chapters.every((c) => !!c.openerPhoto)).toBe(opener);
    const res = await renderInterior(bundle, "reading");
    expect(res.contentPages).toBe(estimatePages(content));
  });

  // 11.11.2026: клиентка хотела фото на начальной полосе альбома в конце, как у глав в оформлении «Кино», — его там не было.
  it("фото начальной полосы альбома: в PDF на начальной полосе альбома, в альбоме его нет, объём как в оценке", async () => {
    const { renderInterior, contentFor } = await import("@/modules/production/infrastructure/pdf/render");
    const { estimatePages } = await import("@/lib/book/estimate");
    const { GALLERY_KEY } = await import("@/lib/book/toc");
    const pick = photos[1].id;
    const withAlbum = photos.map((p) => (p.id === pick ? { ...p, chapter: GALLERY_KEY, opener: true } : p));
    const bundle = { book: { ...book, interior: "cinema", photoPlacement: "end" as const, layoutRev: 2, paginationRev: 2 }, questions, chapters: [], photos: withAlbum };
    const content = contentFor(bundle);
    expect(content.galleryOpenerPhoto?.id).toBe(pick);
    expect(content.galleryPhotos.map((p) => p.id)).not.toContain(pick);
    const res = await renderInterior(bundle, "reading");
    expect(res.contentPages).toBe(estimatePages(content));
    expect(res.pages.find((p) => p.kind === "opener" && p.chapterKey === GALLERY_KEY)).toBeDefined();
  });

  // Обращение по заказу 106: фото опускают ниже (отступ сверху) и ставят с новой страницы — PDF как в оценке объёма.
  it("фото в ответе с отступом сверху и «с новой страницы»: на полосу больше, ровно как в оценке", async () => {
    const { renderInterior, contentFor } = await import("@/modules/production/infrastructure/pdf/render");
    const { estimatePages } = await import("@/lib/book/estimate");
    const long = Array.from({ length: 2 }, () => "Мы встретились в самый обычный вторник, когда в Алматы шёл первый снег. ".repeat(2).trim()).join("\n");
    const qs = questions.map((q, i) => (i === 0 ? { ...q, answer: long } : q));
    const run = async (inline: Partial<NonNullable<Photo["inline"]>>) => {
      const ph = photos.map((p, i) => (i === 0 ? { ...p, questionId: "q0", inline: { width: 60, align: "center" as const, anchor: null, aspect: "original" as const, focusX: 0.5, focusY: 0.5, frame: "none" as const, ...inline } } : p));
      const bundle = { book: { ...book, interior: "classic" }, questions: qs, chapters: [], photos: ph };
      const res = await renderInterior(bundle, "reading");
      expect(res.contentPages).toBe(estimatePages(contentFor(bundle)));
      return res.contentPages;
    };
    const plain = await run({});
    expect(await run({ breakBefore: true })).toBe(plain + 1);
    expect(await run({ spaceAbove: 0.6 })).toBe(plain + 1);
  });

  // Превью кабинета: нажатие на текст, фото и начальную полосу главы открывает их правку (pdf/zones.ts, zoneHref).
  it("места правки полос: заголовок и абзацы ответа, фото в ответе и на страницах, начальная полоса главы", async () => {
    const { renderInterior, contentFor } = await import("@/modules/production/infrastructure/pdf/render");
    const { zoneHref } = await import("@/lib/book/book-build");
    const answer = "Первый абзац о встрече.\nВторой абзац — о том, что было потом.";
    const qs = questions.map((q, i) => (i === 0 ? { ...q, answer } : q));
    const ph = photos.map((p, i) => (i === 0 ? { ...p, questionId: "q0", inline: { width: 60, align: "center" as const, anchor: null, aspect: "original" as const, focusX: 0.5, focusY: 0.5, frame: "none" as const } } : p));
    const bundle = { book: { ...book, interior: "classic" }, questions: qs, chapters: [], photos: ph };
    const res = await renderInterior(bundle, "preview");
    const all = Object.entries(res.zones).flatMap(([n, zs]) => zs.map((z) => ({ n: Number(n), ...z })));
    // Все места — внутри полосы.
    for (const z of all) {
      expect(z.x).toBeGreaterThanOrEqual(0);
      expect(z.y).toBeGreaterThanOrEqual(0);
      expect(z.x + z.w).toBeLessThanOrEqual(1.001);
      expect(z.y + z.h).toBeLessThanOrEqual(1.001);
    }
    const text = all.filter((z) => z.t === "text" && z.q === "q0");
    expect(text.some((z) => z.p === undefined)).toBe(true); // заголовок
    expect(text.map((z) => z.p).filter((p) => p !== undefined)).toContain(0);
    const inAnswer = all.find((z) => z.t === "photo" && z.id === ph[0].id);
    expect(inAnswer).toMatchObject({ q: "q0" });
    expect(res.pages[inAnswer!.n - 1].kind).toBe("text");
    expect(zoneHref("b1", inAnswer!)).toBe(`/books/b1/questions?s=q0&photo=${ph[0].id}`);
    // Фото на страницах главы — без ответа; начальная полоса — лист главы с её первым вопросом.
    const onPages = all.filter((z) => z.t === "photo" && z.id !== ph[0].id);
    expect(onPages.length).toBeGreaterThan(0);
    expect(onPages.every((z) => res.pages[z.n - 1].kind === "photo" && !z.q)).toBe(true);
    const opener = all.find((z) => z.t === "chapter" && z.key === "intro");
    expect(opener).toMatchObject({ x: 0, y: 0, w: 1, h: 1, q: "q0" });
    expect(zoneHref("b1", opener!)).toBe("/books/b1/questions?s=q0&chapter=intro");
    expect(contentFor(bundle).chapters.length).toBeGreaterThan(0);
  });

  it("обложка-мозаика из четырёх фото и оборот с полароидами — одна страница развёртки", async () => {
    const { renderCover } = await import("@/modules/production/infrastructure/pdf/render");
    const ids = photos.map((p) => p.id);
    const res = await renderCover({ book: { ...book, coverPhotoId: ids[0], coverPhotoExtra: ids.slice(1, 4), backPhotoId: ids[4], backPhotoExtra: ids.slice(5) }, questions, chapters: [], photos }, 64, "preview");
    expect((await PDFDocument.load(res.pdf)).getPageCount()).toBe(1);
  });

  it("оборот «Фото во всю» не переносит ничего на вторую страницу", async () => {
    const { renderCover } = await import("@/modules/production/infrastructure/pdf/render");
    const res = await renderCover({ book: { ...book, coverTemplate: "arch", coverPhotoId: photos[0].id, backLayout: "fullPhoto", backPhotoId: photos[1].id }, questions, chapters: [], photos }, 64, "preview");
    expect((await PDFDocument.load(res.pdf)).getPageCount()).toBe(1);
  });
});
