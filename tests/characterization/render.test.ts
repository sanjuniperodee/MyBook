import { beforeAll, describe, expect, it, vi } from "vitest";
import { estimatePages } from "@/lib/book/layout";
import { fixtureBook, fixtureBooks } from "../fixtures/books";
import { useFixtureStorage } from "../fixtures/photos";
import { contentOf } from "./books";

/**
 * Характеристика фактического объёма: renderInterior по книге на оформление и квадратный формат с фото по главам
 * и в конце книги — рядом с оценкой estimatePages. Расхождения фиксируются как есть (B3 в аудите).
 * Режим preview: раскладка не зависит от пикселей фото, в print полос столько же, а сборка на треть дольше.
 */

const books = [...fixtureBooks({ formats: ["a5"], languages: ["ru"] }), fixtureBook("classic", "square", "ru"), fixtureBook("classic", "square", "kk")];

interface Pages {
  estimate: number;
  contentPages: number;
  pageCount: number;
  /** Предупреждения react-pdf при сборке («can't wrap between pages» и т. п.). */
  warnings: number;
}

const pages = new Map<string, Pages>();

beforeAll(async () => {
  await useFixtureStorage();
  const { renderInterior } = await import("@/modules/production/infrastructure/pdf/render");
  const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
  for (const fb of books) {
    warn.mockClear();
    const { contentPages, pageCount } = await renderInterior(fb.bundle, "preview");
    pages.set(fb.key, { estimate: estimatePages(contentOf(fb)), contentPages, pageCount, warnings: warn.mock.calls.length });
  }
  warn.mockRestore();
}, 600_000);

describe("renderInterior: страниц в PDF рядом с оценкой", () => {
  it("оценка · полос в PDF → после добивки до кратности", () => {
    const line = (p: Pages) => `оценка ${p.estimate} · PDF ${p.contentPages} → ${p.pageCount}${p.warnings ? ` · предупреждений react-pdf: ${p.warnings}` : ""}`;
    expect(Object.fromEntries([...pages].map(([key, p]) => [key, line(p)]))).toMatchSnapshot();
  });

  it("оценка совпадает с PDF в A5, а в квадрате на полосу больше — так сейчас", () => {
    const mismatches = [...pages].filter(([, p]) => p.estimate !== p.contentPages).map(([key, p]) => `${key}: ${p.estimate} вместо ${p.contentPages}`);
    expect(mismatches).toEqual(["classic-square-ru: 31 вместо 30", "classic-square-kk: 32 вместо 31"]);
  });
});
