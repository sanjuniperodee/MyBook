import { createElement, createRef } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ChapterPages, chapterContentKey } from "@/components/editor/preview/ChapterPages";
import { NO_PHOTO_PAGES, photoColumns, samePhotoPages } from "@/components/editor/preview/layout-hooks";
import { pageKit } from "@/components/interior/kit";
import { pxUnits } from "@/components/interior/units";
import { ru } from "@/i18n/messages/ru";
import type { PreviewChapter } from "@/lib/book/editor-model";
import { formats } from "@/lib/book/formats";
import { getInteriorDesign } from "@/lib/book/interiors";

// Фото «на всю страницу» в превью редактора. Внутри CSS-колонок абсолютный снимок в блоке с break-before Chrome ставил
// по месту до разрыва — внизу прошлой полосы (обрезанным), а своя полоса оставалась пустой: фото было видно «два раза».
// Теперь в колонках только заглушка, а снимок рисует полоса, на которую она попала по замеру.

describe("полоса фото на всю страницу — по колонке заглушки в копии для замера", () => {
  const textW = 100;
  const gap = 20;
  const holder = (id: string, left: number) => ({ dataset: { pagePhoto: id }, getBoundingClientRect: () => ({ left }) });
  const flow = (holders: ReturnType<typeof holder>[], left = 500) =>
    ({ querySelectorAll: () => holders, getBoundingClientRect: () => ({ left }) }) as unknown as Parameters<typeof photoColumns>[0];

  it("колонка k — полоса k; дробные пиксели на границе колонки не сдвигают на прошлую", () => {
    expect(photoColumns(flow([holder("a", 500), holder("b", 500 + 2 * (textW + gap) - 0.6), holder("c", 500 + 3 * (textW + gap))]), textW, gap)).toEqual({ a: 0, b: 2, c: 3 });
  });

  it("фото на всю страницу нет — общий пустой объект: глава превью не перерисовывается", () => {
    expect(photoColumns(flow([]), textW, gap)).toBe(NO_PHOTO_PAGES);
    expect(samePhotoPages(undefined, NO_PHOTO_PAGES)).toBe(true);
    expect(samePhotoPages({ a: 1 }, { a: 1 })).toBe(true);
    expect(samePhotoPages({ a: 1 }, { a: 2 })).toBe(false);
    expect(samePhotoPages({ a: 1 }, NO_PHOTO_PAGES)).toBe(false);
    expect(samePhotoPages(undefined, { a: 0 })).toBe(false);
  });
});

describe("колонки главы: на месте фото на всю страницу — пустая заглушка во всю колонку, без снимка", () => {
  const format = formats.a5;
  const px = 480 / format.widthMm;
  const kit = pageKit(getInteriorDesign("romance"), format, pxUnits(px), "ru");
  const url = "/api/photos/p1?size=full";
  const chapter: PreviewChapter = {
    key: "intro",
    number: 1,
    title: "Вместо предисловия",
    entries: [
      {
        id: "q1",
        heading: "Ты в трёх словах",
        answer: "123 ".repeat(600).trim(),
        media: [],
        photos: [{ id: "p1", url, width: 738, height: 1600, caption: "", inline: { page: true, pageFit: "contain", align: "center", frame: "none", width: 100, anchor: null, aspect: "original", focusX: 0.5, focusY: 0.5 } }],
      },
    ],
  };
  const markup = renderToStaticMarkup(
    createElement(ChapterPages, {
      chapter,
      contentKey: chapterContentKey(chapter),
      kit,
      pageW: 480,
      px,
      bookTitle: "История нашей любви",
      language: "ru",
      t: ru.editor.preview,
      pages: 3,
      photoPages: { p1: 2 },
      currentId: "q1",
      selectedId: "p1",
      interactive: true,
      drag: null,
      scroll: createRef<HTMLDivElement>(),
      setMeasureRef: () => {},
      measure: () => {},
      onPageClick: () => {},
    }),
  );

  it("заглушка с колонкой во всю высоту и разрывами до и после, внутри пусто", () => {
    const holders = [...markup.matchAll(/<div[^>]*data-page-photo="p1"[^>]*>(.*?)<\/div>/g)];
    expect(holders).toHaveLength(1);
    expect(holders[0][0]).toMatch(/break-before:column/);
    expect(holders[0][0]).toMatch(/break-after:column/);
    expect(holders[0][1]).toBe("");
  });

  it("снимка в колонках нет — его рисует полоса поверх (страницы строятся у видимой области, на сервере их нет)", () => {
    expect(markup).not.toContain(url);
  });
});
