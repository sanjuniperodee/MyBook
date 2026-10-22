import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { CropDialog, frameLabelKey } from "@/components/editor/CropDialog";
import { PanFrame } from "@/components/editor/PanFrame";
import { ChapterPhotoSheet } from "@/components/editor/photos/ChapterPhotoSheet";
import { GallerySheet } from "@/components/editor/photos/GallerySheet";
import {
  albumOutTarget,
  albumPhotos,
  albumRemoval,
  applyPatch,
  confirmFor,
  currentOption,
  galleryTitleOf,
  isSamePlace,
  moveUpdates,
  noOpenerPhotoOf,
  placeNames,
  placePatch,
  projectPlace,
  reorderWithin,
  restoreUpdates,
  snapshotOf,
  withGalleryTitle,
  withNoOpenerPhoto,
  type PlaceContext,
  type PlaceData,
  type PlaceEvents,
  type SheetPhoto,
} from "@/components/editor/photos/model";
import { chooserGroups } from "@/components/editor/photos/PhotoChooser";
import { PhotoIntroCard } from "@/components/editor/photos/PhotoIntro";
import { PlaceBadge, placeText } from "@/components/editor/photos/PlaceBadge";
import { PlaceSheet } from "@/components/editor/photos/PlaceSheet";
import { MessagesContext } from "@/i18n/context";
import { kk } from "@/i18n/messages/kk";
import { ru } from "@/i18n/messages/ru";
import { getFormat } from "@/lib/book/formats";
import { getInteriorDesign } from "@/lib/book/interiors";
import { PHOTO_OFF_KEY } from "@/lib/book/layout";
import { openerFrame } from "@/lib/book/photo-pages";
import type { PhotoPlace } from "@/lib/book/photo-place";
import { GALLERY_KEY } from "@/lib/book/toc";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh() {} }), usePathname: () => "/", useSearchParams: () => new URLSearchParams() }));

// Общие листы мест фото (S1 «Фото главы», S2 подпись места, S3 «Где стоит фото», S9 «Альбом в конце», S13 кадр):
// что видит автор в каждом состоянии и что уходит на сервер.

type Messages = typeof ru | typeof kk;
const html = (el: ReactElement, messages: Messages = ru) => renderToStaticMarkup(createElement(MessagesContext.Provider, { value: messages }, el));
const text = (markup: string) => markup.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

const photo = (id: string, extra: Partial<SheetPhoto> = {}): SheetPhoto => ({ id, width: 3000, height: 2000, questionId: null, chapter: null, opener: false, crop: null, caption: "", layout: "full", ...extra });
const place = (kind: PhotoPlace["kind"], extra: Partial<PhotoPlace> = {}): PhotoPlace => ({ kind, auto: false, onCover: null, ...extra });

// Книга: ответ в «Знакомстве», фото главы «Знакомства», фото после неё, вставшее само после «Любви», альбом,
// «не печатается», снимок обложки и фото, ждущее главу без текста.
const photos: SheetPhoto[] = [
  photo("p1", { questionId: "q1" }),
  photo("p2", { chapter: "meet", opener: true, crop: { x: 0.4, y: 0.2, zoom: 1.2 } }),
  photo("p3", { chapter: "meet" }),
  photo("p4"),
  photo("p5", { chapter: GALLERY_KEY }),
  photo("p6", { chapter: PHOTO_OFF_KEY }),
  photo("p7"),
  photo("p8", { chapter: "later" }),
  photo("p9"),
];
const places = new Map<string, PhotoPlace>([
  ["p1", place("answer", { questionId: "q1", chapterKey: "meet" })],
  ["p2", place("opener", { chapterKey: "meet" })],
  ["p3", place("after", { chapterKey: "meet" })],
  ["p4", place("after", { chapterKey: "love", auto: true })],
  ["p5", place("album")],
  ["p6", place("off")],
  ["p7", place("off", { auto: true, onCover: "cover" })],
  ["p8", place("after", { chapterKey: "love", auto: true, waitingFor: "later" })],
  ["p9", place("album", { auto: true })],
]);
const chapters = [
  { key: "meet", title: "Знакомство", number: 1, printed: true },
  { key: "love", title: "Любовь", number: 2, printed: true },
  { key: "later", title: "Потом", number: 3, printed: false },
];
const answers = [{ id: "q1", title: "Как вы познакомились", chapterKey: "meet" }];
const names = placeNames(chapters, answers);

const data = (book: Partial<PlaceData["book"]> = {}, over: Partial<PlaceData> = {}): PlaceData => ({
  book: { id: "b1", interior: "luna", format: "a5", language: "ru", blank: false, photoPlacement: "chapters", galleryTitle: "Наши моменты", editable: true, ...book },
  photos,
  places,
  chapters,
  answers,
  tocLines: {},
  ...over,
});
const on: PlaceEvents = { onPhotos: () => {} };
const ctx = (over: Partial<PlaceContext> = {}): PlaceContext => ({ openerDesign: true, photoPlacement: "chapters", printed: new Set(["meet", "love"]), chapterOfQuestion: (id) => (id === "q1" ? "meet" : undefined), ...over });

describe("правила листов мест: что записать", () => {
  it("каждый выбор — одна правка места; служебные ключи пишет только placePatch", () => {
    expect(placePatch({ kind: "answer", questionId: "q1" })).toEqual({ questionId: "q1" });
    expect(placePatch({ kind: "opener", chapterKey: "meet" })).toEqual({ questionId: null, chapter: "meet", opener: true });
    expect(placePatch({ kind: "after", chapterKey: "meet" })).toEqual({ questionId: null, chapter: "meet", opener: false });
    expect(placePatch({ kind: "album" })).toEqual({ questionId: null, chapter: GALLERY_KEY });
    expect(placePatch({ kind: "auto" })).toEqual({ questionId: null, chapter: null });
    expect(placePatch({ kind: "off" })).toEqual({ questionId: null, chapter: PHOTO_OFF_KEY });
  });

  it("вопрос — только когда фото уходит из ответа или из фото другой главы (R12)", () => {
    expect(confirmFor(places.get("p1"), { kind: "opener", chapterKey: "love" })).toEqual({ kind: "answer", questionId: "q1" });
    expect(confirmFor(places.get("p1"), { kind: "answer", questionId: "q1" })).toBeNull();
    expect(confirmFor(places.get("p2"), { kind: "opener", chapterKey: "love" })).toEqual({ kind: "opener", chapterKey: "meet" });
    // Та же глава — фото главы уходит после неё без вопроса; подставленное прежними правилами — тоже.
    expect(confirmFor(places.get("p2"), { kind: "after", chapterKey: "meet" })).toBeNull();
    expect(confirmFor(place("opener", { chapterKey: "meet", auto: true }), { kind: "album" })).toBeNull();
    expect(confirmFor(places.get("p3"), { kind: "opener", chapterKey: "love" })).toBeNull();
    expect(confirmFor(places.get("p5"), { kind: "off" })).toBeNull();
  });

  it("«сейчас здесь»: выбранное место, «само» и ждущее главу без текста", () => {
    expect(currentOption(places.get("p3"))).toBe("after");
    expect(currentOption(places.get("p4"))).toBe("auto");
    expect(currentOption(places.get("p8"), { opener: false })).toBe("after");
    expect(currentOption(places.get("p8"), { opener: true })).toBe("opener");
    expect(isSamePlace(places.get("p4"), { kind: "auto" })).toBe(true);
    expect(isSamePlace(places.get("p8"), { kind: "auto" })).toBe(false);
    expect(isSamePlace(places.get("p3"), { kind: "after", chapterKey: "love" })).toBe(false);
  });

  it("новое фото главы: прежнее выбранное сначала уходит после главы; «Отменить» возвращает всё как было", () => {
    const moves = [{ id: "p3", target: { kind: "opener" as const, chapterKey: "meet" } }];
    const updates = moveUpdates(moves, places);
    expect(updates).toEqual([
      { id: "p2", patch: { questionId: null, chapter: "meet", opener: false } },
      { id: "p3", patch: { questionId: null, chapter: "meet", opener: true } },
    ]);
    const apply = (list: SheetPhoto[], ups: { id: string; patch: Parameters<typeof applyPatch>[1] }[]) => ups.reduce((acc, u) => acc.map((p) => (p.id === u.id ? applyPatch(p, u.patch) : p)), list);
    const snaps = updates.map((u) => snapshotOf(photos.find((p) => p.id === u.id)!));
    const moved = apply(photos, updates);
    expect(moved.find((p) => p.id === "p3")?.opener).toBe(true);
    expect(moved.find((p) => p.id === "p2")?.opener).toBe(false);
    // Фото главы возвращается последним — его отметку не снимет соседняя правка.
    const restore = restoreUpdates(snaps);
    expect(restore.map((u) => u.id)).toEqual(["p3", "p2"]);
    expect(apply(moved, restore)).toEqual(photos.map((p) => ({ ...p, chapter: p.chapter ?? null })));
  });

  it("из ответа в главу и обратно: отметка — только у фото с настоящей главой и не в ответе (правило домена)", () => {
    const fromAnswer = applyPatch(photos[0], placePatch({ kind: "opener", chapterKey: "love" }));
    expect(fromAnswer).toMatchObject({ questionId: null, chapter: "love", opener: true });
    const back = applyPatch(fromAnswer, { questionId: "q1" });
    expect(back).toMatchObject({ questionId: "q1", chapter: null, opener: false });
    expect(applyPatch(photos[1], { chapter: GALLERY_KEY })).toMatchObject({ chapter: GALLERY_KEY, opener: false });
    expect(applyPatch(photos[2], { opener: true, chapter: PHOTO_OFF_KEY }).opener).toBe(false);
    // Подпись и вид на странице — тем же правилом.
    expect(applyPatch(photos[2], { caption: "Мы", layout: "bleed" })).toMatchObject({ caption: "Мы", layout: "bleed", chapter: "meet" });
  });

  it("новое место до пересборки: фото главы в оформлении без него — после главы; глава без текста — ждёт", () => {
    expect(projectPlace({ kind: "opener", chapterKey: "love" }, places.get("p3"), ctx())).toMatchObject({ kind: "opener", chapterKey: "love", auto: false });
    expect(projectPlace({ kind: "opener", chapterKey: "love" }, places.get("p3"), ctx({ openerDesign: false }))).toMatchObject({ kind: "after", chapterKey: "love" });
    expect(projectPlace({ kind: "after", chapterKey: "later" }, places.get("p3"), ctx())).toMatchObject({ kind: "after", auto: true, waitingFor: "later" });
    expect(projectPlace({ kind: "auto" }, places.get("p7"), ctx())).toMatchObject({ kind: "off", auto: true, onCover: "cover" });
    expect(projectPlace({ kind: "auto" }, places.get("p3"), ctx({ photoPlacement: "end" }))).toMatchObject({ kind: "album", auto: true });
  });

  it("«Без фото» у главы — отметка в строке главы; выбор фото её снимает; остальные настройки строки целы (R3)", () => {
    const on1 = withNoOpenerPhoto({ "c:meet": { title: "Как всё началось" } }, "meet", true);
    expect(on1).toEqual({ "c:meet": { title: "Как всё началось", noOpenerPhoto: true } });
    expect(noOpenerPhotoOf(on1, "meet")).toBe(true);
    expect(withNoOpenerPhoto(on1, "meet", false)).toEqual({ "c:meet": { title: "Как всё началось" } });
    expect(withNoOpenerPhoto(withNoOpenerPhoto({}, "love", true), "love", false)).toEqual({});
  });

  it("своё название альбома — строка оглавления альбома; пустое возвращает название по виду книги", () => {
    const lines = withGalleryTitle({}, "  Наше лето ");
    expect(lines).toEqual({ [`c:${GALLERY_KEY}`]: { title: "Наше лето" } });
    expect(galleryTitleOf(lines, "Наши моменты")).toBe("Наше лето");
    expect(withGalleryTitle(lines, " ")).toEqual({});
    expect(galleryTitleOf({}, "Наши моменты")).toBe("Наши моменты");
  });

  it("порядок фото после главы: двигается только внутри своего списка, остальные фото книги на местах", () => {
    const all = ["a", "x", "b", "y", "c"];
    expect(reorderWithin(all, ["a", "b", "c"], "b", -1)).toEqual(["b", "x", "a", "y", "c"]);
    expect(reorderWithin(all, ["a", "b", "c"], "c", 1)).toBeNull();
    expect(reorderWithin(all, ["a", "b", "c"], "z", 1)).toBeNull();
  });
});

describe("выбор фото: группы", () => {
  const ids = (gs: ReturnType<typeof chooserGroups>) => Object.fromEntries(gs.map((g) => [g.id, g.photos.map((p) => p.id)]));

  it("фото главы: «подходят по форме» первыми (не больше трёх, без нынешнего), дальше — по местам", () => {
    const groups = ids(chooserGroups(photos, places, "meet", "opener", ["p2", "p9", "p4", "p3", "p1"]));
    expect(groups.fit).toEqual(["p9", "p4", "p3"]);
    expect(groups.answers).toEqual(["p1"]);
    expect(groups.unplaced).toEqual(["p8"]);
    expect(groups.album).toEqual(["p5"]);
    expect(groups.off).toEqual(["p6"]);
    expect(groups.cover).toEqual(["p7"]);
    expect(Object.values(groups).flat()).not.toContain("p2");
  });

  it("после главы: закреплённые после неё не предлагаются; вставшие сами — в группе «После главы»", () => {
    const groups = ids(chooserGroups(photos, places, "love", "after"));
    // Вставшие сами после этой главы (и ждущее главу без текста) — в «После главы»: тап закрепляет их.
    expect(groups.here).toEqual(["p4", "p8"]);
    // Фото главы другой главы — тоже «После других глав» (перенос спросит).
    expect(groups.otherChapters).toEqual(["p2", "p3"]);
    expect(ids(chooserGroups(photos, places, "meet", "after")).otherChapters ?? []).not.toContain("p3");
  });

  it("в альбом: фото альбома не предлагаются", () => {
    const all = Object.values(ids(chooserGroups(photos, places, "", "album"))).flat();
    expect(all).not.toContain("p5");
    expect(all).not.toContain("p9");
    expect(all).toContain("p2");
  });
});

describe("альбом в конце: правила", () => {
  it("порядок печати: выбранные в альбом — первыми, вставшие сами — потом", () => {
    expect(albumPhotos(photos, places).map((p) => p.id)).toEqual(["p5", "p9"]);
  });

  it("× у фото альбома: «пусть встанет само», если правило не вернёт его в альбом, иначе — «не печатать»", () => {
    expect(albumOutTarget(places.get("p5"), ctx())).toEqual({ kind: "auto" });
    expect(albumOutTarget(places.get("p9"), ctx({ photoPlacement: "end" }))).toEqual({ kind: "off" });
    expect(albumOutTarget(places.get("p9"), ctx({ printed: new Set() }))).toEqual({ kind: "off" });
  });

  it("«Убрать альбом»: правило книги и выбранные в альбом фото — после глав (выбор снят) или «не печатать»", () => {
    expect(albumRemoval("chapters", photos, places)).toEqual({ photoPlacement: "chapters", moves: [{ id: "p5", target: { kind: "auto" } }] });
    expect(albumRemoval("none", photos, places)).toEqual({ photoPlacement: "none", moves: [{ id: "p5", target: { kind: "off" } }] });
  });
});

describe("подпись места (PlaceBadge)", () => {
  const badge = (p: PhotoPlace, opts: { blank?: boolean; marked?: boolean; openerDesign?: boolean; open?: boolean } = {}, messages: Messages = ru) =>
    html(createElement(PlaceBadge, { place: p, names, blank: !!opts.blank, marked: opts.marked, openerDesign: opts.openerDesign, onOpen: opts.open ? () => {} : undefined }), messages);

  it("ответ, раздел своей книги, фото главы, после главы, альбом, «не печатается»", () => {
    expect(text(badge(places.get("p1")!))).toContain("В ответе «Как вы познакомились»");
    expect(text(badge(places.get("p1")!, { blank: true }))).toContain("В разделе «Как вы познакомились»");
    expect(text(badge(places.get("p2")!))).toContain("Фото главы «Знакомство»");
    expect(text(badge(places.get("p3")!))).toContain("После главы «Знакомство»");
    expect(text(badge(places.get("p5")!))).toContain("Альбом в конце");
    expect(text(badge(places.get("p6")!))).toContain("Не печатается");
  });

  it("«· само», значок обложки, глава без текста, отметка фото главы в оформлении без него", () => {
    expect(text(badge(places.get("p4")!))).toContain("После главы «Любовь» · само");
    expect(text(badge(places.get("p7")!))).toContain("на обложке");
    expect(text(badge(places.get("p8")!))).toContain("Глава «Потом» пока без текста — фото встанет само");
    expect(text(badge(place("after", { chapterKey: "meet" }), { marked: true, openerDesign: false }))).toContain("Фото главы «Знакомство» · в этом оформлении — после главы");
  });

  it("с onOpen — кнопка с понятным названием и местом не меньше 44px", () => {
    const markup = badge(places.get("p3")!, { open: true });
    expect(markup).toContain("<button");
    expect(markup).toContain("min-h-11");
    expect(markup).toContain("Где стоит фото: После главы «Знакомство». Изменить");
  });

  it("по-казахски", () => {
    expect(text(badge(places.get("p4")!, {}, kk))).toContain(kk.editor.photoPlace.withAuto(kk.editor.photoPlace.after("Любовь")));
    expect(placeText(places.get("p5")!, names, kk.editor, false)).toBe(kk.editor.photoPlace.album);
  });
});

describe("лист «Где стоит фото» (PlaceSheet)", () => {
  const sheet = (photoId: string, d: PlaceData = data(), messages: Messages = ru) => text(html(createElement(PlaceSheet, { data: d, on, photoId, onClose: () => {} }), messages));

  it("в оформлении с фото главы — пункт «Фото главы…» с формой рамки; текущее место отмечено", () => {
    const t = sheet("p3");
    expect(t).toContain("Где стоит фото");
    expect(t).toContain("Фото главы…");
    expect(t).toContain("в круге");
    expect(t).toContain("После главы… сейчас здесь");
    expect(t).toContain("Сейчас такие фото встают после глав по порядку вкладки «Фото»");
    expect(t).toContain("Раздел «Наши моменты» после последней главы");
  });

  it("в оформлении без фото главы пункта нет; у своей книги — «В раздел…»", () => {
    const t = sheet("p1", data({ interior: "classic", blank: true }));
    expect(t).not.toContain("Фото главы…");
    expect(t).toContain("В раздел…");
    expect(t).toContain("В разделе «Как вы познакомились»");
  });

  it("страница фото после главы: «Целиком» — с подписью; «До краёв» — кадр без подписи", () => {
    expect(sheet("p3")).toContain("Подпись");
    const bleed = data({}, { photos: photos.map((p) => (p.id === "p3" ? { ...p, layout: "bleed" as const } : p)) });
    const t = sheet("p3", bleed);
    expect(t).toContain("Кадр");
    expect(t).not.toContain("Подпись");
    // У фото в ответе раскладки страницы нет.
    expect(sheet("p1")).not.toContain("Как на странице");
  });

  it("снимок обложки — напоминание, что обложка его не теряет", () => {
    expect(sheet("p7")).toContain("Это фото и на обложке — там оно останется.");
  });

  it("по-казахски", () => {
    expect(sheet("p3", data(), kk)).toContain(kk.editor.placeSheet.title);
  });
});

describe("лист «Фото главы» (ChapterPhotoSheet)", () => {
  const sheet = (chapterKey: string, d: PlaceData = data(), extra: Partial<Parameters<typeof ChapterPhotoSheet>[0]> = {}, messages: Messages = ru) =>
    html(createElement(ChapterPhotoSheet, { data: d, on, chapterKey, onClose: () => {}, ...extra }), messages);

  it("фото главы выбрано: мини-страница, рамка формы оформления, «Другое фото» и «Без фото»", () => {
    const markup = sheet("meet");
    const t = text(markup);
    expect(t).toContain("Фото главы «Знакомство»");
    expect(t).toContain("Начало главы");
    expect(t).toContain("Другое фото");
    expect(t).toContain("Без фото");
    expect(markup).toContain('data-frame="circle"');
    // Фото после главы — с кнопкой «Добавить фото»; подписи у фото главы нет.
    expect(t).toContain("После главы");
    expect(t).toContain("Добавить фото");
    expect(t).not.toContain("Подпись");
  });

  it("рамка — по оформлению и формату: арка у «Арок»", () => {
    expect(sheet("meet", data({ interior: "arches" }))).toContain('data-frame="arch"');
    expect(openerFrame(getFormat("a5"), getInteriorDesign("arches"))?.mask).toBe("arch");
  });

  it("фото не выбрано: объяснение, «Без фото» и выбор с группами", () => {
    const t = text(sheet("love"));
    expect(t).toContain("Фото не выбрано — глава начнётся со страницы с названием");
    expect(t).toContain("Без фото");
    expect(t).toContain("Выберите фото");
    expect(t).toContain("В ответах");
    expect(t).toContain("Загрузить");
    // Вставшее само после этой главы — в списке «После главы» с чипом «само» и «Закрепить».
    expect(t).toContain("само");
    expect(t).toContain("Закрепить");
  });

  it("«Без фото» выбрано: спокойная строка вместо вопроса", () => {
    const t = text(sheet("love", data({}, { tocLines: withNoOpenerPhoto({}, "love", true) })));
    expect(t).toContain("Глава начнётся без фото");
    expect(t).not.toContain("Фото не выбрано");
  });

  it("фото подставлено прежними правилами — предложение выбрать своё", () => {
    const legacy = new Map(places);
    legacy.set("p2", place("opener", { chapterKey: "meet", auto: true }));
    expect(text(sheet("meet", data({}, { places: legacy })))).toContain("Выбрано автоматически — нажмите, чтобы выбрать своё");
  });

  it("оформление без фото главы: объяснение со списком оформлений с фото и «Сменить оформление»", () => {
    const t = text(sheet("meet", data({ interior: "classic" }), { onChangeDesign: () => {} }));
    expect(t).toContain("В оформлении «Классика» глава начинается без фото");
    expect(t).toContain("«Луна»");
    expect(t).toContain("Сменить оформление");
    expect(t).not.toContain("Другое фото");
  });

  it("«Как напечатается»: пока сборка идёт — «Готовим страницу…»", () => {
    expect(text(sheet("meet", data(), { printedPage: null }))).toContain("Готовим страницу…");
    expect(text(sheet("meet"))).not.toContain("Как напечатается");
  });

  it("выбор фото после главы открыт сразу — несколько фото и «Добавить»", () => {
    const t = text(sheet("meet", data(), { choose: "after" }));
    expect(t).toContain("Эти фото встанут на отдельных страницах сразу после текста главы");
    expect(t).toContain("Отмена");
  });

  it("по-казахски", () => {
    const t = text(sheet("meet", data({ language: "kk" }), {}, kk));
    expect(t).toContain(kk.editor.chapterPhoto.other);
    expect(t).toContain(kk.editor.chapterPhoto.none);
  });
});

describe("лист «Альбом в конце» (GallerySheet)", () => {
  const sheet = (d: PlaceData = data(), messages: Messages = ru) => html(createElement(GallerySheet, { data: d, on, onClose: () => {} }), messages);

  it("название, что такое альбом, фото альбома с подписями мест, «Добавить фото» и «Убрать альбом»", () => {
    const markup = sheet();
    const t = text(markup);
    expect(t).toContain("Альбом в конце · «Наши моменты»");
    expect(t).toContain("Здесь фото, которые вы поставили в альбом");
    expect(t).toContain("Название раздела");
    expect(markup).toContain('placeholder="Наши моменты"');
    expect(t).toContain("Альбом в конце · само");
    expect(t).toContain("Добавить фото");
    expect(t).toContain("Убрать альбом");
    expect(markup.match(/aria-label="Убрать из альбома"/g)).toHaveLength(2);
  });

  it("своё название — в заголовке и в поле", () => {
    const markup = sheet(data({}, { tocLines: withGalleryTitle({}, "Наше лето") }));
    expect(text(markup)).toContain("Альбом в конце · «Наше лето»");
    expect(markup).toContain('value="Наше лето"');
  });

  it("глав с ответами ещё нет — объяснение; у своей книги — про текст", () => {
    const none = chapters.map((c) => ({ ...c, printed: false }));
    expect(text(sheet(data({}, { chapters: none })))).toContain("Пока в книге нет глав с ответами — все фото здесь");
    expect(text(sheet(data({ blank: true }, { chapters: none })))).toContain("Пока в книге нет глав с текстом");
  });

  it("пустой альбом — подсказка, без «Убрать альбом»; книга не редактируется — без кнопок", () => {
    const empty = new Map([...places].filter(([, p]) => p.kind !== "album"));
    const t = text(sheet(data({}, { places: empty })));
    expect(t).toContain("В альбоме пока нет фото");
    expect(t).not.toContain("Убрать альбом");
    const ro = sheet(data({ editable: false }));
    expect(text(ro)).not.toContain("Убрать альбом");
    expect(ro).not.toContain("Убрать из альбома");
  });

  it("по-казахски", () => {
    const t = text(sheet(data({ language: "kk", galleryTitle: "Біздің сәттеріміз" }), kk));
    expect(t).toContain(kk.editor.gallery.title("Біздің сәттеріміз"));
    expect(t).toContain(kk.editor.gallery.remove);
  });
});

describe("кадр (CropDialog, PanFrame)", () => {
  it("одна рамка — места фото, и подпись, какое это место", () => {
    const circle = openerFrame(getFormat("a5"), getInteriorDesign("luna"))!;
    const t = html(createElement(CropDialog, { photo: photos[1], crop: null, frame: circle, onSave: () => {}, onClose: () => {} }));
    expect(text(t)).toContain("Фото главы");
    expect(t.match(/data-frame=/g)).toHaveLength(1);
    expect(t).toContain('data-frame="circle"');
    expect(text(html(createElement(CropDialog, { photo: photos[1], crop: null, onSave: () => {}, onClose: () => {} })))).toContain("Весь лист");
    expect(frameLabelKey({ kind: "grid" })).toBe("cell");
  });

  it("рамка по пропорциям и форме; полароид — в белой карточке; жест не прокручивает страницу", () => {
    const frame = (props: Partial<Parameters<typeof PanFrame>[0]>) => html(createElement(PanFrame, { photo: photos[1], crop: { x: 0.5, y: 0.5, zoom: 1 }, width: 200, onChange: () => {}, ...props }));
    const arch = frame({ ratio: 1 / 1.3, mask: "arch" });
    expect(arch).toContain("width:200px;height:260px");
    expect(arch).toContain("border-radius:100px 100px 0 0");
    expect(arch).toContain("touch-none");
    expect(frame({ ratio: 1.15, mask: null, card: true })).toContain("bg-white");
    // Прежние формы (лист вкладки «Страницы») ещё работают.
    expect(frame({ shape: "page" })).toContain(`height:${Math.round(200 / (148 / 210))}px`);
  });
});

describe("объяснение «Где стоит фото»", () => {
  it("на сервере считается увиденным (не мелькает), но показывается по просьбе — без кнопки «Понятно»", () => {
    expect(html(createElement(PhotoIntroCard, { blank: false }))).toBe("");
    const t = text(html(createElement(PhotoIntroCard, { blank: true, force: true })));
    expect(t).toContain("в разделе");
    expect(t).not.toContain("Понятно");
  });
});
