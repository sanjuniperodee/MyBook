import { afterEach, describe, expect, it, vi } from "vitest";
import { ensureLayoutRev2, patchPhotos, syncLayout, touchesLayout } from "@/components/editor/photos/api";
import { moveUpdates, projectMoves, snapshotOf, type PhotoRowView, type SheetPhoto } from "@/components/editor/photos/model";
import { layoutPhotoRows, photoUndo, toEditorPhoto, type EditorPhoto } from "@/lib/book/editor-model";
import type { PhotoPlace } from "@/lib/book/photo-place";

/**
 * Перевод книги на правила раскладки 2 перед первой правкой мест: редактор и листы сначала зовут POST …/layout,
 * заменяют свои строки фото и версию правил ответом и только потом считают снимки «Отменить» и пишут правку.
 */

const row = (id: string, p: Partial<PhotoRowView> = {}): PhotoRowView => ({ id, position: 0, width: 1200, height: 900, caption: "", layout: "full", questionId: null, inline: null, crop: null, chapter: null, opener: false, ...p });

/** fetch-двойник: ответы по URL, запросы — списком. */
function stubFetch(answer: (url: string, init: RequestInit) => unknown) {
  const calls: { url: string; method: string; body: unknown }[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit = {}) => {
      calls.push({ url, method: init.method ?? "GET", body: typeof init.body === "string" ? JSON.parse(init.body) : undefined });
      return new Response(JSON.stringify(answer(url, init)), { status: 200, headers: { "Content-Type": "application/json" } });
    }),
  );
  return calls;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("какая правка переводит книгу (как сервер)", () => {
  it("правка места одного фото и любой пакет — да; подпись, кадр и вид одного фото — нет", () => {
    expect(touchesLayout([{ patch: { chapter: "a" } }])).toBe(true);
    expect(touchesLayout([{ patch: { opener: false } }])).toBe(true);
    expect(touchesLayout([{ patch: { questionId: null } }])).toBe(true);
    expect(touchesLayout([{ patch: { caption: "x" } as never }, { patch: { caption: "y" } as never }])).toBe(true);
    expect(touchesLayout([{ patch: { crop: null } as never }])).toBe(false);
    expect(touchesLayout([{ patch: { chapter: undefined } }])).toBe(false);
  });
});

describe("ensureLayoutRev2 и ответы правок", () => {
  it("книга на правилах 2 — без запроса; на прежних — один POST …/layout на всех, кто правит одновременно", async () => {
    const calls = stubFetch(() => ({ layoutRev: 2, photos: [row("p0", { chapter: "a", opener: true })] }));
    expect(await ensureLayoutRev2("b-two", 2)).toBeNull();
    expect(calls).toEqual([]);
    const [x, y] = await Promise.all([ensureLayoutRev2("b-one", 1), ensureLayoutRev2("b-one", undefined)]);
    expect(calls.map((c) => [c.method, c.url])).toEqual([["POST", "/api/books/b-one/layout"]]);
    expect(x).toEqual({ layoutRev: 2, photos: [row("p0", { chapter: "a", opener: true })] });
    expect(y).toBe(x);
  });

  it("перевод не повторил вёрстку — правки идут по правилам 1 без нового запроса; сверка по ответу правки спрашивает снова", async () => {
    let rev = 1;
    const calls = stubFetch(() => ({ layoutRev: rev, photos: [] }));
    expect(await ensureLayoutRev2("b-refused", 1)).toEqual({ layoutRev: 1, photos: [] });
    expect(await ensureLayoutRev2("b-refused", 1)).toBeNull();
    expect(calls).toHaveLength(1);
    // Сервер перевёл книгу при правке сам (ответ правки — с версией 2): сверка идёт всегда.
    rev = 2;
    expect(await syncLayout("b-refused")).toEqual({ layoutRev: 2, photos: [] });
    expect(calls).toHaveLength(2);
  });

  it("ответ PATCH и пакета несёт версию правил книги", async () => {
    stubFetch((url) => (url.endsWith("/batch") ? { photos: [row("p1"), row("p2")], layoutRev: 2 } : { photo: row("p1"), layoutRev: 2 }));
    expect(await patchPhotos("b1", [{ id: "p1", patch: { chapter: "a" } }])).toEqual({ photos: [row("p1")], layoutRev: 2 });
    expect(await patchPhotos("b1", [{ id: "p1", patch: { caption: "x" } }, { id: "p2", patch: { caption: "y" } }])).toEqual({ photos: [row("p1"), row("p2")], layoutRev: 2 });
    expect(await patchPhotos("b1", [])).toEqual({ photos: [] });
  });
});

describe("правка мест после перевода: снимки «Отменить» — по строкам после него", () => {
  // Места, собранные ещё по правилам 1: p0 — фото главы a, которое правила поставили сами (auto).
  const rev1Places = new Map<string, PhotoPlace>([
    ["p0", { kind: "opener", chapterKey: "a", auto: true, onCover: null }],
    ["p1", { kind: "after", chapterKey: "a", auto: true, onCover: null }],
  ]);
  // Строки после перевода: p0 закреплено фото главы a.
  const upgraded: SheetPhoto[] = [
    { id: "p0", width: 10, height: 10, questionId: null, chapter: "a", opener: true },
    { id: "p1", width: 10, height: 10, questionId: null, chapter: "a", opener: false },
  ];
  const toOpener = [{ id: "p1", target: { kind: "opener" as const, chapterKey: "a" } }];

  it("прежнее фото главы, закреплённое переводом, уходит после главы явно — и попадает в снимок для «Отменить»", () => {
    const updates = moveUpdates(toOpener, rev1Places, upgraded);
    expect(updates).toEqual([
      { id: "p0", patch: { questionId: null, chapter: "a", opener: false } },
      { id: "p1", patch: { questionId: null, chapter: "a", opener: true } },
    ]);
    const byId = new Map(upgraded.map((p) => [p.id, p]));
    expect(updates.map((u) => snapshotOf(byId.get(u.id)!))).toContainEqual({ id: "p0", questionId: null, chapter: "a", opener: true, crop: null });
    expect(projectMoves(toOpener, rev1Places, { openerDesign: true, photoPlacement: "chapters", printed: new Set(["a"]) }, upgraded).get("p0")).toMatchObject({ kind: "after", chapterKey: "a", auto: false });
  });

  it("без строк (или по строкам правил 1, где отметки нет) подставленное фото главы не трогается — как раньше", () => {
    expect(moveUpdates(toOpener, rev1Places).map((u) => u.id)).toEqual(["p1"]);
    const rev1Rows = upgraded.map((p) => ({ ...p, chapter: null, opener: false }));
    expect(moveUpdates(toOpener, rev1Places, rev1Rows).map((u) => u.id)).toEqual(["p1"]);
  });

  it("редактор: строки перевода заменяют список (порядок — их позиции), снимок «Отменить» возвращает фото главы", () => {
    const editor: EditorPhoto[] = [{ ...toEditorPhoto(row("p1")), rev: 2 }, { ...toEditorPhoto(row("p0")), onCover: "back" }, toEditorPhoto(row("gone"))];
    const list = layoutPhotoRows(editor, [row("p0", { position: 0, chapter: "a", opener: true }), row("p1", { position: 1, chapter: "a" }), row("new", { position: 2 })]);
    expect(list.map((p) => [p.id, p.chapter, p.opener, p.onCover, p.rev ?? null])).toEqual([
      ["p0", "a", true, "back", null],
      ["p1", "a", false, null, 2],
      ["new", null, false, null, null],
    ]);
    // p1 — новое фото главы a: снимок помнит, что им было p0 (по строкам правил 1 отметки у p0 не было — и снимка тоже).
    const undo = photoUndo(list, [{ id: "p1", patch: { questionId: null, chapter: "a", opener: true } }]);
    expect(undo).toContainEqual(expect.objectContaining({ id: "p0", chapter: "a", opener: true }));
    expect(photoUndo(editor, [{ id: "p1", patch: { questionId: null, chapter: "a", opener: true } }]).map((u) => u.id)).toEqual(["p1"]);
  });
});
