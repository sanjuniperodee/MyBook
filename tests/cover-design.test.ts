import { describe, expect, it } from "vitest";
import {
  COVER_LIMITS,
  coverDesignPhotoIds,
  DECOR_IDS,
  decorDrawing,
  designFromTemplate,
  dropCoverPhoto,
  emptyImageLayers,
  layerText,
  OUTLINE_STEPS,
  parseCoverDesign,
  printedLayers,
  shapeElements,
  templateForDesign,
  textCopies,
  type CoverDesign,
} from "@/lib/book/cover-design";
import { allCoverTemplates, getCoverTemplate } from "@/lib/book/covers";
import { coverMeta } from "@/lib/book/covers/meta";
import { formats } from "@/lib/book/formats";

const PHOTO = "0b6f0b0e-1111-4a4a-8b8b-123456789abc";

describe("обложка из слоёв: разбор", () => {
  it("не объект — обложка шаблона (null)", () => {
    expect(parseCoverDesign(null)).toBeNull();
    expect(parseCoverDesign("x")).toBeNull();
  });

  it("числа ограничиваются, неизвестное отбрасывается, повторяющиеся id заменяются", () => {
    const d = parseCoverDesign({
      background: { kind: "gradient", from: "#112233", to: "nope", angle: 999 },
      layers: [
        { id: "a", kind: "text", text: "Привет", x: -5, y: 0.2, w: 9, h: 0.1, rotate: 400, opacity: 2, style: { font: "unknown", size: 3, color: "#abcdef", align: "middle", tracking: 5 } },
        { id: "a", kind: "decor", motif: "heart", color: "#FF0000", x: 0.1, y: 0.1, w: 0.1, h: 0.1 },
        { id: "b", kind: "decor", motif: "dragon" },
        { id: "c", kind: "image", photoId: PHOTO.toUpperCase(), stock: "../../etc/passwd", frame: { zoom: 9, x: 2, y: -1 }, mask: "star" },
        { kind: "virus" },
      ],
      extra: true,
    })!;
    expect(d.background).toEqual({ kind: "gradient", from: "#112233", to: "#D9C7B3", angle: 360 });
    expect(d.layers.map((l) => [l.id, l.kind])).toEqual([
      ["a", "text"],
      ["l1", "decor"],
      ["c", "image"],
    ]);
    const t = d.layers[0];
    expect(t).toMatchObject({ x: -COVER_LIMITS.bleed, w: COVER_LIMITS.maxSize, rotate: 180 });
    expect(t.opacity).toBeUndefined();
    if (t.kind !== "text") throw new Error();
    expect(t.style).toMatchObject({ font: "cormorant", size: COVER_LIMITS.fontSize[1], color: "#ABCDEF", align: "center", tracking: COVER_LIMITS.tracking[1] });
    const img = d.layers[2];
    if (img.kind !== "image") throw new Error();
    expect(img).toMatchObject({ photoId: PHOTO, stock: null, mask: "rect", frame: { zoom: 4, x: 1, y: 0 } });
  });

  it("не больше COVER_LIMITS.layers слоёв, текст — не длиннее COVER_LIMITS.text", () => {
    const many = Array.from({ length: 60 }, (_, i) => ({ id: `t${i}`, kind: "text", text: "я".repeat(500), x: 0, y: 0, w: 0.5, h: 0.1, style: {} }));
    const d = parseCoverDesign({ layers: many })!;
    expect(d.layers).toHaveLength(COVER_LIMITS.layers);
    expect((d.layers[0] as { text: string }).text).toHaveLength(COVER_LIMITS.text);
  });

  it("привязанный текст — из книги; пустой и места без фото не печатаются; удалённое фото уходит из слоёв", () => {
    const d: CoverDesign = {
      v: 1,
      background: { kind: "template" },
      layers: [
        { id: "t", kind: "text", bind: "subtitle", text: "", x: 0, y: 0, w: 1, h: 0.1, style: { font: "lora", weight: 400, size: 0.05, color: "#000000", align: "center", valign: "middle" } },
        { id: "p", kind: "image", photoId: PHOTO, x: 0, y: 0, w: 1, h: 0.5 },
        { id: "e", kind: "image", x: 0, y: 0, w: 1, h: 0.5 },
        { id: "s", kind: "image", stock: "peony", x: 0, y: 0, w: 1, h: 0.5 },
      ],
    };
    const texts = { title: "Т", subtitle: "", names: "" };
    expect(layerText(d.layers[0] as never, { ...texts, subtitle: "Под" })).toBe("Под");
    expect(printedLayers(d, texts).map((l) => l.id)).toEqual(["p", "s"]);
    expect(emptyImageLayers(d).map((l) => l.id)).toEqual(["e"]);
    expect(coverDesignPhotoIds(d)).toEqual([PHOTO]);
    expect(coverDesignPhotoIds(dropCoverPhoto(d, PHOTO))).toEqual([]);
  });
});

describe("обложка из слоёв: шаблоны, эффекты, декор", () => {
  it("любой шаблон переводится в слои: название, имена — внутри области текста шаблона", () => {
    const texts = { title: "Там, где ты — там мой дом", subtitle: "История нашей любви", names: "Элия & Олжас" };
    for (const t of allCoverTemplates) {
      const d = designFromTemplate(coverMeta(t), texts, formats.a5);
      const title = d.layers.find((l) => l.kind === "text" && l.bind === "title")!;
      expect(title, t.id).toBeDefined();
      expect(title.x).toBeCloseTo(t.textArea.x, 6);
      expect(title.w).toBeCloseTo(t.textArea.w, 6);
      // Блок может выйти за область, если текст длинный, но начинается не выше её верха минус запас.
      expect(title.y, t.id).toBeGreaterThan(t.textArea.y - 0.2);
      expect(d.layers.some((l) => l.kind === "text" && l.bind === "names"), t.id).toBe(true);
      expect(parseCoverDesign(d), t.id).toEqual(d);
    }
  });

  it("контур — OUTLINE_STEPS копий по кругу, тень — одна под ними", () => {
    expect(textCopies({})).toEqual([]);
    const c = textCopies({ shadow: { color: "#000000", x: 0.05, y: 0.05 }, outline: { color: "#FFFFFF", width: 0.04 } });
    expect(c).toHaveLength(OUTLINE_STEPS + 1);
    expect(c[0]).toEqual({ dx: 0.05, dy: 0.05, color: "#000000", opacity: 1 });
    for (const k of c.slice(1)) expect(Math.hypot(k.dx, k.dy)).toBeCloseTo(0.04, 6);
  });

  it("каждый мотив декора рисуется; фигуры — в своей рамке", () => {
    for (const id of DECOR_IDS) {
      const d = decorDrawing(id, "#123456");
      expect(d.w, id).toBeGreaterThan(0);
      expect(d.shapes.length, id).toBeGreaterThan(0);
    }
    for (const shape of ["rect", "ellipse", "line", "frame", "double", "corners", "arch"] as const)
      expect(shapeElements({ id: "s", kind: "shape", shape, x: 0, y: 0, w: 0.5, h: 0.2, fill: "#000000", strokeWidth: 0.01 }, 75, 43, 151).length).toBeGreaterThan(0);
  });

  it("свой фон: корешок и оборот — контрастным цветом, без повтора композиции лица", () => {
    const linen = getCoverTemplate("linen");
    expect(templateForDesign(linen, null)).toBe(linen);
    expect(templateForDesign(linen, { v: 1, background: { kind: "template" }, layers: [] })).toBe(linen);
    const dark = templateForDesign(linen, { v: 1, background: { kind: "color", color: "#141414" }, layers: [] });
    expect(dark.spine.color).toBe("#FBF7F1");
    expect(dark.back.mirror).toBe(false);
    expect(templateForDesign(linen, { v: 1, background: { kind: "color", color: "#F4EEE6" }, layers: [] }).spine.color).toBe("#1F1A17");
  });
});
