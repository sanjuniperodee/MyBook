import { beforeAll, describe, expect, it, vi } from "vitest";
import type { BookBuildPage } from "@/lib/book/book-build";
import { estimatePages } from "@/lib/book/estimate";
import { leafPages, pageLeaf } from "@/lib/book/flipbook";
import { GALLERY_KEY } from "@/lib/book/toc";
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
  /** Виды полос по итоговой раскладке — манифест экранной сборки, по нему листается 3D-книга. */
  layout: BookBuildPage[];
}

const pages = new Map<string, Pages>();

beforeAll(async () => {
  await useFixtureStorage();
  const { renderInterior } = await import("@/modules/production/infrastructure/pdf/render");
  const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
  for (const fb of books) {
    warn.mockClear();
    const { contentPages, pageCount, chapterPages, pages: layout } = await renderInterior(fb.bundle, "preview");
    const wraps = warn.mock.calls.filter(([message]) => String(message).includes("can't wrap between pages")).length;
    pages.set(fb.key, { estimate: estimatePages(contentOf(fb)), contentPages, pageCount, wraps, chapterPages, layout });
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

  // 3D-книга листает полосы экранной сборки: лист i — полосы 2i−1 и 2i манифеста, своей раскладки у неё нет. Здесь —
  // что манифест у каждой книги набора совпадает с PDF: главы на номерах оглавления, их текст и фото подряд,
  // галерея и финал на своих полосах, добивка пустыми полосами до печатного объёма.
  it("3D-книга листает полосы PDF: главы на номерах оглавления, галерея и финал на своих полосах, добивка в конце (B2)", () => {
    const mismatches: string[] = [];
    for (const fb of books) {
      const c = contentOf(fb);
      const pdf = pages.get(fb.key)!;
      const kinds = pdf.layout.map((p) => (p.chapterKey ? `${p.kind}:${p.chapterKey}` : p.kind));
      const want: string[] = [];
      const check = (what: string, ok: boolean) => ok || want.push(what);
      check("полос — печатный объём", pdf.layout.length === pdf.pageCount && pdf.layout.every((p, i) => p.n === i + 1));
      c.chapters.forEach((ch, i) => {
        const start = pdf.chapterPages[ch.key];
        check(`глава ${ch.key} с полосы ${start}`, kinds[start - 1] === `opener:${ch.key}`);
        const end = (i + 1 < c.chapters.length ? pdf.chapterPages[c.chapters[i + 1].key] : (pdf.chapterPages[GALLERY_KEY] ?? pdf.contentPages)) - 1;
        check(`глава ${ch.key}: текст и фото подряд`, pdf.layout.slice(start, end).every((p) => (p.kind === "text" || p.kind === "photo") && p.chapterKey === ch.key));
      });
      const gallery = pdf.chapterPages[GALLERY_KEY];
      check("галерея", c.galleryPhotos.length ? kinds[gallery - 1] === `opener:${GALLERY_KEY}` && kinds.slice(gallery, pdf.contentPages - 1).every((k) => k === "gallery") : gallery === undefined);
      check("финал", kinds[pdf.contentPages - 1] === "end");
      check("добивка", kinds.slice(pdf.contentPages).every((k) => k === "pad"));
      // Каждая полоса — ровно на одной стороне одного листа.
      check("листы", pdf.layout.every((p) => leafPages(pageLeaf(p.n).leaf)[pageLeaf(p.n).side === "f" ? "front" : "back"] === p.n));
      if (want.length) mismatches.push(`${fb.key}: ${want.join("; ")}`);
    }
    expect(mismatches).toEqual([]);
  });
});
