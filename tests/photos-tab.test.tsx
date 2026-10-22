import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { PhotosManager } from "@/app/(app)/books/[id]/photos/PhotosManager";
import {
  BANNER_MIN,
  canShowWhole,
  cropFrameOf,
  deleteDialogOf,
  filterCounts,
  lossOf,
  matchesFilter,
  visibleFilters,
  wideBleedIds,
  type PhotosTabData,
  type TabPhoto,
} from "@/app/(app)/books/[id]/photos/photos-tab";
import { MessagesContext } from "@/i18n/context";
import { kk } from "@/i18n/messages/kk";
import { ru } from "@/i18n/messages/ru";
import { formats } from "@/lib/book/formats";
import { getInteriorDesign } from "@/lib/book/interiors";
import { WARN_LOSS } from "@/lib/book/photo-loss";
import { gridCellFrame, openerFrame, pageFrame } from "@/lib/book/photo-pages";
import type { PhotoPlace } from "@/lib/book/photo-place";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh() {} }), usePathname: () => "/", useSearchParams: () => new URLSearchParams() }));

// Вкладка «Фото»: фильтры, обрезка и совет «Показать целиком», рамка «Кадра» по месту, вопрос при удалении.

const html = (el: ReactElement, messages: typeof ru | typeof kk = ru) => renderToStaticMarkup(createElement(MessagesContext.Provider, { value: messages }, el));
const text = (markup: string) => markup.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

const place = (kind: PhotoPlace["kind"], extra: Partial<PhotoPlace> = {}): PhotoPlace => ({ kind, auto: false, onCover: null, ...extra });
const photo = (id: string, layout: TabPhoto["layout"] = "full", extra: Partial<TabPhoto> = {}): TabPhoto => ({ id, width: 3000, height: 1500, caption: "", layout, questionId: null, chapter: null, opener: false, crop: null, ...extra });

const places = new Map<string, PhotoPlace>([
  ["answer", place("answer", { chapterKey: "a", questionId: "q1" })],
  ["opener", place("opener", { chapterKey: "a" })],
  ["auto", place("after", { chapterKey: "a", auto: true })],
  ["wide1", place("after", { chapterKey: "b" })],
  ["wide2", place("album", { auto: true })],
  ["cover", place("off", { auto: true, onCover: "cover" })],
  ["off", place("off")],
]);
const photos = [photo("answer"), photo("opener"), photo("auto"), photo("wide1", "bleed"), photo("wide2", "bleed"), photo("cover"), photo("off")];
const losses: Record<string, number> = { wide1: 0.5, wide2: 0.42, auto: 0.1 };
const lossById = (id: string) => losses[id] ?? 0;

describe("фильтры вкладки «Фото»", () => {
  it("«Встали сами» — напечатаются по правилу книги; «Не печатаются» — и по выбору, и снимок обложки; «С обрезкой» — от WARN_LOSS", () => {
    const of = (f: Parameters<typeof matchesFilter>[0]) => photos.filter((p) => matchesFilter(f, places.get(p.id), lossById(p.id))).map((p) => p.id);
    expect(of("all")).toHaveLength(photos.length);
    expect(of("auto")).toEqual(["auto", "wide2"]);
    expect(of("cover")).toEqual(["cover"]);
    expect(of("off")).toEqual(["cover", "off"]);
    expect(of("crop")).toEqual(["wide1", "wide2"]);
    expect(matchesFilter("crop", undefined, WARN_LOSS)).toBe(true);
    expect(matchesFilter("crop", undefined, WARN_LOSS - 0.01)).toBe(false);
  });

  it("счётчики и видимые чипы: пустые фильтры прячутся, кроме выбранного (ссылка ?filter=crop)", () => {
    const counts = filterCounts(photos, places, lossById);
    expect(counts).toEqual({ all: 7, auto: 2, cover: 1, off: 2, crop: 2 });
    const none = filterCounts([photo("answer")], places, lossById);
    expect(visibleFilters(none, "all")).toEqual(["all"]);
    expect(visibleFilters(none, "crop")).toEqual(["all", "crop"]);
  });
});

describe("обрезка и совет «Показать целиком»", () => {
  it("пока вид на странице поменяли, а книгу не пересобрали, прежняя оценка обрезки не показывается", () => {
    expect(lossOf(photo("wide1", "bleed"), photo("wide1", "bleed"), losses)).toBe(0.5);
    expect(lossOf(photo("wide1", "full"), photo("wide1", "bleed"), losses)).toBe(0);
    expect(lossOf(photo("new", "bleed"), undefined, losses)).toBe(0);
  });

  it("«Показать целиком» — у фото «До краёв» на страницах фото; совет — когда таких два и больше", () => {
    expect(wideBleedIds(photos, places, lossById)).toEqual(["wide1", "wide2"]);
    expect(wideBleedIds(photos, places, lossById).length).toBeGreaterThanOrEqual(BANNER_MIN);
    // Фото в ответе («на всю страницу» в истории) правится во вкладке «Текст», сетка — «Кадром».
    expect(canShowWhole(photo("x", "bleed"), place("answer"), 0.6)).toBe(false);
    expect(canShowWhole(photo("x", "grid"), place("after"), 0.6)).toBe(false);
    expect(canShowWhole(photo("x", "bleed"), place("album"), 0.2)).toBe(false);
  });
});

describe("рамка «Кадра» — по месту фото", () => {
  const a5 = formats.a5;
  const luna = getInteriorDesign("luna");
  const plain = getInteriorDesign("airmail");

  it("фото главы — форма оформления; без фото главы в оформлении — кадра нет", () => {
    expect(cropFrameOf(place("opener"), "full", a5, luna)).toEqual(openerFrame(a5, luna));
    expect(cropFrameOf(place("opener"), "full", a5, luna)?.mask).toBe("circle");
    expect(plain.opener.photo).toBeFalsy();
    expect(cropFrameOf(place("opener"), "full", a5, plain)).toBeNull();
  });

  it("страницы фото: под обрез — лист, сетка — клетка; целиком и в ответе — без кадра", () => {
    expect(cropFrameOf(place("after"), "bleed", a5, luna)).toEqual(pageFrame(a5));
    expect(cropFrameOf(place("album"), "grid", a5, luna)).toEqual(gridCellFrame(a5, luna));
    expect(cropFrameOf(place("after"), "full", a5, luna)).toBeNull();
    expect(cropFrameOf(place("after"), "half", a5, luna)).toBeNull();
    expect(cropFrameOf(place("answer"), "bleed", a5, luna)).toBeNull();
    expect(cropFrameOf(place("off"), "bleed", a5, luna)).toBeNull();
  });
});

describe("вопрос при удалении", () => {
  const t = ru.books.photosTab.delete;
  const names = { place: "Фото главы «Детство»", chapter: () => "Детство" };

  it("снимок обложки: «Удалить отовсюду» и «Оставить только на обложке»", () => {
    const d = deleteDialogOf(place("after", { chapterKey: "a", onCover: "cover" }), t, names);
    expect(d.confirmLabel).toBe(t.deleteAll);
    expect(d.altLabel).toBe(t.keepCover);
    expect(d.text).toContain(t.cover);
    expect(d.text).toContain(t.now(names.place));
  });

  it("снимок оборота — тот же вопрос, даже если внутри он не печатается", () => {
    const d = deleteDialogOf(place("off", { auto: true, onCover: "back" }), t, names);
    expect(d.altLabel).toBe(t.keepCover);
    expect(d.confirmLabel).toBe(t.deleteAll);
  });

  it("фото главы: строка о том, что глава начнётся со страницы с названием; вариант — «Не печатать в книге»", () => {
    const d = deleteDialogOf(place("opener", { chapterKey: "a" }), t, names);
    expect(d.text).toContain(t.opener("Детство"));
    expect(d.confirmLabel).toBe(t.confirm);
    expect(d.altLabel).toBe(t.keep);
    expect(d.text).not.toContain(t.cover);
  });

  it("обычное фото — «Удалить» и «Не печатать в книге»; уже не печатается — только «Удалить» и «Отмена»", () => {
    expect(deleteDialogOf(place("answer", { questionId: "q" }), t, names)).toMatchObject({ confirmLabel: t.confirm, altLabel: t.keep, cancelLabel: t.cancel });
    const off = deleteDialogOf(place("off"), t, names);
    expect(off.altLabel).toBeUndefined();
    expect(off.cancelLabel).toBe(t.cancel);
    // Только что загруженное (места ещё нет) — без строки «Сейчас».
    expect(deleteDialogOf(undefined, t, names)).toEqual({ title: t.title, text: t.text, confirmLabel: t.confirm, cancelLabel: t.cancel });
  });
});

describe("вкладка «Фото» целиком", () => {
  const data = (over: Partial<PhotosTabData> = {}): PhotosTabData => ({
    book: { id: "b1", interior: "luna", format: "a5", language: "ru", blank: false, photoPlacement: "chapters", galleryTitle: "Наши моменты", editable: true },
    photos,
    places: [...places],
    chapters: [
      { key: "a", title: "Детство", printed: true },
      { key: "b", title: "Юность", printed: true },
    ],
    answers: [{ id: "q1", title: "Первый день", chapterKey: "a" }],
    tocLines: {},
    losses,
    ...over,
  });
  const render = (d: PhotosTabData, messages: typeof ru | typeof kk = ru, filter: Parameters<typeof PhotosManager>[0]["initialFilter"] = "all") => text(html(createElement(PhotosManager, { data: d, initialFilter: filter }), messages));

  it("объяснение, правило с названием альбома, фильтры со счётом, совет на два фото и места под фото", () => {
    const t = render(data());
    expect(t).toContain(ru.books.photosTab.intro);
    expect(t).toContain(ru.books.photosTab.rule.title);
    expect(t).toContain(ru.books.photosTab.rule.end.text("Наши моменты"));
    expect(t).toContain(`${ru.books.photosTab.filters.crop} 2`);
    expect(t).toContain(ru.books.photosTab.banner(2));
    expect(t).toContain(ru.books.photosTab.bannerYes);
    expect(t.match(new RegExp(ru.books.photosTab.placeBtn, "g"))?.length).toBeGreaterThanOrEqual(photos.length);
    expect(t).toContain("Фото главы «Детство»");
    expect(t).toContain(ru.editor.photoPlace.withAuto(ru.editor.photoPlace.album));
    expect(t).toContain(ru.books.photosTab.lossChip(50));
    expect(t).toContain(ru.books.photos.inAnswerNote);
  });

  it("одно широкое фото — метка у фото, без общего совета; фильтр из ссылки показывает только фото с обрезкой", () => {
    const one = data({ losses: { wide1: 0.5 } });
    expect(render(one)).not.toContain(ru.books.photosTab.bannerYes);
    expect(render(one)).toContain(ru.books.photosTab.showWhole);
    const crop = render(one, ru, "crop");
    expect(crop).toContain(ru.books.photosTab.lossChip(50));
    expect(crop).not.toContain(ru.books.photos.inAnswerNote);
  });

  it("нет глав с текстом — правило «после глав» говорит, что фото соберутся в альбом; по-казахски", () => {
    const d = data({ chapters: [{ key: "a", title: "Балалық", printed: false }] });
    expect(render(d)).toContain(ru.books.photosTab.noChapters);
    const k = render(d, kk);
    expect(k).toContain(kk.books.photosTab.noChapters);
    expect(k).toContain(kk.books.photosTab.banner(2));
  });

  it("книга только для чтения — без совета, удаления и «Показать целиком»", () => {
    const t = render(data({ book: { ...data().book, editable: false } }));
    expect(t).not.toContain(ru.books.photosTab.bannerYes);
    expect(t).not.toContain(ru.books.photosTab.showWhole);
    expect(html(createElement(PhotosManager, { data: data({ book: { ...data().book, editable: false } }), initialFilter: "all" }))).not.toContain(`aria-label="${ru.books.photos.delete}"`);
  });
});
