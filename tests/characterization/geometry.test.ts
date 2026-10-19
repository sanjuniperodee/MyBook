import { describe, expect, it } from "vitest";
import { formats, type BookFormat, type FormatId } from "@/lib/book/formats";
import { interiorDesigns, type InteriorDesign } from "@/lib/book/interiors";
import { textMetrics } from "@/lib/book/estimate";
import { openerFlow, textArea } from "@/lib/book/page-geometry";

/** Характеристика геометрии полосы: полоса набора, начальная полоса главы и метрики оценки объёма — все форматы × оформления. */

const formatIds = Object.keys(formats) as FormatId[];

/** Значение для каждого формата × оформления — строкой: по строке на оформление в снимке. */
const byFormatAndDesign = (fn: (format: BookFormat, design: InteriorDesign) => string) =>
  Object.fromEntries(formatIds.map((id) => [id, Object.fromEntries(interiorDesigns.map((d) => [d.id, fn(formats[id], d)]))]));

describe("геометрия полосы", () => {
  it("textArea зависит только от формата: обрезной формат минус поля, мм", () => {
    expect(Object.fromEntries(formatIds.map((id) => [id, textArea(formats[id])]))).toEqual({ a5: { w: 114, h: 172 }, square: { w: 154, h: 154 } });
  });

  it("openerFlow: где начинается блок названия главы (мм от обреза) и масштаб картинок относительно A5", () => {
    expect(
      byFormatAndDesign((f, d) => {
        const { top, k } = openerFlow(f, d);
        return `top ${top} · k ${k}`;
      }),
    ).toMatchSnapshot();
  });

  it("textMetrics: строка основного текста, кегли и полоса набора, pt — основа estimatePages", () => {
    expect(
      byFormatAndDesign((f, d) => {
        const m = textMetrics(f, d);
        return `строка ${m.line.toFixed(2)} · кегль ${m.sizes.body.toFixed(2)} / заголовок ${m.sizes.heading.toFixed(2)} · полоса ${m.width.toFixed(1)}×${m.height.toFixed(1)}`;
      }),
    ).toMatchSnapshot();
  });
});
