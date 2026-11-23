import { describe, expect, it } from "vitest";
import { draggedSpace, dropLabel } from "@/components/editor/preview/drag";
import { applyDecision, emptyFlow, nextDecisions, type FlowBlock, type FlowLayout, type FlowPage, type FlowPiece } from "@/lib/book/flow-decisions";
import { estimateChapterPages, textMetrics } from "@/lib/book/estimate";
import { getFormat } from "@/lib/book/formats";
import { layoutInline, MAX_SPACE_ABOVE, normalizeStyle, rowSpaceAbove, rowSpaceLimit, SPACE_RESERVE, type InlinePhotoStyle } from "@/lib/book/inline-photo";
import { getInteriorDesign } from "@/lib/book/interiors";
import type { ContentItem } from "@/lib/book/layout";
import { patchEditorPhotos, type EditorPhoto } from "@/lib/book/editor-model";
import { messagesFor } from "@/i18n/messages";
import { Photo } from "@/modules/authoring/domain";
import { PhotosService } from "@/modules/authoring/application/services";
import { ids, images, MemBooks, MemFiles, MemPhotos, noQuestions, owner, rejectsWith, startBook, stranger } from "./doubles/authoring";

const style = (s: Partial<InlinePhotoStyle> = {}) => normalizeStyle(s);

describe("фото в тексте: отступ сверху и «с новой страницы» — нормализация", () => {
  it("отступ — доля полосы, не больше 60 %, округлён; ноль, мусор и отрицательный — без отступа", () => {
    expect(style({ spaceAbove: 0.25 }).spaceAbove).toBe(0.25);
    expect(style({ spaceAbove: 0.33333 }).spaceAbove).toBe(0.333);
    expect(style({ spaceAbove: 2 }).spaceAbove).toBe(MAX_SPACE_ABOVE);
    for (const v of [0, -0.3, Number.NaN, 0.001]) expect("spaceAbove" in style({ spaceAbove: v })).toBe(false);
    expect("spaceAbove" in style({})).toBe(false);
  });

  it("«с новой страницы» хранится только включённым; keepSize не задет", () => {
    expect(style({ breakBefore: true }).breakBefore).toBe(true);
    expect("breakBefore" in style({ breakBefore: false })).toBe(false);
    expect(style({ breakBefore: true, keepSize: true, spaceAbove: 0.1 })).toMatchObject({ breakBefore: true, keepSize: true, spaceAbove: 0.1 });
  });

  it("фото с отступом или «с новой страницы» начинает свой ряд; узкое следом встаёт рядом с ним", () => {
    const item = (id: string, s: Partial<InlinePhotoStyle>) => ({ id, style: style({ width: 40, anchor: 0, ...s }) });
    const rows = (list: ReturnType<typeof item>[]) => layoutInline(list, 3).get(0)!.map((r) => r.map((x) => x.id));
    expect(rows([item("a", {}), item("b", {})])).toEqual([["a", "b"]]);
    expect(rows([item("a", {}), item("b", { spaceAbove: 0.2 })])).toEqual([["a"], ["b"]]);
    expect(rows([item("a", {}), item("b", { breakBefore: true }), item("c", {})])).toEqual([["a"], ["b", "c"]]);
  });
});

describe("фото в тексте: отступ на полосе", () => {
  const px = { width: 400, height: 300 };
  it("отступ ряда — от первого фото, в единицах полосы; высокое фото оставляет под отступ меньше места", () => {
    const row = [{ p: px, style: style({ spaceAbove: 0.3 }) }];
    expect(rowSpaceAbove(row, 100, 150)).toBeCloseTo(45);
    expect(rowSpaceAbove([{ p: px, style: style() }], 100, 150)).toBe(0);
    // Фото во всю ширину высотой 75 из 150: под отступ остаётся 1 − 0,12 − 0,5 = 0,38 полосы.
    const tall = [{ p: px, style: style({ spaceAbove: 0.6 }) }];
    expect(rowSpaceLimit(tall, 100, 150)).toBeCloseTo(1 - SPACE_RESERVE - 0.5);
    expect(rowSpaceAbove(tall, 100, 150)).toBeCloseTo((1 - SPACE_RESERVE - 0.5) * 150);
    // Отступ с фото не длиннее полосы.
    const box = 75;
    expect(rowSpaceAbove(tall, 100, 150) + box).toBeLessThanOrEqual(150 * (1 - SPACE_RESERVE) + 1e-9);
  });
});

describe("доводка: ряд, поставленный автором (f), не уменьшается и не центрируется", () => {
  const PAGE: FlowPage = { contentTop: 50, contentBottom: 550 };
  const at = (page: number, top: number, height: number): FlowPiece => ({ page, top, bottom: top + height, marginTop: 0, marginBottom: 0 });
  const block = (mark: string, piece: FlowPiece): FlowBlock => ({ mark, kind: mark.split(":")[0] as FlowBlock["kind"], item: mark.split(":")[1], chapter: "ch1", first: piece, last: piece });
  const layout = (...blocks: FlowBlock[]): FlowLayout => ({ pages: [PAGE, PAGE, PAGE], blocks });

  it("обычный ряд в верху полосы с пустотой на прошлой — уменьшается; ряд автора там же — нет", () => {
    const heights = new Map([["r:a:0:0", 200]]);
    expect(nextDecisions(layout(block("b:a:0", at(0, 50, 250)), block("r:a:0:0", at(1, 50, 220))), emptyFlow(), heights)[0]?.type).toBe("rowScale");
    expect(nextDecisions(layout(block("b:a:0", at(0, 50, 250)), block("f:a:0:0", at(1, 50, 220))), emptyFlow(), heights)).toEqual([]);
  });

  it("один на полосе обычный ряд встаёт по центру; ряд автора — нет, и соседний ряд на его полосе тоже", () => {
    expect(nextDecisions(layout(block("b:a:0", at(0, 50, 480)), block("r:a:0:0", at(1, 50, 200)), block("b:b:0", at(2, 50, 100))), emptyFlow(), new Map())[0]?.type).toBe("rowOffset");
    expect(nextDecisions(layout(block("b:a:0", at(0, 50, 480)), block("f:a:0:0", at(1, 50, 200)), block("b:b:0", at(2, 50, 100))), emptyFlow(), new Map())).toEqual([]);
    expect(nextDecisions(layout(block("b:a:0", at(0, 50, 480)), block("r:a:0:0", at(1, 50, 150)), block("f:a:0:1", at(1, 220, 200)), block("b:b:0", at(2, 50, 100))), emptyFlow(), new Map())).toEqual([]);
  });

  it("решения по обычным рядам применяются как раньше", () => {
    const flow = emptyFlow();
    for (const d of nextDecisions(layout(block("b:a:0", at(0, 50, 480)), block("r:a:0:0", at(1, 50, 200)), block("b:b:0", at(2, 50, 100))), flow, new Map())) applyDecision(flow, d);
    expect(flow.rowOffset.get("r:a:0:0")).toBeGreaterThan(0);
  });
});

describe("оценка объёма: отступ и «с новой страницы»", () => {
  const m = textMetrics(getFormat("a5"), getInteriorDesign("classic"));
  const text = Array.from({ length: 3 }, () => "Слово ".repeat(60).trim()).join("\n");
  const photo = (inline: Partial<InlinePhotoStyle>) => ({ id: "p1", width: 1200, height: 800, caption: "", layout: "full" as const, inline: style({ width: 50, anchor: 0, ...inline }) });
  const pages = (inline: Partial<InlinePhotoStyle>) => {
    const item: ContentItem = { id: "q1", heading: "Заголовок", answer: text, photos: [photo(inline)] } as ContentItem;
    return estimateChapterPages({ items: [item], photos: [] }, m);
  };

  it("короткий ответ с фото — одна полоса текста; «с новой страницы» — фото и остальное на второй", () => {
    expect(pages({})).toBe(2); // начальная полоса + полоса текста
    expect(pages({ breakBefore: true })).toBe(3);
  });

  it("отступ, с которым ряд не помещается под текстом, переносит ряд на следующую полосу; маленький — нет", () => {
    // Фото в конце ответа: под ним ничего, объём меняет только перенос ряда.
    expect(pages({ anchor: null, spaceAbove: 0.02 })).toBe(2);
    expect(pages({ anchor: null, spaceAbove: 0.6 })).toBe(3);
  });
});

describe("превью редактора: ручка отступа и подсказка переноса", () => {
  it("сдвиг ручки в пикселях → доля полосы, шаг 0,5 %, в пределах ряда и 60 %", () => {
    expect(draggedSpace({ start: 0, limit: 0.6 }, 100, 500)).toBe(0.2);
    expect(draggedSpace({ start: 0.2, limit: 0.6 }, -300, 500)).toBe(0);
    expect(draggedSpace({ start: 0, limit: 0.3 }, 400, 500)).toBe(0.3);
    expect(draggedSpace({ start: 0, limit: 1 }, 1000, 500)).toBe(MAX_SPACE_ABOVE);
  });

  it("в своём ответе — только место, в другом — ещё и куда", () => {
    const t = messagesFor("ru").editor.preview;
    expect(dropLabel(t, { entry: "q1", anchor: null }, "q1", 3, "Детство")).toBe(t.anchorEnd);
    expect(dropLabel(t, { entry: "q2", anchor: 0 }, "q1", 3, "Детство")).toBe(`в «Детство», ${t.anchorAfter(1)}`);
    expect(dropLabel(t, { entry: "q2", anchor: -1 }, "q1", 3, null)).toBe(`в другой ответ, ${t.anchorBefore}`);
  });
});

describe("перенос фото в другой ответ", () => {
  it("в редакторе: фото переходит в другой ответ на выбранное место, вид в тексте сохраняется", () => {
    const p = { id: "p1", questionId: "q1", chapter: null, opener: false, inline: style({ width: 60, spaceAbove: 0.1, anchor: 2 }) } as unknown as EditorPhoto;
    const [moved] = patchEditorPhotos([p], [{ id: "p1", patch: { questionId: "q2", inline: style({ ...p.inline, anchor: -1 }) } }]);
    expect(moved.questionId).toBe("q2");
    expect(moved.inline).toMatchObject({ width: 60, spaceAbove: 0.1, anchor: -1 });
  });

  it("на сервере: ответ из этой книги — фото переезжает; чужой ответ и чужая книга — ошибка, фото на месте", async () => {
    const books = new MemBooks();
    await books.add(startBook());
    const photos = new MemPhotos();
    const photo = Photo.uploaded("p1", { bookId: "b1", position: 0, storageKey: "a", thumbKey: "b", width: 10, height: 10 });
    photo.update({ questionId: "q1", inline: style({ anchor: 1 }) });
    await photos.add(photo);
    const questions = { ...noQuestions, findInBook: async (bookId: string, id: string) => (bookId === "b1" && (id === "q1" || id === "q2") ? ({ id } as never) : null) };
    const service = new PhotosService(books, photos, questions, images, new MemFiles(), ids);
    await service.update("b1", owner, "p1", { questionId: "q2", inline: style({ anchor: 0, spaceAbove: 0.2 }) });
    expect(photo.snapshot()).toMatchObject({ questionId: "q2", inline: { anchor: 0, spaceAbove: 0.2 } });
    await rejectsWith(service.update("b1", owner, "p1", { questionId: "q9" }), "questionNotFound");
    await expect(service.update("b1", stranger, "p1", { questionId: "q1" })).rejects.toThrow();
    expect(photo.snapshot().questionId).toBe("q2");
  });
});
