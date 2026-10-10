import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Book, BookQuestion, Photo } from "@/shared/infrastructure/db/schema";

const dir = mkdtempSync(path.join(tmpdir(), "mybook-frames-"));
process.env.STORAGE_DIR = dir;
afterAll(() => rmSync(dir, { recursive: true, force: true }));

const now = new Date();
const photos: Photo[] = [];

/** Снимок 2000×1000: левая половина красная, правая синяя — по цвету видно, какая часть попала в кадр. */
async function halves(w = 2000, h = 1000) {
  const left = await sharp({ create: { width: w / 2, height: h, channels: 3, background: { r: 230, g: 20, b: 20 } } }).png().toBuffer();
  const right = await sharp({ create: { width: w / 2, height: h, channels: 3, background: { r: 20, g: 20, b: 230 } } }).png().toBuffer();
  return sharp({ create: { width: w, height: h, channels: 3, background: "#000" } })
    .composite([{ input: left, left: 0, top: 0 }, { input: right, left: w / 2, top: 0 }])
    .jpeg({ quality: 95 })
    .toBuffer();
}

const mean = async (buf: Buffer) => {
  const { data } = await sharp(buf).resize(1, 1, { fit: "fill" }).raw().toBuffer({ resolveWithObject: true });
  return { r: data[0], g: data[1], b: data[2] };
};

beforeAll(async () => {
  mkdirSync(path.join(dir, "photos/b"), { recursive: true });
  const jpg = await halves();
  for (let i = 0; i < 4; i++) {
    writeFileSync(path.join(dir, `photos/b/${i}.jpg`), jpg);
    writeFileSync(path.join(dir, `photos/b/${i}_t.jpg`), jpg);
    photos.push({ id: `00000000-0000-0000-0000-0000000000${10 + i}`, bookId: "b", position: i, storageKey: `photos/b/${i}.jpg`, thumbKey: `photos/b/${i}_t.jpg`, width: 2000, height: 1000, caption: "", layout: "full", questionId: null, inline: null, createdAt: now, updatedAt: now });
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
  coverPhotoId: "00000000-0000-0000-0000-000000000010",
  coverPhotoExtra: ["00000000-0000-0000-0000-000000000011", "00000000-0000-0000-0000-000000000012"],
  backText: "Каждая страница — о тебе.",
  backLayout: "polaroids",
  backPhotoId: "00000000-0000-0000-0000-000000000010",
  backPhotoExtra: ["00000000-0000-0000-0000-000000000011"],
  photoFrames: {},
  dedication: "",
  interior: "classic",
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
const questions: BookQuestion[] = [];

describe("кадр фото при печати", () => {
  it("bakeFrame вырезает ту часть снимка, которую клиент поставил в рамку", async () => {
    const { bakeFrame } = await import("@/modules/production/infrastructure/pdf/frame");
    const src = await halves();
    // место 1:1, снимок 2:1, zoom 2 — окно 500×500 в снимке 2000×1000... слева: красное, справа: синее
    const left = await bakeFrame(src, 1, { zoom: 2, x: 0, y: 0.5 });
    const right = await bakeFrame(src, 1, { zoom: 2, x: 1, y: 0.5 });
    const center = await bakeFrame(src, 2, { zoom: 1, x: 0.5, y: 0.5 }); // без кадра по сути
    const l = await mean(left);
    const r = await mean(right);
    expect(l.r).toBeGreaterThan(200);
    expect(l.b).toBeLessThan(60);
    expect(r.b).toBeGreaterThan(200);
    expect(r.r).toBeLessThan(60);
    // окно: при пропорции 1:1 и zoom 2 это 500 px по высоте и ширине
    const meta = await sharp(left).metadata();
    expect(meta.width).toBe(meta.height);
    expect(meta.width).toBe(500);
    // кадр по умолчанию возвращает тот же буфер
    expect(await bakeFrame(src, 1, undefined)).toBe(src);
    expect((await mean(center)).r).toBeGreaterThan(100);
  });

  it("обложка с кадрами печатается, и рисунок отличается от обложки без кадров", async () => {
    const { renderCover } = await import("@/modules/production/infrastructure/pdf/render");
    const plain = await renderCover({ book, questions, photos }, 120, "preview", true);
    const framed = await renderCover({ book: { ...book, photoFrames: { "cover:0": { zoom: 3, x: 0, y: 0.2 }, "cover:1": { zoom: 2, x: 1, y: 0.5 }, "back:0": { zoom: 2.5, x: 0.1, y: 0.5 } } }, questions, photos }, 120, "preview", true);
    expect(plain.pdf.length).toBeGreaterThan(5000);
    expect(framed.pdf.length).toBeGreaterThan(5000);
    expect(Buffer.compare(plain.pdf, framed.pdf)).not.toBe(0);
    expect(framed.pdf.subarray(0, 4).toString()).toBe("%PDF");
  });
});
