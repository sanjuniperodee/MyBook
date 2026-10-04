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

  it("освещённость в пределах 0.55…1, лицом к зрителю светлее, чем отвёрнутая сторона", () => {
    for (const f of faces) {
      const l = faceLight(f, { rx: -14, ry: 28 });
      expect(l).toBeGreaterThanOrEqual(0.55);
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

import { fitScale, leafAngle, leafZ, pileState, READ_VIEW, openExtent } from "@/lib/book/book-model";

describe("листы и стопки", () => {
  it("угол листа: 0 справа, 180 слева, плавно между", () => {
    expect(leafAngle(0, 0)).toBe(0);
    expect(leafAngle(0.5, 0)).toBe(90);
    expect(leafAngle(3, 0)).toBe(180);
    expect(leafAngle(3, 5)).toBe(0);
  });

  it("листы блока лежат друг над другом внутри блока, первый — сверху", () => {
    const d = 6;
    const zs = [1, 2, 3, 4].map((i) => leafZ(i, 4, d));
    expect(zs[0]).toBeLessThan(d / 2);
    expect(zs[3]).toBeGreaterThan(-d / 2);
    expect([...zs].sort((a, b) => b - a)).toEqual(zs);
  });

  it("закрытая книга — вся в правой стопке, раскрытая до конца — вся в левой", () => {
    const closed = pileState(0, 10, 6);
    expect(closed).toMatchObject({ right: 10, left: 0, rightScale: 1 });
    expect(closed.rightZ).toBeCloseTo(0, 6);
    const end = pileState(11, 10, 6);
    expect(end).toMatchObject({ right: 0, left: 10, leftScale: 1 });
    expect(end.leftZ).toBeCloseTo(0, 6);
  });

  it("лист переходит в левую стопку после 90°, число листов сохраняется", () => {
    for (let pos = 0; pos <= 11; pos += 0.25) {
      const p = pileState(pos, 10, 6);
      expect(p.left + p.right).toBe(10);
    }
    // лист 1 повёрнут ровно на 90° при pos = 1.5: ещё справа; чуть дальше — уже слева
    expect(pileState(1.5, 10, 6).left).toBe(0);
    expect(pileState(1.51, 10, 6).left).toBe(1);
  });

  it("стопки лежат на столе: нижняя кромка постоянна и равна −blockDepth/2", () => {
    for (const pos of [0, 1.7, 5, 9.2, 11]) {
      const p = pileState(pos, 10, 6);
      const bottomRight = p.rightZ - (6 * (p.right / 10)) / 2;
      const bottomLeft = p.leftZ - (6 * (p.left / 10)) / 2;
      if (p.right) expect(bottomRight).toBeCloseTo(-3, 6);
      if (p.left) expect(bottomLeft).toBeCloseTo(-3, 6);
    }
  });

  it("раскрытая книга шире закрытой, масштаб ужимается до нужного и не увеличивает", () => {
    const d = bookDims(formats.a5, 96);
    expect(openExtent(d)).toBeGreaterThan(modelExtent(d));
    expect(fitScale(d, 0)).toBe(1);
    expect(fitScale(d, 1)).toBeLessThan(1);
    expect(fitScale(d, 1)).toBeCloseTo(modelExtent(d) / openExtent(d), 6);
    expect(READ_VIEW.rx).toBeLessThan(0);
  });

  it("освещённость учитывает поворот листа: перевёрнутая лицевая сторона смотрит как обратная", () => {
    const o = { rx: 0, ry: 0 };
    expect(faceLight("front", o, 180)).toBeCloseTo(faceLight("back", o, 0), 6);
    expect(faceLight("front", o, 0)).toBeGreaterThan(faceLight("front", o, 180));
  });
});

import { windowPiles } from "@/lib/book/book-model";

describe("стопки вокруг окна листов", () => {
  const M = 40;
  const Db = 6;
  const t = Db / M;

  it("закрытая книга — одна стопка на всю толщину, листы не рисуются", () => {
    const w = windowPiles(0, M, Db, 3);
    expect(w.right).toEqual({ count: M, top: Db / 2 });
    expect(w.left.count).toBe(0);
    expect(w.last).toBeLessThan(w.first);
  });

  it("листы окна и две стопки вместе дают все листы блока при любой позиции", () => {
    for (let pos = 0.01; pos <= M + 1; pos += 0.37) {
      const w = windowPiles(pos, M, Db, 3);
      const inWindow = Math.max(0, w.last - w.first + 1);
      expect(w.right.count + w.left.count + inWindow).toBe(M);
    }
  });

  it("верх стопки лежит ниже нижнего отрисованного листа — не перекрывает текст", () => {
    for (const pos of [0.5, 1.4, 7.2, 20, 39.6, 41]) {
      const w = windowPiles(pos, M, Db, 3);
      if (w.right.count && w.last >= w.first) {
        const lowestRightLeaf = Db / 2 - (w.last - 0.5) * t; // z листа
        expect(w.right.top).toBeLessThan(lowestRightLeaf);
      }
      if (w.left.count && w.last >= w.first) {
        const lowestLeftLeaf = -(Db / 2 - (w.first - 0.5) * t); // зеркальный z перевёрнутого листа
        expect(w.left.top).toBeLessThan(lowestLeftLeaf);
      }
    }
  });

  it("в конце книги правая стопка пуста, в начале (сразу после открытия) пуста левая", () => {
    expect(windowPiles(M + 1, M, Db, 3).right.count).toBe(0);
    expect(windowPiles(1, M, Db, 3).left.count).toBe(0);
  });
});

import { APERTURE, apertureDegrees, clampAperture, spineFold } from "@/lib/book/book-model";

describe("раскрытие и корешок", () => {
  it("угол раскрытия ограничен и переводится в градусы", () => {
    expect(clampAperture(0)).toBe(APERTURE.min);
    expect(clampAperture(5)).toBe(APERTURE.max);
    expect(apertureDegrees(1)).toBe(180);
    expect(apertureDegrees(0.5)).toBe(90);
    expect(apertureDegrees(APERTURE.default)).toBe(167);
  });

  it("корешок стоит у закрытой книги и складывается назад по мере раскрытия", () => {
    expect(spineFold(0, 1)).toBe(0);
    expect(spineFold(1, 1)).toBeCloseTo(Math.PI / 2, 9);
    expect(spineFold(0.5, 1)).toBeCloseTo(Math.PI / 4, 9);
    // книга «домиком» складывает корешок меньше
    expect(spineFold(1, 0.5)).toBeCloseTo(Math.PI / 4, 9);
    expect(spineFold(2, 1)).toBeCloseTo(Math.PI / 2, 9);
  });
});
