import { describe, expect, it } from "vitest";
import { getInteriorDesign } from "@/lib/book/interiors";
import { GALLERY_KEY } from "@/lib/book/toc";
import { photoPlaceOf } from "@/lib/book/photo-place";
import { patchEditorPhotos } from "@/lib/book/editor-model";
import { moveUpdates, placeNames, projectPlace } from "@/components/editor/photos/model";
import { placesForDesign } from "@/app/(app)/books/[id]/pages/pages-photos";
import { Photo } from "@/modules/authoring/domain";
import { buildLayout, layoutBundle, layoutPhoto as photo } from "./fixtures/layout-books";

// 11.11.2026: у клиентки (оформление «Кино», фото в конце альбомом) все главы открываются фото, а начальная полоса
// альбома — только с названием, и поставить туда фото было нельзя. Теперь «Фото главы…» предлагает и альбом:
// снимок — фото с альбомом и отметкой фото главы (photos.chapter = GALLERY_KEY, opener).

/** «Кино» — глава открывается фото (как у клиентки), «Классика» — без фото главы. */
const opener = "cinema";
const plain = "classic";

const bundle = (interior: string, photos = [photo("p1", 1, { chapter: GALLERY_KEY, opener: true }), photo("p2", 2), photo("p3", 3)]) =>
  layoutBundle({ chapters: ["a"], photos, book: { layoutRev: 2, photoPlacement: "end", interior } });

describe("фото начальной полосы альбома", () => {
  it("оформления набора: с фото главы и без", () => {
    expect([!!getInteriorDesign(opener).opener.photo, !!getInteriorDesign(plain).opener.photo]).toEqual([true, false]);
  });

  it("в оформлении с фото главы: снимок на начальной полосе альбома, в альбоме его нет; место — «фото главы» альбома", () => {
    const b = bundle(opener);
    const c = buildLayout(b);
    expect(c.galleryOpenerPhoto?.id).toBe("p1");
    expect(c.galleryPhotos.map((p) => p.id)).toEqual(["p2", "p3"]);
    expect(photoPlaceOf(c, b.photos, b.book).get("p1")).toEqual({ kind: "opener", chapterKey: GALLERY_KEY, auto: false, onCover: null });
  });

  it("без фото главы в оформлении, по прежним правилам и когда в альбоме больше ничего нет — снимок просто в альбоме", () => {
    expect(buildLayout(bundle(plain)).galleryOpenerPhoto).toBeUndefined();
    expect(buildLayout(bundle(plain)).galleryPhotos.map((p) => p.id)).toContain("p1");
    const old = bundle(opener);
    expect(buildLayout({ ...old, book: { ...old.book, layoutRev: 1 } }).galleryOpenerPhoto).toBeUndefined();
    const alone = bundle(opener, [photo("p1", 1, { chapter: GALLERY_KEY, opener: true })]);
    expect(buildLayout(alone).galleryOpenerPhoto).toBeUndefined();
    expect(buildLayout(alone).galleryPhotos.map((p) => p.id)).toEqual(["p1"]);
  });

  it("книги без такого фото собираются как раньше: поля в содержимом нет (отпечатки сборок не меняются)", () => {
    expect("galleryOpenerPhoto" in buildLayout(bundle(opener, [photo("p2", 2), photo("p3", 3)]))).toBe(false);
  });

  it("отметка фото главы держится у фото альбома — в домене и в редакторе; у «не печатать» — нет", () => {
    const p = Photo.restore("p1", { bookId: "b", position: 0, storageKey: "k", thumbKey: "t", width: 10, height: 10, caption: "", layout: "full", questionId: null, inline: null, crop: null, chapter: null, opener: false });
    p.update({ questionId: null, chapter: GALLERY_KEY, opener: true });
    expect(p.snapshot()).toMatchObject({ chapter: GALLERY_KEY, opener: true });
    p.update({ chapter: "__off" });
    expect(p.snapshot().opener).toBe(false);
    const rows = patchEditorPhotos([{ id: "p1", chapter: null, opener: false, questionId: null } as never], [{ id: "p1", patch: { questionId: null, chapter: GALLERY_KEY, opener: true } }]);
    expect(rows[0]).toMatchObject({ chapter: GALLERY_KEY, opener: true });
  });

  it("лист места: выбор альбома в «Фото главы…» — новое место сразу, прежнее фото альбома уходит в альбом, подпись с названием альбома", () => {
    const ctx = { openerDesign: true, photoPlacement: "end" as const, printed: new Set(["a"]) };
    expect(projectPlace({ kind: "opener", chapterKey: GALLERY_KEY }, undefined, ctx)).toEqual({ kind: "opener", chapterKey: GALLERY_KEY, auto: false, onCover: null });
    expect(projectPlace({ kind: "opener", chapterKey: GALLERY_KEY }, undefined, { ...ctx, openerDesign: false })).toEqual({ kind: "album", auto: false, onCover: null });
    const places = new Map([["old", { kind: "opener" as const, chapterKey: GALLERY_KEY, auto: false, onCover: null }]]);
    expect(moveUpdates([{ id: "new", target: { kind: "opener", chapterKey: GALLERY_KEY } }], places)).toEqual([
      { id: "old", patch: { questionId: null, chapter: GALLERY_KEY, opener: false } },
      { id: "new", patch: { questionId: null, chapter: GALLERY_KEY, opener: true } },
    ]);
    expect(placeNames([], [], "Твои фото").chapter(GALLERY_KEY)).toBe("Твои фото");
  });

  it("смена оформления до пересборки: без фото главы — снимок в альбоме, с ним — снова на начальной полосе", () => {
    const at = new Map([["p1", { kind: "opener" as const, chapterKey: GALLERY_KEY, auto: false, onCover: null }]]);
    const off = placesForDesign(at, [{ id: "p1", opener: true }], false);
    expect(off.get("p1")).toEqual({ kind: "album", auto: false, onCover: null });
    expect(placesForDesign(off, [{ id: "p1", opener: true }], true).get("p1")).toEqual({ kind: "opener", chapterKey: GALLERY_KEY, auto: false, onCover: null });
  });
});
