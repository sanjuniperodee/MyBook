import { describe, expect, it } from "vitest";
import { formats, type FormatId } from "@/lib/book/formats";
import { interiorDesigns } from "@/lib/book/interiors";
import { CHAPTER_EPIGRAPH_MAX, CHAPTER_TITLE_MAX } from "@/lib/content/kinds";
import { getThemes } from "@/lib/content/themes";
import { BANK_OPENER, openerFit } from "@/lib/book/opener-fit";
import { interiorSizes } from "@/lib/book/typesetting";
import { interiorMetrics } from "@/lib/book/page-geometry";

/**
 * Уменьшение названия и эпиграфа на начальной полосе (opener-fit) касается только длинных текстов своей книги:
 * главы всех банков вопросов во всех оформлениях и форматах печатаются как раньше.
 */
const formatIds = Object.keys(formats) as FormatId[];

describe("openerFit", () => {
  it("BANK_OPENER — не меньше самых длинных названия и эпиграфа главы в банках", () => {
    const chapters = (["ru", "kk"] as const).flatMap((lang) => getThemes(lang).flatMap((t) => t.chapters));
    expect(Math.max(...chapters.map((c) => c.title.length))).toBeLessThanOrEqual(BANK_OPENER.title);
    expect(Math.max(...chapters.map((c) => c.epigraph?.length ?? 0))).toBeLessThanOrEqual(BANK_OPENER.epigraph);
  });

  it("главы банков — подарков и автобиографии — без изменений в каждом оформлении и формате", () => {
    const changed: string[] = [];
    for (const lang of ["ru", "kk"] as const)
      for (const theme of getThemes(lang))
        for (const ch of theme.chapters)
          for (const design of interiorDesigns)
            for (const format of formatIds)
              for (const photo of [false, true]) {
                const fit = openerFit(formats[format], design, { title: ch.title, epigraph: ch.epigraph, number: 3, photo });
                const size = interiorSizes(design, interiorMetrics[format].scale).openerTitle;
                if (fit.titleSize !== size || fit.epigraphLines !== null) changed.push(`${lang}/${theme.id}/${ch.key}/${design.id}/${format}/${photo ? "photo" : "plain"}`);
              }
    expect(changed).toEqual([]);
  });

  it("название в 120 знаков и эпиграф в 300 уменьшаются там, где под ними мало места, и оставляют не меньше двух строк эпиграфа", () => {
    const title = "ш".repeat(CHAPTER_TITLE_MAX);
    const epigraph = "слово ".repeat(CHAPTER_EPIGRAPH_MAX / 6);
    let clamped = 0;
    for (const design of interiorDesigns)
      for (const format of formatIds) {
        const fit = openerFit(formats[format], design, { title, epigraph, number: 1, photo: true });
        const size = interiorSizes(design, interiorMetrics[format].scale).openerTitle;
        expect(fit.titleSize).toBeLessThanOrEqual(size);
        expect(fit.titleSize).toBeGreaterThanOrEqual(size * 0.55 - 1e-9);
        if (fit.epigraphLines !== null) {
          clamped++;
          expect(fit.epigraphLines).toBeGreaterThanOrEqual(2);
        }
      }
    expect(clamped).toBeGreaterThan(0);
  });

  it("без эпиграфа строк не ограничивает", () => {
    const fit = openerFit(formats.a5, interiorDesigns[0], { title: "Название", number: 1, photo: true });
    expect(fit.epigraphLines).toBeNull();
  });
});
