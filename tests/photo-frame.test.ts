import { describe, expect, it } from "vitest";
import { cssFrame, DEFAULT_FRAME, framedImageRect, isDefaultFrame, MAX_ZOOM, normalizeFrame, panFrame, panRange, parseFrames, zoomFrame } from "@/lib/book/photo-frame";

const box = { x: 10, y: 20, w: 100, h: 100 };
const wide = { width: 4000, height: 2000 }; // 2:1 — в квадрат вписывается по высоте, по бокам лишнее

describe("кадр фото на обложке", () => {
  it("без кадра: снимок заполняет место по центру (как cover)", () => {
    const r = framedImageRect(box, wide, DEFAULT_FRAME);
    expect(r.h).toBeCloseTo(100);
    expect(r.w).toBeCloseTo(200);
    expect(r.x).toBeCloseTo(10 - 50); // центр: 50 слева и 50 справа выходит за место
    expect(r.y).toBeCloseTo(20);
  });

  it("положение: 0 — прижат к левому краю, 1 — к правому", () => {
    expect(framedImageRect(box, wide, { zoom: 1, x: 0, y: 0.5 }).x).toBeCloseTo(10);
    expect(framedImageRect(box, wide, { zoom: 1, x: 1, y: 0.5 }).x + framedImageRect(box, wide, { zoom: 1, x: 1, y: 0.5 }).w).toBeCloseTo(110);
  });

  it("масштаб увеличивает снимок и всегда перекрывает место целиком", () => {
    for (const zoom of [1, 1.5, 2.7, MAX_ZOOM]) {
      for (const x of [0, 0.3, 1]) {
        for (const y of [0, 0.5, 1]) {
          const r = framedImageRect(box, wide, { zoom, x, y });
          expect(r.x).toBeLessThanOrEqual(box.x + 1e-6);
          expect(r.y).toBeLessThanOrEqual(box.y + 1e-6);
          expect(r.x + r.w).toBeGreaterThanOrEqual(box.x + box.w - 1e-6);
          expect(r.y + r.h).toBeGreaterThanOrEqual(box.y + box.h - 1e-6);
        }
      }
    }
    expect(framedImageRect(box, wide, { zoom: 2, x: 0.5, y: 0.5 }).h).toBeCloseTo(200);
  });

  it("числа ограничиваются, мусор заменяется значениями по умолчанию", () => {
    expect(normalizeFrame({ zoom: 99, x: -5, y: 7 })).toEqual({ zoom: MAX_ZOOM, x: 0, y: 1 });
    expect(normalizeFrame({ zoom: 0.2 })).toEqual({ zoom: 1, x: 0.5, y: 0.5 });
    expect(normalizeFrame(null)).toEqual(DEFAULT_FRAME);
    expect(normalizeFrame({ zoom: "2", x: NaN })).toEqual(DEFAULT_FRAME);
  });

  it("из запроса принимаются только известные ключи, кадры по умолчанию не хранятся", () => {
    const parsed = parseFrames({ "cover:0": { zoom: 2, x: 0.2, y: 0.9 }, "back:1": { zoom: 1, x: 0.5, y: 0.5 }, "evil:0": { zoom: 2 }, "cover:999": { zoom: 2 }, "cover:x": {} });
    expect(parsed).toEqual({ "cover:0": { zoom: 2, x: 0.2, y: 0.9 } });
    expect(parseFrames("строка")).toEqual({});
    expect(isDefaultFrame(DEFAULT_FRAME)).toBe(true);
    expect(isDefaultFrame({ zoom: 1.1, x: 0.5, y: 0.5 })).toBe(false);
  });

  it("перетаскивание: снимок едет за пальцем и не выходит за край", () => {
    const px = { w: 200, h: 200 };
    // квадрат 200×200, снимок 2:1 при zoom 1: лишних 200 px по ширине
    expect(panRange(px, wide, 1)).toEqual({ x: 200, y: 0 });
    const right = panFrame(DEFAULT_FRAME, px, wide, 50, 30); // потянули вправо → видим левее → x уменьшается
    expect(right.x).toBeCloseTo(0.25);
    expect(right.y).toBe(0.5); // по вертикали лишнего нет — не двигается
    expect(panFrame(DEFAULT_FRAME, px, wide, 10_000, 0).x).toBe(0);
    expect(panFrame(DEFAULT_FRAME, px, wide, -10_000, 0).x).toBe(1);
    const zoomed = panFrame({ zoom: 2, x: 0.5, y: 0.5 }, px, wide, 0, 100);
    expect(zoomed.y).toBeLessThan(0.5);
  });

  it("масштаб не меняет положение", () => {
    expect(zoomFrame({ zoom: 1, x: 0.2, y: 0.8 }, 2.5)).toEqual({ zoom: 2.5, x: 0.2, y: 0.8 });
    expect(zoomFrame(DEFAULT_FRAME, 50).zoom).toBe(MAX_ZOOM);
  });

  it("HTML и SVG рисуют одно и то же: scale вокруг точки равен смещению по object-position", () => {
    // CSS: object-fit cover даёт размер w0×h0 и смещение (W − w0)·p; scale(z) вокруг p·W переводит это в (W − w0·z)·p
    const W = 150;
    const w0 = 300;
    const p = 0.3;
    const z = 2.2;
    const offset0 = (W - w0) * p;
    const origin = p * W;
    const css = origin - (origin - offset0) * z;
    const svg = (W - w0 * z) * p;
    expect(css).toBeCloseTo(svg);
    expect(cssFrame({ zoom: 2, x: 0.25, y: 0.75 })).toEqual({ objectPosition: "25% 75%", transform: "scale(2)", transformOrigin: "25% 75%" });
    expect(cssFrame(DEFAULT_FRAME)).toEqual({});
  });
});
