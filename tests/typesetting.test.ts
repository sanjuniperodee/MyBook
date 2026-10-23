import { describe, expect, it } from "vitest";
import { formats } from "@/lib/book/formats";
import { interiorDesigns } from "@/lib/book/interiors";
import { folioBottom, interiorSizes, photoCaptionFace, photoCaptionSize, runningHeadTop, runningRuleTop } from "@/lib/book/typesetting";

describe("спецификация набора", () => {
  it("подпись к снимку: начертание, интерлиньяж, цвет и кегль — по design.photos.caption", () => {
    for (const d of interiorDesigns) {
      const S = interiorSizes(d, 1);
      const face = photoCaptionFace(d);
      if (d.photos.captionFace) {
        // Своё начертание подписи (дизайнер): им и набирается, цветом подписей.
        expect(face).toEqual({ face: d.photos.captionFace, label: false, lineHeight: 1.3, color: d.palette.muted });
      } else if (d.photos.caption === "hand") {
        expect(face).toEqual({ face: { font: "caveat", weight: 500 }, label: false, lineHeight: 1.15, color: d.palette.ink });
        expect(photoCaptionSize(d, S)).toBe(S.caption * 1.5);
      } else if (d.photos.caption === "label") {
        expect(face).toEqual({ face: d.label, label: true, lineHeight: 1.3, color: d.palette.muted });
        expect(photoCaptionSize(d, S)).toBe(S.caption * 0.8);
      } else {
        expect(face).toEqual({ face: { font: d.type.body, weight: 400, italic: true }, label: false, lineHeight: 1.3, color: d.palette.muted });
        expect(photoCaptionSize(d, S)).toBe(S.caption);
      }
    }
  });

  it("колонтитул, его линейка и колонцифра — от обреза по долям полей, мм", () => {
    expect(runningHeadTop(formats.a5)).toBe(17 * 0.36);
    expect(runningRuleTop(formats.a5)).toBe(17 * 0.62);
    expect(folioBottom(formats.a5)).toBe(21 / 2 - 2);
    expect(runningHeadTop(formats.square)).toBe(22 * 0.36);
    expect(folioBottom(formats.square)).toBe(24 / 2 - 2);
  });
});
