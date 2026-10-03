import { describe, expect, it } from "vitest";
import { formats, print, spineWidthMm } from "@/lib/book/formats";
import { BOARD_MM, bookDims, faceLight, FACE_NORMALS, modelExtent, rotateNormal, shadeOpacity, shortestDelta, spineFontMm, VIEWS, type FaceId } from "@/lib/book/book-model";

describe("bookDims", () => {
  it("толщина берётся из печатных параметров: корешок = блок + картон", () => {
    for (const pages of [24, 60, 120]) {
      const d = bookDims(formats.a5, pages);
      expect(d.d).toBe(spineWidthMm(pages));
      expect(d.block.d).toBeCloseTo(pages / 2 * print.sheetThicknessMm, 1);
      expect(d.block.d + BOARD_MM * 2).toBeCloseTo(d.d, 1);
    }
  });

  it("крышки выступают над блоком на кант, блок равен обрезному формату", () => {
    const d = bookDims(formats.square, 40);
    expect(d.w - d.block.w).toBe(print.cover.boardOverhangMm);
    expect(d.h - d.block.h).toBe(print.cover.boardOverhangMm * 2);
    expect(d.block.w).toBe(200);
  });

  it("чем больше страниц, тем толще книга", () => {
    expect(bookDims(formats.a5, 200).d).toBeGreaterThan(bookDims(formats.a5, 24).d);
    expect(modelExtent(bookDims(formats.a5, 200))).toBeGreaterThan(modelExtent(bookDims(formats.a5, 24)));
  });
});

describe("поворот и свет", () => {
  const faces = Object.keys(FACE_NORMALS) as FaceId[];

  it("каждый ракурс обращает свою сторону к зрителю (нормаль → +z)", () => {
    const toFace: Record<keyof typeof VIEWS, FaceId> = { front: "front", spine: "spine", back: "back", edge: "edge", top: "top", bottom: "bottom" };
    for (const [view, face] of Object.entries(toFace)) {
      const n = rotateNormal(FACE_NORMALS[face], VIEWS[view as keyof typeof VIEWS]);
      expect(n[2]).toBeCloseTo(1, 6);
    }
  });

  it("поворот сохраняет длину нормали", () => {
    for (const f of faces) {
      const n = rotateNormal(FACE_NORMALS[f], { rx: -37, ry: 123 });
      expect(Math.hypot(...n)).toBeCloseTo(1, 6);
    }
  });

  it("освещённость в пределах 0.5…1, лицом к зрителю светлее, чем отвёрнутая сторона", () => {
    for (const f of faces) {
      const l = faceLight(f, { rx: -14, ry: 28 });
      expect(l).toBeGreaterThanOrEqual(0.5);
      expect(l).toBeLessThanOrEqual(1);
    }
    expect(faceLight("front", VIEWS.front)).toBeGreaterThan(faceLight("back", VIEWS.front));
    expect(shadeOpacity(1)).toBe(0);
    expect(shadeOpacity(0.5)).toBeGreaterThan(0);
  });

  it("shortestDelta идёт кратчайшим путём через 360°", () => {
    expect(shortestDelta(350, 10)).toBe(20);
    expect(shortestDelta(10, 350)).toBe(-20);
    expect(shortestDelta(0, 180)).toBe(-180);
    expect(shortestDelta(725, 0)).toBe(-5);
    expect(shortestDelta(-90, 90)).toBe(-180);
  });
});

describe("надпись на корешке", () => {
  it("на узком корешке (< 5 мм) надписи нет, на широком — не крупнее 11 pt", () => {
    expect(spineFontMm(4.9)).toBeNull();
    expect(spineFontMm(8)).toBeCloseTo(8 * 0.42, 5);
    expect(spineFontMm(40)).toBeCloseTo((11 * 25.4) / 72, 5);
  });
});
