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
    photos.push({ id: `00000000-0000-0000-0000-0000000000${10 + i}`, bookId: "b", position: i, storageKey: `photos/b/${i}.jpg`, thumbKey: `photos/b/${i}_t.jpg`, width: w, height: h, caption: i % 2 ? "Наше первое лето" : "", layout: i < 4 ? "grid" : i === 4 ? "half" : "full", questionId: null, inline: null, createdAt: now, updatedAt: now });
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
  recipientName: "Марғұлан",
  recipientGender: "m",
  hideRecipientOnCover: false,
  coverTemplate: "mosaic",
  coverPhotoId: null,
  coverPhotoExtra: [],
  backText: "Каждая страница — о тебе.",
  backLayout: "polaroids",
  backPhotoId: null,
  backPhotoExtra: [], photoFrames: {},
  dedication: "",
  interior: "photobook",
  format: "a5",
  photoPlacement: "chapters",
  showToc: false,
  inviteToken: null,
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
  answer: "Мы встретились в самый обычный вторник, когда в Алматы шёл первый снег.",
  createdAt: now,
  updatedAt: now,
}));

describe("PDF с фотографиями", () => {
  it.each(["photobook", "memories", "album", "vintage", "classic"])("оформление %s: фото в начале глав, сетка и подписи — ровно расчётное число полос", async (interior) => {
    const { renderInterior, contentFor } = await import("@/modules/production/infrastructure/pdf/render");
    const { estimatePages } = await import("@/lib/book/layout");
    const bundle = { book: { ...book, interior }, questions, photos };
    const content = contentFor(bundle);
    const opener = interior === "photobook" || interior === "memories";
    expect(content.chapters.every((c) => !!c.openerPhoto)).toBe(opener);
    const res = await renderInterior(bundle, "reading");
    expect(res.contentPages).toBe(estimatePages(content));
  });

  it("обложка-мозаика из четырёх фото и оборот с полароидами — одна страница развёртки", async () => {
    const { renderCover } = await import("@/modules/production/infrastructure/pdf/render");
    const ids = photos.map((p) => p.id);
    const res = await renderCover({ book: { ...book, coverPhotoId: ids[0], coverPhotoExtra: ids.slice(1, 4), backPhotoId: ids[4], backPhotoExtra: ids.slice(5) }, questions, photos }, 64, "preview");
    expect((await PDFDocument.load(res.pdf)).getPageCount()).toBe(1);
  });

  it("оборот «Фото во всю» не переносит ничего на вторую страницу", async () => {
    const { renderCover } = await import("@/modules/production/infrastructure/pdf/render");
    const res = await renderCover({ book: { ...book, coverTemplate: "arch", coverPhotoId: photos[0].id, backLayout: "fullPhoto", backPhotoId: photos[1].id }, questions, photos }, 64, "preview");
    expect((await PDFDocument.load(res.pdf)).getPageCount()).toBe(1);
  });
});
