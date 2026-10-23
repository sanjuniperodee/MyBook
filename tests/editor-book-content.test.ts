import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { buildBookContent } from "@/lib/book/book-content";
import { withCoverPhotos } from "@/lib/book/cover-photos";
import { editorBook, editorCoverPhotos, editorModel } from "@/lib/book/editor-data";
import { contentPages, editorContent, editorEstimate } from "@/lib/book/editor-estimate";
import { mergePhotoRows, patchEditorPhotos, photoUndo, serverUpdates, toEditorPhoto, undoUpdates, type EditorBook, type EditorChapter, type EditorPhoto, type EditorPhotoPatch, type EditorQuestion } from "@/lib/book/editor-model";
import { LETTERS_CHAPTER, PHOTO_OFF_KEY, toPhotoItem, type BookContent, type LetterLike, type PhotoItem } from "@/lib/book/layout";
import { photoPlaceOf } from "@/lib/book/photo-place";
import { GALLERY_KEY } from "@/lib/book/toc";
import { Photo } from "@/modules/authoring/domain";
import type { Photo as PhotoRow } from "@/shared/infrastructure/db/schema";
import { useBookContent } from "@/components/editor/questions/useBookContent";
import { useBookPages } from "@/components/editor/questions/usePageEstimate";
import { fixtureSample, fixtureVariants, type FixtureBook } from "./fixtures/books";

/**
 * Одна сборка везде (R9): редактор собирает книгу с теми же входами, что PDF и кабинет, — правила раскладки фото книги,
 * снимки обложки (видные на ней), оглавление по-своему, фото с кадром, главой и отметкой фото главы. Счётчик полос,
 * содержимое и места фото в редакторе совпадают с серверными и у книг на правилах 2 — с закреплёнными фото, альбомом,
 * «не печатается», снимком обложки в ответе и убранной главой.
 */

const YEAR = 2026;

/** Вход редактора, как его готовит страница books/[id]/questions. */
function editorInput({ bundle }: FixtureBook) {
  const { questions, photos, letters, chapters, coverPhotos } = editorModel(bundle.book, bundle.questions, bundle.chapters, bundle.photos, bundle.letters);
  return { questions, photos, letters, chapters, book: editorBook(bundle.book, coverPhotos) };
}

/** Книга сервера — как у PDF и кабинета (buildBookContent по полной строке книги). */
const serverContent = ({ bundle }: FixtureBook) => buildBookContent(bundle.book, bundle.questions, bundle.photos.map(toPhotoItem), bundle.chapters, YEAR, bundle.letters);

const photoShape = (p: PhotoItem) => ({ id: p.id, layout: p.layout, caption: p.caption, crop: p.crop ?? null, chapter: p.chapter ?? null, opener: p.opener ?? false });

/** Что печатается и где: главы с названиями, эпиграфами, историями и фото, альбом, оглавление. */
function shape(c: BookContent) {
  return {
    chapters: c.chapters.map((ch) => ({
      key: ch.key,
      number: ch.number,
      title: ch.title,
      epigraph: ch.epigraph || undefined,
      folded: ch.folded,
      opener: ch.openerPhoto ? photoShape(ch.openerPhoto) : null,
      after: ch.photos.map(photoShape),
      items: ch.items.map((it) => [it.id, it.heading, it.answer.length, (it.photos ?? []).map((p) => p.id), it.photoBefore?.id ?? null]),
    })),
    album: c.galleryPhotos.map(photoShape),
    galleryTitle: c.galleryTitle,
    tocMode: c.tocMode,
    tocLines: c.tocLines,
  };
}

/** Фото набора по имени снимка (cover, p3…). */
const named = (b: FixtureBook["bundle"], name: string) => b.photos.find((p) => p.storageKey.endsWith(`/${name}.jpg`));

/**
 * Книга на правилах 2 с местами, выбранными автором: снимок обложки в ответе, фото главы (с кадром) в третьей главе и
 * во второй — убранной автором (её истории и фото — в первой), фото после глав, альбом, «не печатается», глава, которой
 * нет; своё название альбома и оглавление «главы и заголовки» — его полосы считаются по длине строк.
 */
function rev2({ key, bundle: b }: FixtureBook, book: Partial<FixtureBook["bundle"]["book"]> = {}): FixtureBook {
  const keys = b.chapters.length ? b.chapters.map((c) => c.key) : [...new Set(b.questions.map((q) => q.chapter))];
  const places: Record<string, Partial<PhotoRow>> = {
    cover: { questionId: b.questions[1].id },
    p2: { chapter: keys[2], opener: true, crop: { x: 0.2, y: 0.7, zoom: 1.4 } },
    p3: { chapter: keys[1] },
    p12: { chapter: keys[1], opener: true },
    p4: { chapter: GALLERY_KEY },
    p9: { chapter: PHOTO_OFF_KEY },
    p11: { chapter: keys.at(-1)! },
    p8: { chapter: "nowhere" },
  };
  const photos = b.photos.map((p) => ({ ...p, ...(places[p.storageKey.replace(/^.*\/|\.jpg$/g, "")] ?? {}) }));
  const tocLines = { [`c:${keys[1]}`]: { hidden: true }, [`c:${GALLERY_KEY}`]: { title: "Наши самые счастливые дни вместе" }, [`c:${keys[0]}`]: { title: "Самое начало", noOpenerPhoto: true } };
  return { key: `${key}·rev2`, bundle: { ...b, photos, book: { ...b.book, layoutRev: 2, tocMode: "both", tocLines, ...book } } };
}

const prevRules = [...fixtureSample(), ...fixtureVariants()];
const books = [...prevRules, ...prevRules.map((fb) => rev2(fb)), rev2(fixtureVariants().find((v) => v.key === "blank")!, { photoPlacement: "none" }), rev2(fixtureSample()[0], { photoPlacement: "end" })];

describe("редактор собирает ту же книгу, что PDF и кабинет (R9)", () => {
  it("набор шире прежнего: правила 2, закреплённые фото, альбом, «не печатается», снимки обложки, которых не видно", () => {
    expect(books.filter((b) => b.bundle.book.layoutRev === 2).length).toBeGreaterThan(prevRules.length);
    const cinema = books.find((b) => b.bundle.book.interior === "cinema" && b.bundle.book.layoutRev === 2)!;
    const input = editorInput(cinema);
    // Выбранные для обложки, но не видные на ней снимки (лишние места после смены шаблона) обложкой не считаются.
    expect(input.book.coverPhotoExtra!.length).toBeGreaterThan(input.book.coverPhotos!.front.length - 1);
    expect(input.photos.some((p) => p.onCover === null && input.book.coverPhotoExtra!.includes(p.id))).toBe(true);
  });

  it.each(books.map((b) => [b.key, b] as const))("%s: полос и печатный объём — как в кабинете (B3)", (_, fb) => {
    const input = editorInput(fb);
    expect(editorEstimate(input.book, input.questions, input.photos, input.letters, input.chapters)).toEqual(contentPages(serverContent(fb)));
  });

  it.each(books.map((b) => [b.key, b] as const))("%s: главы, фото главы, фото после глав, альбом и оглавление — как у PDF", (_, fb) => {
    const input = editorInput(fb);
    expect(shape(editorContent(input.book, input.questions, input.photos, input.letters, input.chapters))).toEqual(shape(serverContent(fb)));
  });

  it.each(books.map((b) => [b.key, b] as const))("%s: места фото — как на вкладке «Фото» (photoPlaceOf по книге сервера)", (_, fb) => {
    const input = editorInput(fb);
    const editor = photoPlaceOf(editorContent(input.book, input.questions, input.photos, input.letters, input.chapters), input.photos, input.book);
    const server = photoPlaceOf(serverContent(fb), fb.bundle.photos, withCoverPhotos(fb.bundle.book, fb.bundle.photos.map((p) => p.id)));
    expect(Object.fromEntries(editor)).toEqual(Object.fromEntries(server));
    // Отметка «на обложке» у фото редактора — та же, что у места.
    for (const p of input.photos) expect(p.onCover, p.id).toBe(server.get(p.id)!.onCover);
  });

  it("правила 2: снимок обложки в ответе печатается, фото главы — только выбранное автором, с кадром", () => {
    const fb = books.find((b) => b.bundle.book.interior === "cinema" && b.bundle.book.layoutRev === 2)!;
    const input = editorInput(fb);
    const content = editorContent(input.book, input.questions, input.photos, input.letters, input.chapters);
    const places = photoPlaceOf(content, input.photos, input.book);
    const cover = named(fb.bundle, "cover")!;
    expect(places.get(cover.id)).toMatchObject({ kind: "answer", questionId: fb.bundle.questions[1].id, auto: false });
    const p2 = named(fb.bundle, "p2")!;
    expect(places.get(p2.id)).toMatchObject({ kind: "opener", auto: false });
    expect(content.chapters.find((ch) => ch.openerPhoto?.id === p2.id)?.openerPhoto?.crop).toEqual({ x: 0.2, y: 0.7, zoom: 1.4 });
    // Своё «без фото главы» — не вёрстка: в содержимое не идёт.
    expect(JSON.stringify(content.tocLines)).not.toContain("noOpenerPhoto");
    expect(places.get(named(fb.bundle, "p4")!.id)).toMatchObject({ kind: "album", auto: false });
    expect(places.get(named(fb.bundle, "p9")!.id)).toMatchObject({ kind: "off", auto: false });
  });
});

describe("снимки обложки на странице редактора", () => {
  it("без шаблона и оборота (неполная строка книги) — все выбранные для них снимки", () => {
    expect(editorCoverPhotos({ theme: "love", language: "ru", authorGender: "f", recipientGender: "m", coverPhotoId: "c", coverPhotoExtra: ["x"], backPhotoId: "b" }, ["c", "x", "b"])).toEqual({ front: ["c", "x"], back: ["b"] });
  });
});

// ─── список фото в браузере ───────────────────────────────────────────────

const editorPhoto = (id: string, p: Partial<EditorPhoto> = {}): EditorPhoto => ({ id, width: 1200, height: 900, caption: "", layout: "full", questionId: null, inline: null, crop: null, chapter: null, opener: false, onCover: null, ...p });
const place = (p: Pick<EditorPhoto, "questionId" | "chapter" | "opener" | "crop">) => ({ questionId: p.questionId, chapter: p.chapter ?? null, opener: !!p.opener, crop: p.crop ?? null });

/** Случайные, но повторяемые правки мест: ответ, главы (и служебные места), отметка фото главы, кадр. */
function randomPatches(seed: number) {
  let s = seed;
  const rnd = (n: number) => (s = (s * 1103515245 + 12345) % 2 ** 31) % n;
  const ids = ["p0", "p1", "p2", "p3"];
  const chapters = ["a", "b", GALLERY_KEY, PHOTO_OFF_KEY, LETTERS_CHAPTER, null];
  const crops = [null, { x: 0.25, y: 0.75, zoom: 1.5 }];
  return () => {
    const patch: EditorPhotoPatch = {};
    if (rnd(2)) patch.questionId = ["q1", null][rnd(2)];
    if (rnd(2)) patch.chapter = chapters[rnd(chapters.length)];
    if (rnd(2)) patch.opener = !!rnd(2);
    if (!rnd(4)) patch.crop = crops[rnd(2)];
    return { id: ids[rnd(ids.length)], patch };
  };
}

describe("правки фото в редакторе — по правилам сервера (Photo.update и clearOpeners)", () => {
  it("300 случайных правок: список редактора совпадает с фото на сервере", () => {
    const next = randomPatches(7);
    const ids = ["p0", "p1", "p2", "p3"];
    let editor = ids.map((id) => editorPhoto(id));
    const server = new Map(ids.map((id) => [id, Photo.restore(id, { bookId: "b1", position: 0, storageKey: "", thumbKey: "", width: 1200, height: 900, caption: "", layout: "full", questionId: null, inline: null, crop: null, chapter: null, opener: false })]));
    for (let step = 0; step < 300; step++) {
      const { id, patch } = next();
      editor = patchEditorPhotos(editor, [{ id, patch }]);
      const photo = server.get(id)!;
      photo.update(patch);
      // PhotosService.apply: у главы одно фото главы — прежнее уступает место.
      if (patch.opener && photo.snapshot().opener && photo.chapter) for (const [other, o] of server) if (other !== id && o.snapshot().opener && o.chapter === photo.chapter) o.update({ opener: false });
      expect(editor.map(place), `шаг ${step}`).toEqual(ids.map((x) => place(server.get(x)!.snapshot() as Parameters<typeof place>[0])));
    }
  });

  it("фото главы: вставленное в ответ теряет главу; новое фото главы — прежнее остаётся после главы", () => {
    const list = [editorPhoto("a", { chapter: "k", opener: true }), editorPhoto("b", { questionId: "q" })];
    const next = patchEditorPhotos(list, [{ id: "b", patch: { questionId: null, chapter: "k", opener: true } }]);
    expect(next.map(place)).toEqual([place({ questionId: null, chapter: "k", opener: false, crop: null }), place({ questionId: null, chapter: "k", opener: true, crop: null })]);
    expect(patchEditorPhotos(next, [{ id: "b", patch: { questionId: "q2" } }])[1]).toMatchObject({ questionId: "q2", chapter: null, opener: false });
  });
});

describe("«Отменить» (R12): прежние место и кадр всех задетых фото", () => {
  it("200 случайных пачек: правка, потом «Отменить» — фото там же, где были", () => {
    const next = randomPatches(11);
    let state = ["p0", "p1", "p2", "p3"].map((id) => editorPhoto(id));
    for (let step = 0; step < 200; step++) {
      const updates = Array.from({ length: 1 + (step % 3) }, next);
      const undo = photoUndo(state, updates);
      const after = patchEditorPhotos(state, updates);
      expect(patchEditorPhotos(after, undoUpdates(undo)).map(place), `шаг ${step}`).toEqual(state.map(place));
      state = after;
    }
  });

  it("фото главы, уступившее место, тоже в снимке; правленая подпись — тоже, остальные поля — нет", () => {
    const list = [editorPhoto("a", { chapter: "k", opener: true, caption: "A" }), editorPhoto("b", { questionId: "q", caption: "B" }), editorPhoto("c")];
    expect(photoUndo(list, [{ id: "b", patch: { questionId: null, chapter: "k", opener: true, caption: "новая" } }])).toEqual([
      { id: "a", questionId: null, chapter: "k", opener: true, crop: null },
      { id: "b", questionId: "q", chapter: null, opener: false, crop: null, caption: "B" },
    ]);
  });
});

describe("строки фото с сервера", () => {
  const row = (id: string, p: Partial<PhotoRow> = {}) => ({ id, width: 1000, height: 800, caption: "", layout: "full" as const, questionId: null, inline: null, crop: null, chapter: null, opener: false, ...p });

  it("знакомые фото заменяются (номер поворота и «на обложке» остаются), новые — в конец", () => {
    const list = [editorPhoto("a", { rev: 2, onCover: "cover" }), editorPhoto("b")];
    const merged = mergePhotoRows(list, [row("a", { caption: "с сервера" }), row("n")]);
    expect(merged.map((p) => [p.id, p.caption, p.rev ?? 0, p.onCover])).toEqual([
      ["a", "с сервера", 2, "cover"],
      ["b", "", 0, null],
      ["n", "", 0, null],
    ]);
    expect(toEditorPhoto(row("x", { opener: true, chapter: "k" }))).toMatchObject({ chapter: "k", opener: true, crop: null, onCover: null });
  });

  it("ответ сервера не затирает неправленые поля (подпись, которую автор успел ввести)", () => {
    const updates = [{ id: "a", patch: { crop: { x: 0.4, y: 0.4, zoom: 1.2 } } }];
    expect(serverUpdates([row("a", { caption: "старая", crop: { x: 0.4, y: 0.4, zoom: 1.2 } })], updates)).toEqual([{ id: "a", patch: { questionId: null, chapter: null, opener: false, crop: { x: 0.4, y: 0.4, zoom: 1.2 } } }]);
  });
});

describe("useBookContent: одна сборка для превью, счётчика и мест", () => {
  type Props = { book: EditorBook; questions: EditorQuestion[]; photos: EditorPhoto[]; letters: LetterLike[]; chapters: EditorChapter[] };
  function Probe(p: Props) {
    const view = useBookContent(p.book, p.questions, p.photos, p.letters, p.chapters);
    const pages = useBookPages(p.book, p.questions, p.photos, p.letters, p.chapters);
    return createElement("p", null, JSON.stringify({ pages: view.pages, oldName: pages, places: Object.fromEntries(view.places), chapters: view.content.chapters.length }));
  }

  it("полосы, места и главы — те же, что у editorContent; useBookPages (прежнее имя) берёт ту же сборку", () => {
    const fb = rev2(fixtureSample().find((b) => b.bundle.book.interior === "luna")!);
    const input = editorInput(fb);
    const markup = renderToStaticMarkup(createElement(Probe, input));
    const out = JSON.parse(markup.replace(/^<p>|<\/p>$/g, "").replace(/&quot;/g, '"'));
    const content = editorContent(input.book, input.questions, input.photos, input.letters, input.chapters);
    expect(out).toEqual({ pages: contentPages(content), oldName: contentPages(content), places: JSON.parse(JSON.stringify(Object.fromEntries(photoPlaceOf(content, input.photos, input.book)))), chapters: content.chapters.length });
  });
});
