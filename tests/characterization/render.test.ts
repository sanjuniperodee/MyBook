import { beforeAll, describe, expect, it, vi } from "vitest";
import { estimatePages } from "@/lib/book/estimate";
import { planFaces } from "@/lib/book/flipbook";
import { photoPages } from "@/lib/book/layout";
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
  /** Первые полосы глав в PDF (номера оглавления). */
  chapterPages: Record<string, number>;
}

const pages = new Map<string, Pages>();

beforeAll(async () => {
  await useFixtureStorage();
  const { renderInterior } = await import("@/modules/production/infrastructure/pdf/render");
  const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
  for (const fb of books) {
    warn.mockClear();
    const { contentPages, pageCount, chapterPages } = await renderInterior(fb.bundle, "preview");
    const wraps = warn.mock.calls.filter(([message]) => String(message).includes("can't wrap between pages")).length;
    pages.set(fb.key, { estimate: estimatePages(contentOf(fb)), contentPages, pageCount, wraps, chapterPages });
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

  // Число полос текста главы здесь берётся из PDF: тест проверяет порядок полос planFaces (оборот титула, главы
  // подряд, фотостраницы, галерея), а не HTML-замер колонок в браузере (columnPages в usePagedBook).
  it("3D-книга раскладывает полосы как PDF: те же номера глав в оглавлении, галерея и финал на тех же полосах (B2)", () => {
    const mismatches: string[] = [];
    for (const fb of books) {
      const c = contentOf(fb);
      const pdf = pages.get(fb.key)!;
      const starts = c.chapters.map((ch) => pdf.chapterPages[ch.key]);
      const photos = c.chapters.map((ch) => photoPages(ch.photos).length);
      const gallery = photoPages(c.galleryPhotos).length;
      const after = (i: number) => (i + 1 < starts.length ? starts[i + 1] : (pdf.chapterPages.__gallery ?? pdf.contentPages));
      // Полосы текста главы — по PDF: всё между её начальной полосой и следующей главой, кроме фотостраниц.
      const textPages = starts.map((start, i) => after(i) - start - 1 - photos[i]);
      const plan = planFaces({ hasDedication: !!c.dedication, hasToc: c.showToc, textPages, photoPages: photos, galleryPages: gallery });
      const end = plan.faces.findIndex((f) => f.kind === "end") + 1;
      const galleryStart = plan.faces.findIndex((f) => f.kind === "galleryOpener") + 1 || undefined;
      const got = JSON.stringify({ chapters: plan.chapterStarts, gallery: galleryStart, end });
      const want = JSON.stringify({ chapters: starts, gallery: pdf.chapterPages.__gallery, end: pdf.contentPages });
      if (got !== want) mismatches.push(`${fb.key}: 3D ${got} · PDF ${want}`);
    }
    expect(mismatches).toEqual([]);
  });
});
