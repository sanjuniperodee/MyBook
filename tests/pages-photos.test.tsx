import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ChaptersEditor, type ChapterPhotoRows } from "@/app/(app)/books/[id]/pages/ChaptersEditor";
import { chapterPhotoCount, chapterPhotoStatus, designNotice, markedOpeners, openerShapeOf, placesForDesign } from "@/app/(app)/books/[id]/pages/pages-photos";
import { coverFillOrder, withCoverNow } from "@/app/(app)/books/[id]/cover/cover-fill";
import { FrameControls } from "@/components/cover/FrameEditor";
import { InteriorSpread, sampleOpener, type SpreadSample } from "@/components/interior/InteriorSpread";
import { MessagesContext } from "@/i18n/context";
import { kk } from "@/i18n/messages/kk";
import { ru } from "@/i18n/messages/ru";
import { formats } from "@/lib/book/formats";
import { getInteriorDesign, interiorDesigns } from "@/lib/book/interiors";
import { PHOTO_OFF_KEY } from "@/lib/book/layout";
import { photoPlaceOf, type PhotoPlace } from "@/lib/book/photo-place";
import type { SampleTocCandidate } from "@/lib/book/toc";
import { checkReadiness } from "@/modules/authoring/domain/readiness";
import { bookSpreadSample } from "@/server/spreadSample";
import { buildLayout, layoutBundle, layoutPhoto as photo } from "./fixtures/layout-books";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh() {} }), usePathname: () => "/", useSearchParams: () => new URLSearchParams() }));

// Вкладка «Страницы» и фото глав: значок оформлений с фото главы, подсказки при смене оформления, состояние фото главы
// в строке «Главы книги», пример разворота по правилам 2; вкладка «Обложка» — какие фото подставлять; проверка готовности.

const html = (el: ReactElement, messages: typeof ru | typeof kk = ru) => renderToStaticMarkup(createElement(MessagesContext.Provider, { value: messages }, el));
const text = (markup: string) => markup.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

const place = (kind: PhotoPlace["kind"], p: Partial<PhotoPlace> = {}): PhotoPlace => ({ kind, auto: false, onCover: null, ...p });

describe("значок оформлений: есть ли фото главы и какой оно формы", () => {
  it("фото главы — у оформлений-фотокниг (и нового lens), у каждого своя форма со словом в обоих языках", () => {
    const withPhoto = interiorDesigns.filter((d) => openerShapeOf(d));
    expect(withPhoto.map((d) => d.id).sort()).toEqual(["arches", "cinema", "gallery", "lens", "luna", "memories", "photobook"]);
    for (const d of withPhoto) {
      expect(ru.editor.openerShape[openerShapeOf(d)!]).toBeTruthy();
      expect(kk.editor.openerShape[openerShapeOf(d)!]).toBeTruthy();
    }
    expect(openerShapeOf(getInteriorDesign("luna"))).toBe("circle");
  });
});

describe("места фото под оформление, выбранное сейчас (R5)", () => {
  const photos = [
    { id: "a", opener: true },
    { id: "b", opener: false },
    { id: "c", opener: true },
  ];
  const noPhotoDesign = new Map<string, PhotoPlace>([
    ["a", place("after", { chapterKey: "k1" })],
    ["b", place("after", { chapterKey: "k1", auto: true })],
    ["c", place("after", { chapterKey: "k1" })],
  ]);

  it("в оформлении с фото главы отмеченное фото после главы встаёт в начало — одно на главу", () => {
    const p = placesForDesign(noPhotoDesign, photos, true);
    expect(p.get("a")).toMatchObject({ kind: "opener", chapterKey: "k1" });
    expect(p.get("b")).toMatchObject({ kind: "after", auto: true });
    expect(p.get("c")).toMatchObject({ kind: "after" });
  });

  it("в оформлении без фото главы фото главы печатается после текста; без перемен — тот же объект", () => {
    const withOpener = new Map<string, PhotoPlace>([["a", place("opener", { chapterKey: "k1" })]]);
    expect(placesForDesign(withOpener, photos, false).get("a")).toMatchObject({ kind: "after", chapterKey: "k1", auto: false });
    expect(placesForDesign(withOpener, photos, true)).toBe(withOpener);
    expect(markedOpeners(photos, withOpener)).toBe(1);
  });
});

describe("состояние фото главы в строке главы", () => {
  const places = new Map<string, PhotoPlace>([
    ["p1", place("opener", { chapterKey: "meet" })],
    ["p2", place("after", { chapterKey: "meet", auto: true })],
    ["p3", place("after", { chapterKey: "date" })],
  ]);

  it("выбрано, «без фото», не выбрано, в оформлении нет", () => {
    expect(chapterPhotoStatus("meet", places, {}, true)).toEqual({ kind: "chosen", photoId: "p1", auto: false });
    expect(chapterPhotoStatus("date", places, { "c:date": { noOpenerPhoto: true } }, true)).toEqual({ kind: "none" });
    expect(chapterPhotoStatus("date", places, {}, true)).toEqual({ kind: "needed" });
    expect(chapterPhotoStatus("meet", places, {}, false)).toEqual({ kind: "noDesign" });
    expect(chapterPhotoCount("meet", places)).toBe(2);
    expect(chapterPhotoCount("love", places)).toBe(0);
  });

  const chapter = (key: string, label: string, first = false): SampleTocCandidate => ({ key: `c:${key}`, pageKey: key, kind: "chapter", number: 1, label, page: 5, ...(first ? { first: true } : {}) });
  const candidates: SampleTocCandidate[] = [chapter("meet", "Знакомство", true), chapter("date", "Первое свидание"), chapter("love", "Любовь"), chapter("__letters", "Письма близких")];
  const rows = (opts: Partial<ChapterPhotoRows> = {}): ChapterPhotoRows => ({ places, openerDesign: true, album: null, onOpen: () => {}, ...opts });
  const render = (photoRows: ChapterPhotoRows, extra: { blank?: boolean; lines?: Record<string, { noOpenerPhoto?: boolean }> } = {}, messages: typeof ru | typeof kk = ru) =>
    html(createElement(ChaptersEditor, { bookId: "b1", stories: {}, candidates, lines: extra.lines ?? {}, editable: true, onChange: () => {}, photos: photoRows, blank: extra.blank }), messages);

  it("строки: миниатюра выбранного фото, «без фото», «Выбрать фото»; у писем близких кнопки нет", () => {
    const markup = render(rows(), { lines: { "c:date": { noOpenerPhoto: true } } });
    expect(markup.match(/data-photo-status="chosen"/g)).toHaveLength(1);
    expect(markup).toContain("/api/photos/p1?size=thumb");
    expect(markup.match(/data-photo-status="none"/g)).toHaveLength(1);
    expect(markup.match(/data-photo-status="needed"/g)).toHaveLength(1);
    expect(markup.match(/data-photo-status=/g)).toHaveLength(3);
    const t = text(markup);
    expect(t).toContain("Фото главы · 2");
    expect(t).toContain("Фото главы · 1 · без фото");
    expect(t).toContain("Выбрать фото");
  });

  it("оформление без фото главы: «нет фото в начале» у каждой главы", () => {
    const t = text(render(rows({ openerDesign: false })));
    expect(t.match(/нет фото в начале/g)).toHaveLength(3);
    expect(t).not.toContain("Выбрать фото");
  });

  it("строка альбома — когда в нём есть фото; кнопка «Изменить»", () => {
    expect(text(render(rows()))).not.toContain("Альбом в конце");
    const t = text(render(rows({ album: { title: "Наши моменты", count: 3 } })));
    expect(t).toContain("Альбом в конце «Наши моменты» · 3 фото");
    expect(t).toContain("Изменить");
  });

  it("своя книга: только фото глав — без полей названия и кнопки «Убрать»", () => {
    const markup = render(rows(), { blank: true });
    expect(markup).not.toContain("<input");
    expect(text(markup)).not.toContain("Убрать главу");
    expect(text(markup)).toContain("Первое свидание");
    expect(markup.match(/data-photo-status=/g)).toHaveLength(3);
  });

  it("по-казахски", () => {
    const t = text(render(rows({ openerDesign: false, album: { title: "Біздің сәттеріміз", count: 2 } }), {}, kk));
    expect(t).toContain("басында фото жоқ");
    expect(t).toContain("Соңындағы альбом «Біздің сәттеріміз» · 2 фото");
  });
});

describe("подсказка при смене оформления", () => {
  const luna = getInteriorDesign("luna");
  const plain = interiorDesigns.find((d) => !d.opener.photo)!;
  const data = {
    chapters: [
      { key: "a", title: "А", printed: true },
      { key: "b", title: "Б", printed: true },
      { key: "c", title: "В", printed: true },
      { key: "d", title: "Пустая", printed: false },
    ],
    photos: [
      { id: "p1", width: 1000, height: 1000, opener: true },
      { id: "p2", width: 1000, height: 1000 },
    ],
  };
  const places = new Map<string, PhotoPlace>([
    ["p1", place("opener", { chapterKey: "a" })],
    ["p2", place("after", { chapterKey: "b", auto: true })],
  ]);

  it("выбрали оформление с фото: форма, сколько глав с фото и какую открыть (не ту, где решили «без фото»)", () => {
    const n = designNotice({ design: luna, from: plain, changed: true, data, places, tocLines: { "c:b": { noOpenerPhoto: true } } });
    expect(n).toEqual({ kind: "toPhoto", shape: "circle", chosen: 1, total: 3, next: "c" });
    expect(ru.books.pagesPhotos.toPhoto(ru.catalog.interiors.luna.name, ru.editor.openerShape.circle, 1, 3)).toContain("Выбрано: 1 из 3");
  });

  it("у всех глав фото — подсказка только сразу после выбора", () => {
    const all = new Map(places);
    all.set("p2", place("opener", { chapterKey: "b" }));
    all.set("p3", place("opener", { chapterKey: "c" }));
    expect(designNotice({ design: luna, from: luna, changed: false, data, places: all, tocLines: {} })).toBeNull();
    expect(designNotice({ design: luna, from: plain, changed: true, data, places: all, tocLines: {} })).toMatchObject({ kind: "toPhoto", chosen: 3, total: 3 });
  });

  it("ушли из оформления с фото, а фото глав выбраны, — их отметки остаются; без выбранных — молчим", () => {
    const after = placesForDesign(places, data.photos, false);
    expect(designNotice({ design: plain, from: luna, changed: true, data, places: after, tocLines: {} })).toEqual({ kind: "leaving" });
    expect(designNotice({ design: plain, from: luna, changed: true, data: { ...data, photos: [{ id: "p2", width: 1, height: 1 }] }, places: after, tocLines: {} })).toBeNull();
    expect(designNotice({ design: plain, from: plain, changed: false, data, places: after, tocLines: {} })).toBeNull();
  });
});

describe("пример разворота: начало главы по правилам 2 — как в книге", () => {
  const sample = (rev: number, photos = [photo("p1", 0), photo("p2", 1, { chapter: "a", opener: true, crop: { x: 0.2, y: 0.4, zoom: 1.5 } })]) => {
    const b = layoutBundle({ chapters: ["a", "b"], photos, book: { layoutRev: rev, interior: "luna" } });
    return bookSpreadSample(b.book, b.questions, b.chapters, "", b.photos);
  };

  it("правила 2: выбранное фото главы с его кадром, а не первое фото книги", () => {
    const s = sample(2);
    expect(s.opener).toEqual({ url: "/api/photos/p2?size=view", crop: { x: 0.2, y: 0.4, zoom: 1.5 } });
  });

  it("правила 2 без выбранного фото главы — страница с названием; в миниатюре выбора оформления — пейзаж", () => {
    const s = sample(2, [photo("p1", 0), photo("p2", 1)]);
    expect(s.opener).toBeNull();
    expect(sampleOpener(s)).toBeUndefined();
    expect(sampleOpener(s, true)).toEqual({});
    const shown = (placeholder: boolean) => html(createElement(InteriorSpread, { design: getInteriorDesign("luna"), format: formats.a5, sample: s as SpreadSample, openerPlaceholder: placeholder }));
    expect(shown(false)).not.toContain("/api/photos/p1");
    expect(shown(false)).not.toContain("/api/photos/p2");
  });

  it("отмеченное фото в оформлении без фото главы — всё равно фото главы примера (миниатюры других оформлений)", () => {
    const b = layoutBundle({ chapters: ["a"], photos: [photo("p1", 0), photo("p2", 1, { chapter: "a", opener: true })], book: { layoutRev: 2, interior: interiorDesigns.find((d) => !d.opener.photo)!.id } });
    expect(bookSpreadSample(b.book, b.questions, b.chapters, "", b.photos).opener).toEqual({ url: "/api/photos/p2?size=view" });
  });

  it("прежние правила — как раньше: первое фото книги", () => {
    const s = sample(1);
    expect(s.opener).toBeUndefined();
    expect(sampleOpener(s)?.url).toBe("/api/photos/p1?size=full");
  });
});

describe("обложка: какие фото подставлять в пустые места", () => {
  const b = layoutBundle({
    chapters: ["a", "b"],
    photos: [
      photo("ans", 0, { questionId: "q-a" }),
      photo("open", 1, { chapter: "a", opener: true }),
      photo("pinned", 2, { chapter: "b" }),
      photo("auto", 3),
      photo("off", 4, { chapter: PHOTO_OFF_KEY }),
      photo("wait", 5, { chapter: "zz" }),
    ],
    book: { layoutRev: 2 },
  });
  const places = photoPlaceOf(buildLayout(b), b.photos, b.book);

  it("сначала без выбранного места, потом остальные; фото главы и фото в ответе — никогда", () => {
    expect(coverFillOrder([...b.photos, { id: "new" }], places)).toEqual(["auto", "off", "new", "pinned", "wait"]);
  });

  it("значок «на обложке» — по снимкам, выбранным сейчас", () => {
    expect(withCoverNow(places.get("auto"), "auto", ["auto"], [])?.onCover).toBe("cover");
    expect(withCoverNow(places.get("auto"), "auto", [null], ["auto"])?.onCover).toBe("back");
    expect(withCoverNow(places.get("auto"), "auto", [], [])).toBe(places.get("auto"));
  });

  it("подсказка кадра: на телефоне — без колёсика мыши", () => {
    const slot = { key: "cover:0", slot: 0, x: 0, y: 0, w: 1, h: 1, photo: { width: 100, height: 100 }, frame: { zoom: 1, x: 0.5, y: 0.5 } };
    const markup = html(createElement(FrameControls, { slots: [slot] as never, selected: null, onSelect: () => {}, onChange: () => {}, labels: { ...ru.books.cover.frame, hintTouch: ru.books.coverPhotos.frameHintTouch } }));
    expect(markup).toContain("pointer-coarse:block");
    expect(text(markup)).toContain(ru.books.coverPhotos.frameHintTouch);
    expect(ru.books.coverPhotos.frameHintTouch).not.toContain("Колёсико");
  });
});

describe("готовность к заказу: главы без фото и сильная обрезка — предупреждения", () => {
  const stats = { answered: 20, total: 20, photos: 3, words: 5000, estimatedPages: 60, printedPages: 60, emptyChapters: 0 };
  const readiness = (rev: number, photos: Parameters<typeof layoutBundle>[0]["photos"], book: Parameters<typeof layoutBundle>[0]["book"] = {}) => {
    const b = layoutBundle({ chapters: ["a", "b", "c"], photos, book: { layoutRev: rev, interior: "luna", ...book } });
    const row = { ...b.book, coverTemplate: "classic", coverPhotoExtra: [] };
    return checkReadiness(row, stats, b.photos, "ru", buildLayout(b));
  };

  it("оформление с фото главы: главы без фото (кроме решивших «без фото») — ссылка на первый ответ первой такой главы", () => {
    const issues = readiness(2, [photo("p1", 0, { chapter: "a", opener: true })], { tocLines: { "c:c": { noOpenerPhoto: true } } });
    const missing = issues.find((i) => i.text.includes("без фото в начале"));
    expect(missing).toMatchObject({ level: "warning", href: "/books/b1/questions?s=q-b" });
    expect(missing!.text).toContain("Одна глава");
    expect(missing!.text).toContain(`«${ru.catalog.interiors.luna.name}»`);
    expect(issues.every((i) => i.level !== "error" || !i.text.includes("фото в начале"))).toBe(true);
  });

  it("все главы с фото или в оформлении без фото главы — молчим", () => {
    const all = [photo("p1", 0, { chapter: "a", opener: true }), photo("p2", 1, { chapter: "b", opener: true }), photo("p3", 2, { chapter: "c", opener: true })];
    expect(readiness(2, all).some((i) => i.text.includes("без фото в начале"))).toBe(false);
    const plain = interiorDesigns.find((d) => !d.opener.photo)!.id;
    expect(readiness(2, [], { interior: plain }).some((i) => i.text.includes("без фото в начале"))).toBe(false);
  });

  it("фото «до краёв» с обрезкой ≥ 0,3 — счёт и ссылка на фильтр «С обрезкой»", () => {
    const issues = readiness(2, [photo("wide", 0, { layout: "bleed", width: 3000, height: 1000 }), photo("ok", 1, { layout: "bleed", width: 1480, height: 2100 })], { interior: interiorDesigns.find((d) => !d.opener.photo)!.id });
    expect(issues.find((i) => i.href?.endsWith("/photos?filter=crop"))).toMatchObject({ level: "warning", text: ru.books.readiness.heavyCrop(1) });
  });

  it("без собранной книги — прежние проверки", () => {
    const b = layoutBundle({ chapters: ["a"], photos: [], book: { interior: "luna" } });
    expect(checkReadiness({ ...b.book, coverTemplate: "classic", coverPhotoExtra: [] }, stats, []).some((i) => i.text.includes("без фото в начале"))).toBe(false);
  });
});
