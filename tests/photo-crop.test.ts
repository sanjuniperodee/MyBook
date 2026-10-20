import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildBookContent } from "@/lib/book/book-content";
import { mm, print } from "@/lib/book/formats";
import { toPhotoItem } from "@/lib/book/layout";
import { cropOr, normalizeCrop, rotateCrop } from "@/lib/book/photo-crop";
import { Photo } from "@/modules/authoring/domain/Photo";
import { fixtureBook } from "./fixtures/books";
import { photoNames, useFixtureStorage } from "./fixtures/photos";
import { grayPage, hasTool } from "./pdf-inspect";

// Кадр фото автора: точка и приближение — в домене, в содержимом книги и в PDF (снимок начала главы).

describe("кадр фото: правила", () => {
  it("пределы, запасное правило места и поворот вместе со снимком", () => {
    expect(normalizeCrop({ x: 2, y: -1, zoom: 9 })).toEqual({ x: 1, y: 0, zoom: 3 });
    expect(normalizeCrop({ x: 0.5, y: 0.5, zoom: 1 })).toEqual({ x: 0.5, y: 0.5, zoom: 1 });
    expect(normalizeCrop(null)).toBeNull();
    expect(cropOr(null, { x: 0.5, y: 0.3 })).toEqual({ x: 0.5, y: 0.3, zoom: 1 });
    const r = rotateCrop({ x: 0.2, y: 0.7, zoom: 2 })!;
    expect([r.x, r.y, r.zoom].map((v) => Math.round(v * 100) / 100)).toEqual([0.3, 0.2, 2]);
  });

  it("домен: кадр нормализуется, «как было» — null; поворот поворачивает точку", () => {
    const p = Photo.restore("p1", { bookId: "b", position: 0, storageKey: "k", thumbKey: "t", width: 400, height: 300, caption: "", layout: "full", questionId: null, inline: null, crop: null });
    p.update({ crop: { x: 0.9, y: 0.1, zoom: 5 } });
    p.rotated({ storageKey: "k2", thumbKey: "t2" });
    expect(p.snapshot().crop).toEqual({ x: 0.9, y: 0.9, zoom: 3 });
    p.update({ crop: null });
    expect(p.snapshot().crop).toBeNull();
  });
});

const rasterless = !hasTool("pdftoppm");
const dir = mkdtempSync(path.join(tmpdir(), "mybook-crop-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));
let render: typeof import("@/modules/production/infrastructure/pdf/render");
beforeAll(async () => {
  await useFixtureStorage(undefined, photoNames);
  render = await import("@/modules/production/infrastructure/pdf/render");
});

describe.skipIf(rasterless)("PDF: кадр снимка начала главы (оформление «Ай», круг)", () => {
  it("свой кадр меняет снимок на начальной полосе, без кадра — прежний", async () => {
    const fb = fixtureBook("luna", "a5", "ru");
    const content = buildBookContent(fb.bundle.book, fb.bundle.questions, fb.bundle.photos.map(toPhotoItem), [], 2026, fb.bundle.letters);
    const opener = content.chapters.find((c) => c.openerPhoto)!.openerPhoto!;
    const pageOf = async (crop: { x: number; y: number; zoom: number } | null, name: string) => {
      const photos = fb.bundle.photos.map((p) => (p.id === opener.id ? { ...p, crop } : p));
      const res = await render.renderInterior({ ...fb.bundle, photos }, "print");
      const file = path.join(dir, `${name}.pdf`);
      writeFileSync(file, res.pdf);
      return { file, pages: res.chapterPages };
    };
    const plain = await pageOf(null, "plain");
    const framed = await pageOf({ x: 0.1, y: 0.9, zoom: 3 }, "framed");
    const key = content.chapters.find((c) => c.openerPhoto?.id === opener.id)!.key;
    const sheet = { width: mm(content.format.widthMm + print.bleedMm * 2), height: mm(content.format.heightMm + print.bleedMm * 2) };
    const a = grayPage(plain.file, plain.pages[key], 30, sheet).data;
    const b = grayPage(framed.file, framed.pages[key], 30, sheet).data;
    let diff = 0;
    for (let i = 0; i < Math.min(a.length, b.length); i++) diff += Math.abs(a[i] - b[i]);
    expect(diff / a.length).toBeGreaterThan(1);
  }, 120_000);
});
