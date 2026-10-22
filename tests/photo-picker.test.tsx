import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { captionShown, pageLoss, pageModePatch, PhotoInspector, sizeWord, type InspectorPhoto } from "@/components/editor/PhotoInspector";
import { pickerConfirm, PhotoPicker, uploadNote } from "@/components/editor/questions/PhotoPicker";
import { PhotoStrip, removePatch } from "@/components/editor/questions/PhotoStrip";
import { placeNames } from "@/components/editor/photos/model";
import { MessagesContext } from "@/i18n/context";
import { kk } from "@/i18n/messages/kk";
import { ru } from "@/i18n/messages/ru";
import type { EditorPhoto } from "@/lib/book/editor-model";
import type { InlinePhotoStyle } from "@/lib/book/inline-photo";
import { isChapterPhotoKey } from "@/lib/book/layout";
import type { PhotoPlace } from "@/lib/book/photo-place";

// Выбор фото в ответ (S6) и настройка фото в ответе (S7): что видит автор и что пишется (renderToStaticMarkup).

const html = (el: ReactElement, messages: typeof ru | typeof kk = ru) => renderToStaticMarkup(createElement(MessagesContext.Provider, { value: messages }, el));
const text = (markup: string) => markup.replace(/<[^>]+>/g, " ").replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/\s+/g, " ");
const noop = () => {};

const photo = (id: string, over: Partial<EditorPhoto> = {}): EditorPhoto => ({ id, width: 1200, height: 1600, caption: "", layout: "full", questionId: null, inline: null, crop: null, chapter: null, opener: false, onCover: null, ...over });
const place = (p: Partial<PhotoPlace> & Pick<PhotoPlace, "kind">): PhotoPlace => ({ auto: false, onCover: null, ...p });
const names = placeNames(
  [
    { key: "childhood", title: "Детство" },
    { key: "school", title: "Школа" },
  ],
  [
    { id: "q1", title: "Первый день" },
    { id: "q2", title: "Выпускной" },
  ],
);

describe("выбор фото в ответ: когда спрашивать", () => {
  it("фото этого ответа и фото без места — без вопроса", () => {
    expect(pickerConfirm(place({ kind: "answer", questionId: "q1" }), "q1")).toBeNull();
    expect(pickerConfirm(place({ kind: "after", chapterKey: "school", auto: true }), "q1")).toBeNull();
    expect(pickerConfirm(place({ kind: "album" }), "q1")).toBeNull();
    expect(pickerConfirm(place({ kind: "off" }), "q1")).toBeNull();
    expect(pickerConfirm(undefined, "q1")).toBeNull();
  });

  it("из другого ответа — вопрос; и снимок обложки, который прежние правила в ответе прячут, тоже", () => {
    expect(pickerConfirm(place({ kind: "answer", questionId: "q2" }), "q1")).toEqual({ kind: "answer", questionId: "q2" });
    expect(pickerConfirm(place({ kind: "off", auto: true, questionId: "q2", onCover: "cover" }), "q1")).toEqual({ kind: "answer", questionId: "q2" });
  });

  it("фото главы, выбранное автором, и фото после главы — вопрос; подставленное прежними правилами — нет", () => {
    expect(pickerConfirm(place({ kind: "opener", chapterKey: "childhood" }), "q1")).toEqual({ kind: "opener", chapterKey: "childhood" });
    expect(pickerConfirm(place({ kind: "opener", chapterKey: "childhood", auto: true }), "q1")).toBeNull();
    expect(pickerConfirm(place({ kind: "after", chapterKey: "school" }), "q1")).toEqual({ kind: "after", chapterKey: "school" });
  });

  it("фото ждёт главу без текста: с отметкой фото главы — как фото главы, без неё — как после главы", () => {
    const waiting = place({ kind: "album", auto: true, waitingFor: "school" });
    expect(pickerConfirm(waiting, "q1")).toEqual({ kind: "after", chapterKey: "school" });
    expect(pickerConfirm(waiting, "q1", true)).toEqual({ kind: "opener", chapterKey: "school" });
  });
});

describe("выбор фото в ответ: загрузка без тихого предела", () => {
  const t = ru.editor.photoPicker;
  it("всё поместилось — сказать нечего", () => {
    expect(uploadNote(t, 120, { photos: [photo("a"), photo("b")], errors: [], cut: 0 })).toBeNull();
  });
  it("упёрлись в предел — сколько загрузили, остальные не поместились", () => {
    expect(uploadNote(t, 120, { photos: [photo("a"), photo("b")], errors: [], cut: 5 })).toBe("В книге может быть до 120 фото — загрузили 2, остальные не поместились");
    expect(uploadNote(t, 120, { photos: [], errors: [], cut: 3 })).toBe("В книге может быть до 120 фото — больше не поместится");
  });
  it("ошибки по файлам — вместе с пределом", () => {
    expect(uploadNote(t, 120, { photos: [photo("a")], errors: ["IMG_1.heic: не удалось прочитать"], cut: 1 })).toBe("IMG_1.heic: не удалось прочитать В книге может быть до 120 фото — загрузили 1, остальные не поместились");
  });
  it("по-казахски", () => {
    expect(uploadNote(kk.editor.photoPicker, 120, { photos: [photo("a")], errors: [], cut: 2 })).toContain("120");
  });
});

describe("выбор фото в ответ: лист", () => {
  const photos = [photo("p1", { questionId: "q1" }), photo("p2", { chapter: "childhood", opener: true }), photo("p3", { onCover: "cover" }), photo("p4")];
  const places = new Map<string, PhotoPlace>([
    ["p1", place({ kind: "answer", questionId: "q1", chapterKey: "childhood" })],
    ["p2", place({ kind: "opener", chapterKey: "childhood" })],
    ["p3", place({ kind: "off", auto: true, onCover: "cover" })],
    ["p4", place({ kind: "after", chapterKey: "school", auto: true })],
  ]);
  const render = (messages: typeof ru | typeof kk = ru, blank = false) =>
    text(
      html(
        createElement(PhotoPicker, { bookId: "b1", photos, questionId: "q1", questionLabel: "Первый день", onAttach: noop, onDetach: noop, onUploaded: noop, onClose: noop, otherLabel: () => "—", places, names, blank, openerDesign: true }),
        messages,
      ),
    );

  it("все фото книги с подписью места, снимок обложки тоже; «Готово» со счётом фото этого ответа", () => {
    const t = render();
    expect(t).toContain("Фото в ответ");
    expect(t).toContain("оно встанет в ответ «Первый день»");
    expect(t).toContain("В ответе «Первый день»");
    expect(t).toContain("Фото главы «Детство»");
    expect(t).toContain("Не печатается · само");
    expect(t).toContain("на обложке");
    expect(t).toContain("После главы «Школа» · само");
    expect(t).toContain("Готово (1)");
    expect(t).toContain("Загрузить фото");
  });

  it("своя книга — «раздел»", () => {
    const t = render(ru, true);
    expect(t).toContain("Фото в раздел");
    expect(t).toContain("В разделе «Первый день»");
  });

  it("по-казахски", () => {
    const t = render(kk);
    expect(t).toContain(kk.editor.photoPicker.title);
    expect(t).toContain(kk.editor.photoPicker.done(1));
  });
});

const inspectorPhoto = (over: Omit<Partial<InspectorPhoto>, "inline"> & { inline?: Partial<InlinePhotoStyle> | null } = {}): InspectorPhoto => ({ id: "p1", url: "/x.jpg", width: 1600, height: 1200, caption: "Алматы", ...over, inline: over.inline as InlinePhotoStyle });
const inspector = (p: InspectorPhoto, extra: Record<string, unknown> = {}, messages: typeof ru | typeof kk = ru) =>
  text(html(createElement(PhotoInspector, { photo: p, answer: "Первый\nВторой", editable: true, onChange: noop, onCaption: noop, onRotate: async () => {}, onRemove: noop, onClose: noop, format: "a5", ...extra }), messages));

describe("настройка фото в ответе: отдельная страница", () => {
  it("горизонтальное и квадратное фото на листе A5 — «целиком, с полями»; вертикальное — «до краёв»", () => {
    expect(pageModePatch({ width: 1600, height: 1200 }, "a5")).toEqual({ page: true, pageFit: "contain" });
    expect(pageModePatch({ width: 1000, height: 1000 }, "a5")).toEqual({ page: true, pageFit: "contain" });
    expect(pageModePatch({ width: 1200, height: 1600 }, "a5")).toEqual({ page: true, pageFit: undefined });
    // Квадратная книга: квадрат ложится на лист без потерь.
    expect(pageModePatch({ width: 1000, height: 1000 }, "square")).toEqual({ page: true, pageFit: undefined });
  });

  it("пишется только место и вид страницы — размер, форма и рамка фото в тексте остаются", () => {
    expect(Object.keys(pageModePatch({ width: 1600, height: 1200 }, "a5")).sort()).toEqual(["page", "pageFit"]);
  });

  it("обрезка на листе: доля по формуле R11", () => {
    expect(pageLoss({ width: 1200, height: 1600 }, "a5")).toBeLessThan(0.1);
    expect(pageLoss({ width: 1600, height: 1200 }, "a5")).toBeGreaterThan(0.4);
  });

  it("«Целиком» у несовпадающего по форме фото — с объяснением; «До краёв» — рамка листа и строка обрезки", () => {
    const contain = inspector(inspectorPhoto({ inline: { page: true, pageFit: "contain" } }));
    expect(contain).toContain("На отдельной странице");
    expect(contain).toContain("поставили целиком");
    expect(contain).not.toContain("Обрежется");
    const fill = html(createElement(MessagesContext.Provider, { value: ru }, createElement(PhotoInspector, { photo: inspectorPhoto({ inline: { page: true } }), answer: "", editable: true, onChange: noop, onCaption: noop, onRotate: async () => {}, onRemove: noop, onClose: noop, format: "a5", onCrop: noop })));
    expect(fill).toContain('data-frame="rect"');
    expect(text(fill)).toContain("Обрежется 47% снимка");
    expect(text(fill)).toContain("Двигайте фото в рамке страницы");
  });
});

describe("настройка фото в ответе: подпись только там, где печатается (R10)", () => {
  it("в тексте — поле подписи, у полароида — «от руки»", () => {
    expect(captionShown({ page: undefined })).toBe(true);
    const t = inspector(inspectorPhoto());
    expect(t).toContain("Подпись");
    expect(t).not.toContain("подписи нет");
    expect(inspector(inspectorPhoto({ inline: { frame: "polaroid" } }))).toContain("Подпись (от руки, на полароиде)");
  });

  it("на отдельной странице — поля нет, вместо него примечание; размер, форма и рамка скрыты", () => {
    expect(captionShown({ page: true })).toBe(false);
    const t = inspector(inspectorPhoto({ inline: { page: true, frame: "polaroid" } }));
    expect(t).toContain("У фото на отдельной странице подписи нет");
    expect(t).not.toContain("Подпись (от руки");
    expect(t).not.toContain("Рамка");
    expect(t).not.toContain("Маленькое");
  });
});

describe("настройка фото в ответе: слова и действия", () => {
  it("размер словами, «Форма», «Рамка»; без мыши — без подсказки про уголок в превью", () => {
    const t = inspector(inspectorPhoto({ inline: { width: 50 } }));
    for (const w of ["Маленькое", "Среднее", "Большое", "Во всю ширину", "Форма", "Как снято", "Квадрат", "Рамка", "Скруглённые углы"]) expect(t).toContain(w);
    expect(t).not.toContain("% ширины");
    expect(t).not.toContain("потяните за уголок");
    expect(t).toContain("Маленькие и средние фото");
  });

  it("«Перенести…» — только когда есть лист места; «Убрать из раздела» в своей книге", () => {
    expect(inspector(inspectorPhoto())).not.toContain("Перенести…");
    expect(inspector(inspectorPhoto(), { onMove: noop })).toContain("Перенести…");
    expect(inspector(inspectorPhoto(), { blank: true })).toContain("Убрать из раздела");
    expect(inspector(inspectorPhoto(), {}, kk)).toContain(kk.editor.answerPhoto.remove);
  });

  it("размер словом — ближайший", () => {
    expect([25, 33, 45, 50, 60, 75, 90, 100].map(sizeWord)).toEqual(["small", "small", "medium", "medium", "medium", "large", "full", "full"]);
  });

  it("«Убрать из ответа» — фото не печатается (служебная глава), а не встаёт само", () => {
    const patch = removePatch();
    expect(patch.questionId).toBeNull();
    expect(patch.chapter).toBeTruthy();
    expect(isChapterPhotoKey(patch.chapter)).toBe(false);
  });

  it("миниатюры — размер словом; у выделенного фото — подпись места", () => {
    const p = photo("p1", { questionId: "q1", inline: { width: 33, align: "center", anchor: null, aspect: "original", focusX: 0.5, focusY: 0.5, frame: "none" } });
    const places = new Map([["p1", place({ kind: "answer", questionId: "q1", chapterKey: "childhood", onCover: "cover" })]]);
    const t = text(html(createElement(PhotoStrip, { photos: [p], selected: p, answer: "", editable: true, onSelect: noop, onChange: noop, onCaption: noop, onRotate: async () => {}, places, names, format: "a5" })));
    expect(t).toContain("Маленькое");
    expect(t).toContain("В ответе «Первый день»");
    expect(t).toContain("на обложке");
  });
});
