import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { coverPhotoIds, coverPhotoSlots, coverTemplates, getCoverTemplate, renderCoverSvg } from "@/lib/book/covers";
import { coverFrontGeometry, coverSpreadGeometry, formats, getFormat, type Rect } from "@/lib/book/formats";
import { interiorDesigns, interiorSizes } from "@/lib/book/interiors";
import { interiorMetrics, photoPages, type PhotoItem } from "@/lib/book/layout";
import { openerPhotoPlan, photoArea, photoCells, photoPagePlan } from "@/lib/book/photo-pages";
import { checkReadiness } from "@/modules/authoring/domain/readiness";

const inside = (outer: Rect, r: Rect) => r.x >= outer.x - 0.01 && r.y >= outer.y - 0.01 && r.x + r.w <= outer.x + outer.w + 0.01 && r.y + r.h <= outer.y + outer.h + 0.01;
const photo = (id: string, layout: PhotoItem["layout"], width = 1600, height = 1200, caption = "") => ({ id, layout, width, height, caption });

describe("обложки с фото", () => {
  const photoCovers = coverTemplates.filter((t) => t.requiresPhoto);

  it("коллекция с фото: десяток шаблонов, у коллажей несколько мест", () => {
    expect(photoCovers.length).toBeGreaterThanOrEqual(10);
    expect(coverPhotoSlots(getCoverTemplate("collage"))).toBe(3);
    expect(coverPhotoSlots(getCoverTemplate("mosaic"))).toBe(4);
    expect(coverPhotoSlots(getCoverTemplate("arch"))).toBe(1);
    expect(coverPhotoSlots(getCoverTemplate("linen"))).toBe(0);
  });

  it.each(photoCovers.map((t) => t.id))("%s: каждое место — снимок клиента, пустое — пейзаж-заглушка", async (id) => {
    const t = getCoverTemplate(id);
    const href = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
    const slots = coverPhotoSlots(t);
    for (const g of [coverFrontGeometry(getFormat("a5")), coverSpreadGeometry(getFormat("square"), 96)]) {
      const full = renderCoverSvg(t, g, { uid: "t", photos: Array(slots).fill(href) }, { pxPerMm: 0.5, noTexture: true });
      expect(full.match(/<image /g)?.length).toBe(slots);
      const empty = renderCoverSvg(t, g, { uid: "t" }, { pxPerMm: 0.5, noTexture: true });
      expect(empty).not.toContain("<image ");
      for (let i = 0; i < slots; i++) expect(empty).toContain(`tp${i}sky`);
      for (const svg of [full, empty]) {
        expect(svg).not.toMatch(/NaN|undefined/);
        expect((await sharp(Buffer.from(svg)).png().toBuffer({ resolveWithObject: true })).info.width).toBe(Math.round(g.width * 0.5));
      }
    }
  });

  it("фото по местам: основное и дополнительные, недостающие — пустые", () => {
    expect(coverPhotoIds({ coverTemplate: "mosaic", coverPhotoId: "a", coverPhotoExtra: ["b"] })).toEqual(["a", "b", null, null]);
    expect(coverPhotoIds({ coverTemplate: "arch", coverPhotoId: "a", coverPhotoExtra: ["b"] })).toEqual(["a"]);
    expect(coverPhotoIds({ coverTemplate: "linen", coverPhotoId: "a", coverPhotoExtra: [] })).toEqual([]);
  });

  it("заказать коллаж можно, только когда выбраны все его фото", () => {
    const stats = { answered: 20, estimatedPages: 40 } as Parameters<typeof checkReadiness>[1];
    const book = { id: "b", coverTemplate: "collage", coverPhotoId: "a", coverPhotoExtra: ["b"], authorName: "Алия", format: "a5" };
    const issue = checkReadiness(book, stats, []).find((i) => i.level === "error");
    expect(issue?.text).toContain("3 фото");
    expect(checkReadiness({ ...book, coverPhotoExtra: ["b", "c"] }, stats, []).some((i) => i.level === "error")).toBe(false);
  });
});

describe("фотостраницы", () => {
  it("сетка — до четырёх фото на страницу, половинки — по две", () => {
    const list = [photo("1", "grid"), photo("2", "half"), photo("3", "grid"), photo("4", "grid"), photo("5", "grid"), photo("6", "grid"), photo("7", "half")];
    expect(photoPages(list).map((g) => g.map((p) => p.id))).toEqual([["1", "3", "4", "5"], ["2", "7"], ["6"]]);
  });

  it("места не пересекаются и не выходят за полосу набора", () => {
    const area = { x: 17, y: 17, w: 114, h: 172 };
    for (const n of [2, 3, 4]) {
      const cells = photoCells(Array.from({ length: n }, (_, i) => photo(String(i), "grid", 1000, 1400)), area);
      expect(cells).toHaveLength(n);
      for (const c of cells) expect(inside(area, c)).toBe(true);
      for (let i = 0; i < n; i++)
        for (let j = i + 1; j < n; j++) {
          const [a, b] = [cells[i], cells[j]];
          expect(a.x + a.w <= b.x + 0.01 || b.x + b.w <= a.x + 0.01 || a.y + a.h <= b.y + 0.01 || b.y + b.h <= a.y + 0.01).toBe(true);
        }
    }
  });

  it.each(interiorDesigns.flatMap((d) => Object.values(formats).map((f) => [d.id, f.id] as const)))("%s, %s: снимки, рамки и подписи — на странице, снимок целиком в пропорциях", (id, formatId) => {
    const design = interiorDesigns.find((d) => d.id === id)!;
    const format = formats[formatId];
    const area = photoArea(format, interiorMetrics[format.id]);
    const S = interiorSizes(design, interiorMetrics[format.id].scale);
    const page = { x: 0, y: 0, w: format.widthMm, h: format.heightMm };
    for (const group of [[photo("a", "full", 1200, 1600, "Наше первое лето, Алматы")], [photo("a", "half"), photo("b", "half", 1000, 1000, "Подпись")], ["a", "b", "c"].map((x) => photo(x, "grid", 1500, 1000, "Тот самый день"))]) {
      const plan = photoPagePlan(group, area, design, S);
      expect(plan.cells).toHaveLength(group.length);
      for (const c of plan.cells) {
        expect(inside(area, c.img), `${id}: ${c.id}`).toBe(true);
        if (c.caption) expect(inside(page, c.caption.box)).toBe(true);
        const p = group.find((x) => x.id === c.id)!;
        if (c.fit === "contain") expect(c.img.w / c.img.h).toBeCloseTo(p.width / p.height, 2);
      }
      expect(JSON.stringify([plan.under, plan.over])).not.toMatch(/NaN|null/);
    }
  });

  it("начальная полоса с фото: снимок сверху, название ниже него", () => {
    for (const id of ["photobook", "memories", "gallery", "arches", "luna"]) {
      const design = interiorDesigns.find((d) => d.id === id)!;
      for (const format of Object.values(formats)) {
        const m = interiorMetrics[format.id];
        const plan = openerPhotoPlan(format, design, m)!;
        const textY = m.marginTop + plan.textTop * (format.heightMm - m.marginTop - m.marginBottom);
        expect(textY).toBeGreaterThan(plan.img.y + plan.img.h);
        expect(plan.textTop).toBeLessThan(0.75);
      }
    }
    expect(openerPhotoPlan(formats.a5, interiorDesigns.find((d) => d.id === "classic")!, interiorMetrics.a5)).toBeNull();
  });

  it("арка и круг — снимок по центру внутри страницы, во всю полосу — под обрез с затемнением под светлый текст", () => {
    const byId = (id: string) => interiorDesigns.find((d) => d.id === id)!;
    for (const format of Object.values(formats)) {
      const m = interiorMetrics[format.id];
      const page = { x: 0, y: 0, w: format.widthMm, h: format.heightMm };
      for (const [id, mask] of [["arches", "arch"], ["luna", "circle"]] as const) {
        const plan = openerPhotoPlan(format, byId(id), m)!;
        expect(plan.mask).toBe(mask);
        expect(inside(page, plan.img)).toBe(true);
        expect(plan.img.x + plan.img.w / 2).toBeCloseTo(format.widthMm / 2, 6);
      }
      const full = openerPhotoPlan(format, byId("cinema"), m)!;
      expect(full.img).toEqual({ x: -3, y: -3, w: format.widthMm + 6, h: format.heightMm + 6 });
      expect(full.shade?.opacity).toBeGreaterThan(0.5);
      expect(byId("cinema").opener.fill?.ink).toBe("#FFFFFF");
    }
  });
});
