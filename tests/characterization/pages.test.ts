import { describe, expect, it } from "vitest";
import { printablePageCount } from "@/lib/book/formats";
import { estimateChapterPages, estimatePages, textMetrics } from "@/lib/book/estimate";
import type { BookContent } from "@/lib/book/layout";
import { characterizationBooks, contentOf } from "./books";

/**
 * Характеристика объёма книги: оценка страниц (редактор, статистика). Полосы 3D-книги — страницы экранной сборки,
 * их порядок по настоящей раскладке проверяет render.test.ts.
 */

const books = characterizationBooks().map((fb) => ({ key: fb.key, content: contentOf(fb) }));
const byBook = <T>(fn: (c: BookContent) => T) => Object.fromEntries(books.map((b) => [b.key, fn(b.content)]));

describe("объём книги", () => {
  it("estimatePages: оценка, по главам и после добивки до печатного объёма", () => {
    expect(
      byBook((c) => {
        const m = textMetrics(c.format, c.interior);
        const pages = estimatePages(c);
        return `${pages} (главы ${c.chapters.map((ch) => estimateChapterPages(ch, m)).join(", ")}) → печать ${printablePageCount(pages)}`;
      }),
    ).toMatchSnapshot();
  });
});
