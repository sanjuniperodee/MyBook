import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { coverMoods, coverTemplates, renderCoverSvg } from "@/lib/book/covers";
import { messagesFor } from "@/i18n/messages";
import { coverFrontGeometry, coverSpreadGeometry, getFormat } from "@/lib/book/formats";

describe("обложки", () => {
  it("уникальные id и допустимое настроение", () => {
    const ids = coverTemplates.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(coverTemplates.length).toBeGreaterThanOrEqual(20);
    for (const t of coverTemplates) expect(coverMoods.includes(t.mood)).toBe(true);
  });

  it("у каждой обложки есть название на обоих языках", () => {
    for (const locale of ["ru", "kk"] as const)
      for (const t of coverTemplates) expect(messagesFor(locale).catalog.covers[t.id], `${locale}: ${t.id}`).toBeTruthy();
  });

  it.each(coverTemplates.map((t) => t.id))("%s растрируется — превью и развёртка", async (id) => {
    const t = coverTemplates.find((x) => x.id === id)!;
    for (const g of [coverFrontGeometry(getFormat("a5")), coverSpreadGeometry(getFormat("square"), 96)]) {
      const svg = renderCoverSvg(t, g, { uid: `t${id}` }, { pxPerMm: 0.6, noTexture: true });
      expect(svg).not.toMatch(/NaN|undefined/);
      const meta = await sharp(Buffer.from(svg)).png().toBuffer({ resolveWithObject: true });
      expect(meta.info.width).toBe(Math.round(g.width * 0.6));
    }
  });
});
