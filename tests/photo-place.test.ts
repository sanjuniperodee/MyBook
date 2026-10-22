import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { formats } from "@/lib/book/formats";
import { getInteriorDesign, interiorDesigns } from "@/lib/book/interiors";
import { PHOTO_OFF_KEY } from "@/lib/book/layout";
import { GALLERY_KEY } from "@/lib/book/toc";
import { photoPlaceOf } from "@/lib/book/photo-place";
import { gridCellFrame, openerFrame, pageFrame } from "@/lib/book/photo-pages";
import { CONTAIN_LOSS, coverLoss, defaultPageFit, photoLosses, WARN_LOSS } from "@/lib/book/photo-loss";
import { suggestOpener } from "@/lib/book/opener-suggest";
import { layoutSignature } from "@/lib/book/layout-signature";
import { buildLayout, layoutBundle, layoutPhoto as photo } from "./fixtures/layout-books";

const a5 = formats.a5;
const square = formats.square;

describe("photoPlaceOf: одно место у каждого фото", () => {
  // Правила 2, оформление с фото главы: в ответе, фото главы, после главы (выбрано и само), альбом, «не печатается»,
  // глава без текста (ждёт), снимки обложки и оборота.
  const b = layoutBundle({
    chapters: ["a", "b"],
    photos: [
      photo("p0", 0, { questionId: "q-a" }),
      photo("p1", 1, { chapter: "a", opener: true }),
      photo("p2", 2, { chapter: "b" }),
      photo("p3", 3),
      photo("p4", 4, { chapter: GALLERY_KEY }),
      photo("p5", 5, { chapter: PHOTO_OFF_KEY }),
      photo("p6", 6, { chapter: "zz" }),
      photo("p7", 7),
      photo("p8", 8),
    ],
    book: { layoutRev: 2, coverPhotoId: "p7", backPhotoExtra: ["p8"], coverPhotoExtra: ["p0"] },
  });
  const places = (bundle = b) => photoPlaceOf(buildLayout(bundle), bundle.photos, bundle.book);

  it("каждому фото — место из собранной книги и снимков обложки", () => {
    expect(Object.fromEntries(places())).toEqual({
      p0: { kind: "answer", chapterKey: "a", questionId: "q-a", auto: false, onCover: "cover" },
      p1: { kind: "opener", chapterKey: "a", auto: false, onCover: null },
      p2: { kind: "after", chapterKey: "b", auto: false, onCover: null },
      p3: { kind: "after", chapterKey: "a", auto: true, onCover: null },
      p4: { kind: "album", auto: false, onCover: null },
      p5: { kind: "off", auto: false, onCover: null },
      p6: { kind: "after", chapterKey: "b", auto: true, waitingFor: "zz", onCover: null },
      p7: { kind: "off", auto: true, onCover: "cover" },
      p8: { kind: "off", auto: true, onCover: "back" },
    });
  });

  it("прежние правила: фото главы, поставленное само, — не выбор автора; снимок обложки в ответе не печатается", () => {
    const old = { ...b, book: { ...b.book, layoutRev: 1, coverPhotoId: "p0" } };
    const p = places(old);
    expect(p.get("p2")).toEqual({ kind: "opener", chapterKey: "b", auto: true, onCover: null });
    expect(p.get("p0")).toEqual({ kind: "off", questionId: "q-a", auto: true, onCover: "cover" });
  });

  it("«не печатать» фото вне историй: фото без места — не печатается по правилу книги, выбранные места — как были", () => {
    const p = places({ ...b, book: { ...b.book, photoPlacement: "none" } });
    expect(p.get("p3")).toEqual({ kind: "off", auto: true, onCover: null });
    expect(p.get("p6")).toEqual({ kind: "off", auto: true, waitingFor: "zz", onCover: null });
    expect(p.get("p4")).toMatchObject({ kind: "album", auto: false });
    expect(p.get("p2")).toMatchObject({ kind: "after", auto: false });
  });
});

describe("кадр места снимка — по геометрии PDF", () => {
  const ratio = (id: string, format = a5) => openerFrame(format, getInteriorDesign(id))?.ratio;

  it("A5: под обрез ≈ 1,37, во всю полосу ≈ 0,71, арка 1/1,3, круг 1, паспарту 1,25, полароид 1,15", () => {
    expect(ratio("photobook")).toBeCloseTo(1.37, 2);
    expect(ratio("cinema")).toBeCloseTo(0.71, 2);
    expect(ratio("arches")).toBeCloseTo(1 / 1.3, 4);
    expect(ratio("luna")).toBeCloseTo(1, 4);
    expect(ratio("gallery")).toBeCloseTo(1.25, 4);
    expect(ratio("memories")).toBeCloseTo(1.15, 4);
    expect(openerFrame(a5, getInteriorDesign("luna"))).toMatchObject({ kind: "circle", mask: "circle", card: false });
    expect(openerFrame(a5, getInteriorDesign("arches"))).toMatchObject({ kind: "arch", mask: "arch" });
    expect(openerFrame(a5, getInteriorDesign("memories"))).toMatchObject({ kind: "polaroid", mask: null, card: true });
  });

  it("квадрат: свои пропорции у снимков под обрез, форма окна — та же", () => {
    expect(ratio("photobook", square)).toBeCloseTo(206 / 107, 3);
    expect(ratio("cinema", square)).toBeCloseTo(1, 4);
    expect(ratio("arches", square)).toBeCloseTo(1 / 1.3, 4);
    expect(ratio("luna", square)).toBeCloseTo(1, 4);
  });

  it("фото главы есть ровно у шести оформлений; у остальных кадра нет", () => {
    expect(interiorDesigns.filter((d) => openerFrame(a5, d)).map((d) => d.id).sort()).toEqual(["arches", "cinema", "gallery", "luna", "memories", "photobook"]);
    expect(openerFrame(a5, getInteriorDesign("classic"))).toBeNull();
  });

  it("лист под обрез и ячейка сетки", () => {
    expect(pageFrame(a5)).toMatchObject({ kind: "page", w: 154, h: 216 });
    expect(pageFrame(square).ratio).toBe(1);
    for (const d of interiorDesigns) {
      const cell = gridCellFrame(a5, d);
      expect(cell.ratio, d.id).toBeGreaterThan(0.5);
      expect(cell.ratio, d.id).toBeLessThan(1.5);
      expect(cell.card, d.id).toBe(d.photos.frame === "polaroid");
    }
  });
});

describe("обрезка снимка на месте", () => {
  const landscape = { width: 1600, height: 1200 };
  const portrait = { width: 1200, height: 1600 };

  it("доля срезанного при заполнении кадра", () => {
    expect(coverLoss(landscape, 4 / 3)).toBeCloseTo(0, 6);
    expect(coverLoss(landscape, pageFrame(a5).ratio)).toBeCloseTo(1 - pageFrame(a5).ratio / (4 / 3), 6);
    expect(coverLoss(portrait, pageFrame(a5).ratio)).toBeLessThan(CONTAIN_LOSS);
    expect(WARN_LOSS).toBeGreaterThan(CONTAIN_LOSS);
  });

  it("фото на всю страницу: заметная обрезка — «целиком», иначе заполнить лист", () => {
    expect(defaultPageFit(landscape, a5)).toBe("contain");
    expect(defaultPageFit(portrait, a5)).toBeUndefined();
    expect(defaultPageFit(landscape, square)).toBe("contain");
    expect(defaultPageFit({ width: 1500, height: 1500 }, square)).toBeUndefined();
  });

  it("по месту: на всю страницу и под обрез — по листу, в ответе и «целиком» — 0, остальное вписано целиком", () => {
    const inline = { width: 100, align: "center" as const, anchor: null, aspect: "original" as const, focusX: 0.5, focusY: 0.5, frame: "none" as const };
    const b = layoutBundle({
      chapters: ["a"],
      photos: [
        photo("page", 0, { ...landscape, questionId: "q-a", inline: { ...inline, page: true } }),
        photo("whole", 1, { ...landscape, questionId: "q-a", inline: { ...inline, page: true, pageFit: "contain" } }),
        photo("text", 2, { ...landscape, questionId: "q-a", inline }),
        photo("bleed", 3, { ...landscape, layout: "bleed" }),
        photo("full", 4, { ...landscape, layout: "full" }),
      ],
      book: { interior: "classic", layoutRev: 2 },
    });
    const loss = photoLosses(buildLayout(b));
    expect(loss.get("page")).toBeCloseTo(coverLoss(landscape, pageFrame(a5).ratio), 6);
    expect(loss.get("page")).toBeGreaterThan(WARN_LOSS);
    expect(loss.get("bleed")).toBeCloseTo(coverLoss(landscape, pageFrame(a5).ratio), 6);
    expect([loss.get("whole"), loss.get("text"), loss.get("full")]).toEqual([0, 0, 0]);
  });

  it("сетка — по ячейке на своей странице, как в PDF: четыре снимка, два, один (вписан целиком)", () => {
    const design = getInteriorDesign("classic");
    const wide = { width: 1800, height: 1200, layout: "grid" as const };
    const grid = (n: number) => layoutBundle({ chapters: ["a"], photos: Array.from({ length: n }, (_, i) => photo(`g${i}`, i, wide)), book: { interior: "classic", layoutRev: 2 } });
    // Четыре снимка — ячейки 2×2 (gridCellFrame): широкий кадр режется заметно.
    expect(photoLosses(buildLayout(grid(4))).get("g0")).toBeCloseTo(coverLoss(wide, gridCellFrame(a5, design).ratio), 6);
    expect(photoLosses(buildLayout(grid(4))).get("g0")).toBeGreaterThan(WARN_LOSS);
    // Два широких — одна над другой, во всю ширину: почти без обрезки, предупреждать не о чем.
    expect(photoLosses(buildLayout(grid(2))).get("g0")).toBeLessThan(CONTAIN_LOSS);
    // Пятый снимок один на своей странице — вписан целиком.
    expect(photoLosses(buildLayout(grid(5))).get("g4")).toBe(0);
  });
});

describe("подсказка фото главы", () => {
  const frame = openerFrame(a5, getInteriorDesign("photobook"))!;

  it("по порядку: уже после этой главы, без места, с местом в другом месте, из ответа, только с обложки; фото глав не предлагаются", () => {
    const b = layoutBundle({
      chapters: ["a", "b"],
      photos: [photo("p0", 0), photo("p1", 1), photo("p2", 2, { chapter: "b" }), photo("p3", 3, { questionId: "q-a" }), photo("p4", 4), photo("p5", 5, { chapter: "b", opener: true })],
      book: { layoutRev: 2, coverPhotoId: "p4" },
    });
    const ranked = suggestOpener(buildLayout(b), b.photos, frame, "a", b.book);
    expect(ranked.map((c) => [c.id, c.tier])).toEqual([
      ["p0", 0],
      ["p1", 1],
      ["p2", 2],
      ["p3", 3],
      ["p4", 4],
    ]);
  });

  it("внутри одного ряда — пропорции к кадру, потом чёткость, потом порядок", () => {
    const b = layoutBundle({
      chapters: ["a"],
      photos: [photo("small", 0, { width: 400, height: 300 }), photo("tall", 1, { width: 1200, height: 1600 }), photo("wide", 2, { width: 1600, height: 1200 }), photo("wide2", 3, { width: 1600, height: 1200 })],
      book: { layoutRev: 2 },
    });
    const ranked = suggestOpener(buildLayout(b), b.photos, frame, "a", b.book);
    expect(ranked.map((c) => c.id)).toEqual(["wide", "wide2", "small", "tall"]);
    expect(ranked.find((c) => c.id === "small")).toMatchObject({ sharp: false });
  });
});

describe("подпись вёрстки", () => {
  it("не видит пометок мест (глава, фото начала), видит само место фото", () => {
    const b = layoutBundle({ chapters: ["a", "b"], photos: [photo("p0", 0)], book: { interior: "classic" } });
    const base = layoutSignature(buildLayout(b));
    const pinnedWhereItWas = b.photos.map((p) => (p.id === "p0" ? { ...p, chapter: "a", opener: true } : p));
    expect(JSON.stringify(buildLayout(b, pinnedWhereItWas))).not.toBe(JSON.stringify(buildLayout(b)));
    expect(layoutSignature(buildLayout(b, pinnedWhereItWas))).toBe(base);
    const moved = b.photos.map((p) => (p.id === "p0" ? { ...p, chapter: "b" } : p));
    expect(layoutSignature(buildLayout(b, moved))).not.toBe(base);
  });
});

describe("служебные ключи мест знает только сборка", () => {
  it("в src/components и src/app нет строк «__gallery» и «__off»: места фото читаются через photoPlaceOf", () => {
    const root = path.join(__dirname, "..", "src");
    const found = ["components", "app"].flatMap((dir) =>
      readdirSync(path.join(root, dir), { recursive: true, encoding: "utf8" })
        .filter((f) => /\.tsx?$/.test(f))
        .filter((f) => /["'`]__(gallery|off)["'`]/.test(readFileSync(path.join(root, dir, f), "utf8")))
        .map((f) => `${dir}/${f}`),
    );
    expect(found).toEqual([]);
  });
});
