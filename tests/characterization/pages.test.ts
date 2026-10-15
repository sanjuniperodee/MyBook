import { describe, expect, it } from "vitest";
import { planFaces, type Face, type FacePlanInput } from "@/lib/book/flipbook";
import { printablePageCount } from "@/lib/book/formats";
import { estimateChapterPages, estimatePages, textMetrics } from "@/lib/book/estimate";
import { photoPages, type BookContent } from "@/lib/book/layout";
import { characterizationBooks, contentOf } from "./books";

/** Характеристика объёма книги: оценка страниц (редактор, статистика, 3D) и раскладка полос листаемой 3D-книги. */

const books = characterizationBooks().map((fb) => ({ key: fb.key, content: contentOf(fb) }));
const byBook = <T>(fn: (c: BookContent) => T) => Object.fromEntries(books.map((b) => [b.key, fn(b.content)]));

/**
 * Вход planFaces — как в листаемой книге (preview/page.tsx → usePagedBook), только полосы текста глав берутся
 * из оценки: в браузере их меряют по вёрстке, а здесь её нет.
 */
function faceInput(c: BookContent): FacePlanInput {
  const m = textMetrics(c.format, c.interior);
  const photos = c.chapters.map((ch) => photoPages(ch.photos).length);
  return {
    hasDedication: !!c.dedication,
    hasToc: c.showToc,
    // estimateChapterPages = начальная полоса + полосы текста + фотостраницы.
    textPages: c.chapters.map((ch, i) => (ch.items.length ? estimateChapterPages(ch, m) - 1 - photos[i] : 0)),
    photoPages: photos,
    galleryPages: photoPages(c.galleryPhotos).length,
  };
}

function faceName(f: Face) {
  if (f.kind === "opener") return `opener${f.chapter}`;
  if (f.kind === "text") return `text${f.chapter}.${f.part}`;
  if (f.kind === "photos") return `photos${f.chapter}.${f.page}`;
  return f.kind;
}

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

  it("planFaces: полосы 3D-книги по порядку и первые полосы глав", () => {
    expect(
      byBook((c) => {
        const { faces, chapterStarts } = planFaces(faceInput(c));
        return { faces: faces.map(faceName).join(" "), chapterStarts: chapterStarts.join(", ") };
      }),
    ).toMatchSnapshot();
  });
});
