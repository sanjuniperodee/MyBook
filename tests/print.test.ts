import { describe, expect, it } from "vitest";
import { coverSpreadGeometry, formats, print, printablePageCount, spineWidthMm } from "@/lib/book/formats";
import { buildBookContent, effectiveDpi, estimatePages, photoPages } from "@/lib/book/layout";
import { calculatePrice, normalizePromoCode } from "@/lib/pricing";
import { coverTemplates, renderCoverSvg } from "@/lib/book/covers";
import { coverFrontGeometry } from "@/lib/book/formats";

describe("печатные параметры", () => {
  it("объём блока не меньше минимума и кратен тетради", () => {
    expect(printablePageCount(3)).toBe(print.minPages);
    expect(printablePageCount(print.minPages + 1) % print.pageMultiple).toBe(0);
    expect(printablePageCount(97)).toBe(100);
  });
  it("корешок растёт с объёмом", () => {
    expect(spineWidthMm(200)).toBeGreaterThan(spineWidthMm(40));
    expect(spineWidthMm(100)).toBeCloseTo(50 * print.sheetThicknessMm + print.cover.spineExtraMm, 1);
  });
  it("развёртка обложки складывается из частей без зазоров", () => {
    const g = coverSpreadGeometry(formats.a5, 120);
    const { wrapMm, hingeMm } = print.cover;
    expect(g.back!.x).toBe(wrapMm);
    expect(g.spine!.x).toBeCloseTo(g.back!.x + g.back!.w + hingeMm);
    expect(g.front.x).toBeCloseTo(g.spine!.x + g.spine!.w + hingeMm);
    expect(g.front.x + g.front.w + wrapMm).toBeCloseTo(g.width);
    expect(g.height).toBeCloseTo(formats.a5.heightMm + 2 * print.cover.boardOverhangMm + 2 * wrapMm);
  });
});

describe("вёрстка", () => {
  const book = {
    theme: "love",
    title: "Тест",
    subtitle: "",
    authorName: "А",
    authorGender: "f" as const,
    recipientName: "Б",
    recipientGender: "m" as const,
    dedication: "",
    typography: "classic",
    format: "a5",
    photoPlacement: "chapters" as const,
    showToc: true,
    coverPhotoId: null,
  };
  const q = (i: number, chapter: string, answer: string) => ({ id: String(i), chapter, position: i, title: "Когда я {понял|поняла}", displayText: null, hideHeading: false, answer });

  it("в книгу попадают только отвеченные вопросы, с учётом рода", () => {
    const c = buildBookContent(book, [q(1, "intro", "да"), q(2, "intro", ""), q(3, "meet", "ок")], []);
    expect(c.chapters.map((x) => x.key)).toEqual(["intro", "meet"]);
    expect(c.chapters[0].items[0].heading).toBe("Когда я поняла");
  });
  it("оценка страниц растёт с длиной ответов", () => {
    const short = estimatePages(buildBookContent(book, [q(1, "intro", "коротко")], []));
    const long = estimatePages(buildBookContent(book, [q(1, "intro", "очень длинный ответ ".repeat(800))], []));
    expect(long).toBeGreaterThan(short + 5);
  });
  it("половинки фото объединяются по две на страницу", () => {
    const p = (id: string, layout: "full" | "half" | "bleed") => ({ id, caption: "", layout, width: 1, height: 1, storageKey: "", thumbKey: "" });
    expect(photoPages([p("1", "half"), p("2", "half"), p("3", "full"), p("4", "half")]).map((g) => g.length)).toEqual([2, 1, 1]);
  });
  it("эффективное разрешение фото", () => {
    expect(effectiveDpi({ width: 1748, height: 2480 }, { w: 148, h: 210 }, "contain")).toBe(300);
    expect(effectiveDpi({ width: 874, height: 1240 }, { w: 148, h: 210 }, "cover")).toBe(150);
  });
});

describe("цены", () => {
  it("считает доп. экземпляры и доставку", () => {
    expect(calculatePrice("hardcover", 2, "courier")).toEqual({ itemsAmount: 24900 + 17900, discountAmount: 0, deliveryAmount: 2000, amount: 44800 });
  });
  it("у электронной версии нет доставки и количества", () => {
    expect(calculatePrice("digital", 5, "courier")).toEqual({ itemsAmount: 9900, discountAmount: 0, deliveryAmount: 0, amount: 9900 });
  });
  it("промокод уменьшает стоимость книг, но не доставку", () => {
    const p = calculatePrice("hardcover", 1, "post", { kind: "percent", value: 10 });
    expect(p.discountAmount).toBe(2490);
    expect(p.amount).toBe(24900 - 2490 + 3500);
    const fixed = calculatePrice("hardcover", 1, "post", { kind: "fixed", value: 100000 });
    expect(fixed.discountAmount).toBe(24900);
    expect(fixed.amount).toBe(3500);
    expect(calculatePrice("digital", 1, null, { kind: "percent", value: 100 }).amount).toBe(0);
  });
  it("нормализует код промокода", () => {
    expect(normalizePromoCode("  love 2026 ")).toBe("LOVE2026");
  });
});

describe("обложки", () => {
  it("каждый шаблон рисует корректный SVG", () => {
    for (const t of coverTemplates) {
      const svg = renderCoverSvg(t, coverFrontGeometry(formats.a5), { uid: "t" });
      expect(svg.startsWith("<svg")).toBe(true);
      expect(svg).not.toContain("NaN");
      expect(svg).not.toContain("undefined");
    }
  });
});
