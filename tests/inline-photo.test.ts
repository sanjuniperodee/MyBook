import { describe, expect, it } from "vitest";
import { cropRect, framedBox, inlineBox, layoutInline, normalizeStyle, objectPosition } from "@/lib/book/inline-photo";
import { estimateAnswerPages } from "@/lib/book/layout";
import { getFormat } from "@/lib/book/formats";
import { getInteriorDesign } from "@/lib/book/interiors";

const land = { width: 4000, height: 3000 };

describe("inline photo geometry", () => {
  it("normalizes and clamps style", () => {
    const s = normalizeStyle({ width: 5, focusX: 3, focusY: -1 });
    expect(s.width).toBe(25);
    expect(s.focusX).toBe(1);
    expect(s.focusY).toBe(0);
    expect(normalizeStyle(null).width).toBe(100);
  });

  it("box keeps width share and caps height", () => {
    const b = inlineBox(land, normalizeStyle({ width: 50 }), 100, 160);
    expect(b.w).toBeCloseTo(50);
    expect(b.h).toBeCloseTo(37.5);
    const tall = inlineBox({ width: 1000, height: 3000 }, normalizeStyle({}), 100, 160);
    expect(tall.h).toBeCloseTo(128); // 80% высоты текста
    expect(tall.w).toBeCloseTo(128 / 3);
  });

  it("crop follows the focus point and stays inside the image", () => {
    const left = cropRect(land, normalizeStyle({ aspect: "1:1", focusX: 0 }));
    expect(left).toEqual({ left: 0, top: 0, width: 3000, height: 3000 });
    const right = cropRect(land, normalizeStyle({ aspect: "1:1", focusX: 1 }));
    expect(right.left).toBe(1000);
    expect(objectPosition(land, normalizeStyle({ aspect: "1:1", focusX: 1 }))).toBe("100.0% 50.0%");
    const wide = cropRect(land, normalizeStyle({ aspect: "16:9", focusY: 0.5 }));
    expect(wide.width).toBe(4000);
    expect(wide.height).toBe(2250);
    expect(wide.top).toBe(375);
  });

  it("narrow photos at one anchor share a row", () => {
    const mk = (id: string, width: number, anchor: number | null) => ({ id, style: normalizeStyle({ width, anchor }) });
    const res = layoutInline([mk("a", 50, 0), mk("b", 45, 0), mk("c", 100, 0), mk("d", 40, null), mk("e", 40, 9)], 3);
    expect(res.get(0)!.map((r) => r.map((x) => x.id))).toEqual([["a", "b"], ["c"]]);
    // якорь за последним абзацем = конец ответа
    expect(res.get(Number.POSITIVE_INFINITY)!.map((r) => r.map((x) => x.id))).toEqual([["d", "e"]]);
  });

  it("polaroid adds a bottom band, rows subtract gaps", () => {
    const s = normalizeStyle({ width: 50, frame: "polaroid" });
    const f = framedBox(land, s, 100, 160);
    expect(f.outerH).toBeGreaterThan(f.imgH + f.pad);
    expect(f.imgW).toBeLessThan(f.outerW);
    const single = framedBox(land, normalizeStyle({ width: 50 }), 100, 160, 1);
    const inRow = framedBox(land, normalizeStyle({ width: 50 }), 100, 160, 2);
    expect(inRow.outerW).toBeLessThan(single.outerW);
  });

  it("smaller photos take fewer pages", () => {
    const f = getFormat("a5");
    const t = getInteriorDesign("classic").type;
    const big = estimateAnswerPages(null, "Текст", f, t, [{ ...land, inline: normalizeStyle({ width: 100 }) }]);
    const small = estimateAnswerPages(null, "Текст", f, t, [{ ...land, inline: normalizeStyle({ width: 40 }) }]);
    const pair = estimateAnswerPages(null, "Текст", f, t, [
      { ...land, inline: normalizeStyle({ width: 45 }) },
      { ...land, inline: normalizeStyle({ width: 45 }) },
    ]);
    expect(small).toBeLessThan(big);
    expect(pair).toBeLessThan(small * 2);
  });
});
