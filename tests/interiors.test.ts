import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { messagesFor } from "@/i18n/messages";
import { coverTemplates } from "@/lib/book/covers";
import { formats } from "@/lib/book/formats";
import { openerFlow, pageBox } from "@/lib/book/layout";
import { dividerDrawing, frameShapes, openerArtShapes, vignetteDrawing, type Shape } from "@/lib/book/interior-art";
import {
  chapterMark,
  DEFAULT_INTERIOR,
  getInteriorDesign,
  interiorDesigns,
  interiorMoods,
  interiorsForCover,
  isInteriorId,
  romanNumeral,
  splitLeadIn,
} from "@/lib/book/interiors";

/** Минимальный сериализатор фигур в SVG — проверяем, что графика валидна и растрируется. */
function toSvg(shapes: Shape[], w: number, h: number) {
  const attrs = (o: Record<string, unknown>) =>
    Object.entries(o)
      .filter(([, v]) => v !== undefined)
      .map(([k, v]) => `${k}="${v}"`)
      .join(" ");
  const body = shapes
    .map((s) =>
      s.kind === "circle"
        ? `<circle ${attrs({ cx: s.cx, cy: s.cy, r: s.r, fill: s.fill, "fill-opacity": s.opacity })}/>`
        : s.kind === "rect"
          ? `<rect ${attrs({ x: s.x, y: s.y, width: s.w, height: s.h, fill: s.fill ?? "none", stroke: s.stroke, "stroke-width": s.width })}/>`
          : `<path ${attrs({ d: s.d, fill: s.fill ?? "none", stroke: s.stroke, "stroke-width": s.width, transform: s.transform })}/>`,
    )
    .join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${Math.round(w * 2)}" height="${Math.round(h * 2)}">${body}</svg>`;
}

describe("оформление страниц: каталог", () => {
  it("уникальные id, известное настроение и названия на обоих языках", () => {
    const ids = interiorDesigns.map((d) => d.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.length).toBeGreaterThanOrEqual(10);
    for (const d of interiorDesigns) {
      expect(interiorMoods).toContain(d.mood);
      for (const locale of ["ru", "kk"] as const) {
        const name = messagesFor(locale).catalog.interiors[d.id];
        expect(name?.name, `${locale}: ${d.id}`).toBeTruthy();
        expect(name?.description, `${locale}: ${d.id}`).toBeTruthy();
      }
    }
    for (const mood of interiorMoods) expect(interiorDesigns.some((d) => d.mood === mood), mood).toBe(true);
  });

  it("прежние стили вёрстки не меняются — заказанные книги печатаются так, как их видели в макете", () => {
    const legacy = {
      opener: { align: "center", number: "label", titleSize: 26, top: 0.3 },
      heading: { align: "left", size: 1.55 },
      ornament: "diamond",
      divider: "stars",
      leadIn: false,
      folio: { align: "center" },
      runningHead: "none",
      frame: "none",
      palette: { ink: "#1F1A17", muted: "#7A7068", accent: "#7A7068", rule: "#B4A99E", ornament: "#B4A99E" },
    };
    expect(getInteriorDesign("classic")).toMatchObject({
      ...legacy,
      type: { heading: "cormorant", headingWeight: 500, headingItalic: false, body: "ptserif", bodySize: 10.5, lineHeight: 1.5 },
      display: { font: "cormorant", weight: 500 },
      label: { font: "ptserif", weight: 400, size: 7.5 },
    });
    expect(getInteriorDesign("modern")).toMatchObject({
      ...legacy,
      type: { heading: "playfair", headingWeight: 400, headingItalic: true, body: "lora", bodySize: 10, lineHeight: 1.55 },
      display: { font: "playfair", weight: 400 },
    });
    expect(getInteriorDesign("minimal")).toMatchObject({
      ...legacy,
      type: { heading: "montserrat", headingWeight: 500, body: "montserrat", bodySize: 9.5, lineHeight: 1.6 },
      display: { font: "montserrat", weight: 500 },
    });
    expect(DEFAULT_INTERIOR).toBe("classic");
  });

  it("неизвестный дизайн — классика (старые записи не ломают вёрстку)", () => {
    expect(isInteriorId("stars")).toBe(true);
    expect(isInteriorId("comic")).toBe(false);
    expect(isInteriorId("toString")).toBe(false);
    expect(getInteriorDesign("comic").id).toBe("classic");
  });

  it("у каждой обложки есть оформление в пару, и пары ссылаются на настоящие обложки", () => {
    const covers = new Set(coverTemplates.map((c) => c.id));
    for (const c of coverTemplates) expect(interiorsForCover(c.id).length, c.id).toBeGreaterThan(0);
    for (const d of interiorDesigns) for (const id of d.pairsWith) expect(covers.has(id), `${d.id} → ${id}`).toBe(true);
  });
});

describe("оформление страниц: номера глав и капитель", () => {
  it("римские цифры", () => {
    expect([1, 4, 9, 14, 19, 40, 2026].map(romanNumeral)).toEqual(["I", "IV", "IX", "XIV", "XIX", "XL", "MMXXVI"]);
  });

  it("номер главы — подписью, цифрой, с нулём или римской", () => {
    const label = (n: number) => `Глава ${n}`;
    expect(chapterMark(getInteriorDesign("classic"), 3, label)).toEqual({ kind: "label", text: "Глава 3" });
    expect(chapterMark(getInteriorDesign("stars"), 3, label)).toEqual({ kind: "numeral", text: "3" });
    expect(chapterMark(getInteriorDesign("editorial"), 3, label)).toEqual({ kind: "numeral", text: "03" });
    expect(chapterMark(getInteriorDesign("deco"), 3, label)).toEqual({ kind: "numeral", text: "III" });
  });

  it.each([
    ["Мы встретились в самый обычный вторник", "Мы встретились"],
    ["Привет, мама! Как ты?", "Привет,"],
    ["Одно", "Одно"],
    ["Когда я впервые тебя увидела", "Когда я впервые"],
    ["Біз Алматыға алғашқы қар жауған күні кездестік", "Біз Алматыға алғашқы"],
    ["Сорокадевятиэтажный дом стоял у реки", "Сорокадевятиэтажный"],
  ])("капитель: «%s» → «%s»", (text, lead) => {
    const [head, rest] = splitLeadIn(text);
    expect(head).toBe(lead);
    expect(head + rest).toBe(text);
  });
});

describe("оформление страниц: графика", () => {
  it.each(interiorDesigns.flatMap((d) => Object.values(formats).map((f) => [d.id, f.id] as const)))("%s, %s: рамки и рисунки валидны и растрируются", async (id, formatId) => {
    const design = getInteriorDesign(id);
    const format = formats[formatId];
    const box = pageBox(format, 3);
    const flow = openerFlow(format, design);
    const colors = design.opener.fill ?? design.palette;
    const shapes = [
      ...(design.opener.art ? openerArtShapes(design.opener.art, { w: box.w, h: box.h, flowTop: flow.top, k: flow.k, palette: colors, seed: 2 }) : []),
      ...frameShapes(design.frame, box, colors),
    ];
    const svg = toSvg(shapes, box.w, box.h);
    expect(svg).not.toMatch(/NaN|undefined|Infinity/);
    const png = await sharp(Buffer.from(svg)).png().toBuffer({ resolveWithObject: true });
    expect(png.info.width).toBe(Math.round(box.w * 2));
    // Узор начальной полосы одинаков при любых вылетах: в превью, в печати и в читательском PDF.
    if (design.opener.art) {
      const again = openerArtShapes(design.opener.art, { w: box.w, h: box.h, flowTop: flow.top, k: flow.k, palette: colors, seed: 2 });
      expect(again).toEqual(shapes.slice(0, again.length));
    }
  });

  it.each(interiorDesigns.map((d) => d.id))("%s: виньетки и разделители", async (id) => {
    const design = getInteriorDesign(id);
    for (const drawing of [vignetteDrawing(design.ornament, 34, design.palette), dividerDrawing(design.ornament, design.divider === "rule" ? "rule" : "glyph", design.palette)]) {
      expect(drawing.w).toBeGreaterThan(0);
      expect(drawing.h).toBeGreaterThan(0);
      const svg = toSvg(drawing.shapes, drawing.w, drawing.h);
      expect(svg).not.toMatch(/NaN|undefined|Infinity/);
      await sharp(Buffer.from(svg)).png().toBuffer();
    }
  });
});
