import { beforeAll, describe, expect, it, vi } from "vitest";
import { estimatePages } from "@/lib/book/estimate";
import { useFixtureStorage } from "../fixtures/photos";
import { characterizationBooks, contentOf, pdfContentPages } from "./books";

/**
 * Характеристика фактического объёма: renderInterior по всем книгам набора (матрица и варианты) рядом с оценкой
 * estimatePages. Оценка обязана совпасть с PDF у каждой книги (B3, B14).
 * Режим preview: раскладка не зависит от пикселей фото, в print полос столько же, а сборка на треть дольше.
 */

const books = characterizationBooks();

interface Pages {
  estimate: number;
  contentPages: number;
  pageCount: number;
  /** Предупреждения react-pdf «can't wrap between pages» (узел выше полосы); прочие предупреждения не считаются. */
  wraps: number;
}

const pages = new Map<string, Pages>();

beforeAll(async () => {
  await useFixtureStorage();
  const { renderInterior } = await import("@/modules/production/infrastructure/pdf/render");
  const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
  for (const fb of books) {
    warn.mockClear();
    const { contentPages, pageCount } = await renderInterior(fb.bundle, "preview");
    const wraps = warn.mock.calls.filter(([message]) => String(message).includes("can't wrap between pages")).length;
    pages.set(fb.key, { estimate: estimatePages(contentOf(fb)), contentPages, pageCount, wraps });
  }
  warn.mockRestore();
}, 600_000);

describe("renderInterior: страниц в PDF рядом с оценкой", () => {
  it("оценка · полос в PDF → после добивки до кратности", () => {
    const line = (p: Pages) => `оценка ${p.estimate} · PDF ${p.contentPages} → ${p.pageCount}`;
    expect(Object.fromEntries([...pages].map(([key, p]) => [key, line(p)]))).toMatchSnapshot();
  });

  it("полос в PDF — как в таблице pdfContentPages: по ней другие снимки сверяют оценки без рендера", () => {
    expect(Object.fromEntries(Object.keys(pdfContentPages).map((key) => [key, pages.get(key)?.contentPages]))).toEqual(pdfContentPages);
  });

  it("react-pdf переносит все узлы: фото под обрез в квадрате больше не «выше полосы» (B9)", () => {
    const wraps = Object.fromEntries([...pages].filter(([, p]) => p.wraps).map(([key, p]) => [key, p.wraps]));
    expect(wraps).toEqual({});
  });

  it("оценка совпадает с PDF у каждой книги набора — в A5 и в квадрате (B14)", () => {
    const mismatches = [...pages].filter(([, p]) => p.estimate !== p.contentPages).map(([key, p]) => `${key}: ${p.estimate} вместо ${p.contentPages}`);
    expect(mismatches).toEqual([]);
  });
});
