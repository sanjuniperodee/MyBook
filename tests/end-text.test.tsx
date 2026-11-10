import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { endPageText } from "@/lib/book/end-page";
import { InteriorSpread, type SpreadSample } from "@/components/interior/InteriorSpread";
import { getFormat } from "@/lib/book/formats";
import { getInteriorDesign } from "@/lib/book/interiors";
import { contentFor, renderInterior } from "@/modules/production/infrastructure/pdf/render";
import { fixtureBook } from "./fixtures/books";

const sample: SpreadSample = {
  language: "ru",
  title: "Книга",
  subtitle: "",
  author: "Автор",
  year: 2026,
  dedication: "",
  dedicationPlaceholder: "",
  chapter: { number: 1, title: "Глава" },
  entries: [],
  toc: [],
  showToc: true,
};
const spread = (endText?: string | null) =>
  renderToStaticMarkup(<InteriorSpread design={getInteriorDesign("classic")} format={getFormat("a5")} sample={{ ...sample, endText }} kind="toc" />);

describe("фраза последней страницы", () => {
  it("null — по умолчанию, пусто — без фразы, иначе своя", () => {
    expect(endPageText(null, "Продолжение следует…")).toBe("Продолжение следует…");
    expect(endPageText(undefined, "Продолжение следует…")).toBe("Продолжение следует…");
    expect(endPageText("  ", "Продолжение следует…")).toBe("");
    expect(endPageText(" С любовью ", "Продолжение следует…")).toBe("С любовью");
  });

  it("разворот «Оглавление» показывает выбранную фразу", () => {
    expect(spread()).toContain("Продолжение следует…");
    expect(spread("")).not.toContain("Продолжение следует…");
    const own = spread("С любовью, твоя семья");
    expect(own).toContain("С любовью, твоя семья");
    expect(own).not.toContain("Продолжение следует…");
  });
});

describe("фраза последней страницы в печати", () => {
  const { bundle } = fixtureBook("classic", "a5", "ru");
  const withEnd = (endText: string | null) => ({ ...bundle, photos: [], book: { ...bundle.book, coverPhotoId: null, endText } });

  it("в содержании книги — только когда задана: прежние книги не меняют отпечаток кэша", () => {
    expect("endText" in contentFor(withEnd(null))).toBe(false);
    expect(contentFor(withEnd("")).endText).toBe("");
    expect(contentFor(withEnd(" С любовью ")).endText).toBe("С любовью");
  });

  it("блок собирается без фразы и со своей, число страниц то же", async () => {
    const base = await renderInterior(withEnd(null), "preview");
    for (const endText of ["", "С любовью, твоя семья — до встречи на следующих страницах нашей жизни"]) {
      const res = await renderInterior(withEnd(endText), "preview");
      expect(res.pageCount).toBe(base.pageCount);
    }
  }, 120_000);
});
