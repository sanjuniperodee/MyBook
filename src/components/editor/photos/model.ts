/**
 * Данные и правила листов мест фото (лист «Где стоит фото», «Фото главы», «Альбом в конце») — без React, чтобы их
 * проверяли тесты. Место фото читается только из photoPlaceOf (src/lib/book/photo-place.ts); служебные ключи альбома
 * и «не печатается» пишет единственная функция placePatch — остальной код сравнивает места, а не ключи.
 */
import type { Locale } from "@/i18n/config";
import { patchEditorPhotos, type EditorPhoto, type EditorPhotoPatch } from "@/lib/book/editor-model";
import { isChapterPhotoKey, PHOTO_OFF_KEY } from "@/lib/book/layout";
import type { InlinePhotoStyle } from "@/lib/book/inline-photo";
import type { PhotoCrop } from "@/lib/book/photo-crop";
import type { PhotoPlace } from "@/lib/book/photo-place";
import { GALLERY_KEY, tocKey, type TocLineSetting, type TocLines } from "@/lib/book/toc";

/** Фото книги в листах: размеры и поля места — строка photos или фото редактора. Порядок списка — порядок вкладки «Фото». */
export interface SheetPhoto {
  id: string;
  width: number;
  height: number;
  questionId?: string | null;
  chapter?: string | null;
  opener?: boolean;
  crop?: PhotoCrop | null;
  caption?: string;
  layout?: "full" | "bleed" | "half" | "grid";
}

/** Строка фото из ответа API (PATCH, пакет, загрузка) — ей вызывающий обновляет свой список. */
export interface PhotoRowView {
  id: string;
  position: number;
  width: number;
  height: number;
  caption: string;
  layout: "full" | "bleed" | "half" | "grid";
  questionId: string | null;
  inline: InlinePhotoStyle | null;
  crop: PhotoCrop | null;
  chapter: string | null;
  opener: boolean;
}

/** Книга для листов мест. */
export interface PlaceBook {
  id: string;
  /** Оформление страниц (id из lib/book/interiors): есть ли фото главы и какой оно формы. */
  interior: string;
  format: string;
  /** Язык книги — на нём мини-страница начала главы. */
  language: Locale;
  /** Своя книга: «раздел» вместо «ответ». */
  blank: boolean;
  /** Правило книги для фото без выбранного места. */
  photoPlacement: "chapters" | "end" | "none";
  /** Название альбома в конце по виду книги (book-content.ts) — до своего названия автора. */
  galleryTitle: string;
  editable: boolean;
  /**
   * Правила раскладки фото книги (books.layout_rev; нет — прежние, 1). На прежних первая правка места сначала
   * переводит книгу на правила 2 (ensureLayoutRev2, api.ts).
   */
  layoutRev?: number;
}

/** Глава книги по порядку: название (своё из tocLines), номер и эпиграф для мини-страницы; printed — в ней есть что печатать. */
export interface PlaceChapter {
  key: string;
  title: string;
  number?: number | null;
  epigraph?: string;
  printed: boolean;
}

/** Ответ (раздел) книги — куда можно поставить фото. */
export interface PlaceAnswer {
  id: string;
  title: string;
  chapterKey: string;
}

/** Всё о фото книги, что нужно листам: книга, фото, их места (photoPlaceOf), главы, ответы и строки оглавления. */
export interface PlaceData {
  book: PlaceBook;
  photos: readonly SheetPhoto[];
  places: ReadonlyMap<string, PhotoPlace>;
  chapters: readonly PlaceChapter[];
  /** Нет — пункт «В ответ…» есть только у фото, которое уже в ответе. */
  answers?: readonly PlaceAnswer[];
  tocLines: TocLines;
  /** Предел фото в книге (MAX_PHOTOS со страницы); нет — предел домена. Загрузка из листа больше не отправляет. */
  maxPhotos?: number;
}

/** Что листы сообщают вызывающему: новые строки фото, загруженные фото, новые настройки книги, новый порядок фото. */
export interface PlaceEvents {
  onPhotos: (rows: PhotoRowView[]) => void;
  /** Загруженные в листе фото (уже поставленные на место). */
  onUploaded?: (rows: PhotoRowView[]) => void;
  onBook?: (patch: { tocLines?: TocLines; photoPlacement?: PlaceBook["photoPlacement"] }) => void;
  /** Новый порядок всех фото книги (id). */
  onOrder?: (ids: string[]) => void;
  /**
   * Места после правки, пока книга не пересобрана (projectPlace). Нужны листу, который открыл другой лист поверх себя;
   * вызывающему, который сам пересобирает книгу по onPhotos, — нет.
   */
  onPlaces?: (places: ReadonlyMap<string, PhotoPlace>) => void;
  /**
   * Книгу перевели на правила раскладки 2 перед правкой мест или сверили версию правил после правки: версия и все
   * строки фото книги (по позициям) — вызывающий заменяет ими свои (редактор — фото и layoutRev книги, вкладки —
   * перечитывают страницу).
   */
  onLayout?: (sync: { layoutRev: number; photos: PhotoRowView[] }) => void;
}

/** Названия для подписей мест. */
export interface PlaceNames {
  chapter: (key: string) => string;
  question: (id: string) => string;
}

export function placeNames(chapters: readonly Pick<PlaceChapter, "key" | "title">[], answers: readonly Pick<PlaceAnswer, "id" | "title">[] = []): PlaceNames {
  const c = new Map(chapters.map((ch) => [ch.key, ch.title]));
  const q = new Map(answers.map((a) => [a.id, a.title]));
  return { chapter: (key) => c.get(key) || "—", question: (id) => q.get(id) || "—" };
}

// ─── куда поставить ─────────────────────────────────────────────────────────

/** Выбор автора в листе места. */
export type PlaceTarget =
  | { kind: "answer"; questionId: string }
  | { kind: "opener"; chapterKey: string }
  | { kind: "after"; chapterKey: string }
  | { kind: "album" }
  | { kind: "auto" }
  | { kind: "off" };

/** Правка места фото для PATCH …/photos/[pid] и пакета (правила проверяет домен, Photo.update). */
export interface PlacePatch {
  questionId: string | null;
  chapter?: string | null;
  opener?: boolean;
  crop?: PhotoCrop | null;
}

/** Что записать, чтобы фото встало на выбранное место (R3 листа «Где стоит фото»). */
export function placePatch(t: PlaceTarget): PlacePatch {
  switch (t.kind) {
    case "answer":
      return { questionId: t.questionId };
    case "opener":
      return { questionId: null, chapter: t.chapterKey, opener: true };
    case "after":
      return { questionId: null, chapter: t.chapterKey, opener: false };
    case "album":
      return { questionId: null, chapter: GALLERY_KEY };
    case "auto":
      return { questionId: null, chapter: null };
    case "off":
      return { questionId: null, chapter: PHOTO_OFF_KEY };
  }
}

/** Какой пункт листа места отмечен «сейчас здесь». Фото, ждущее главу без текста, — выбор «после главы» (или фото главы). */
export function currentOption(place: PhotoPlace | undefined, photo?: Pick<SheetPhoto, "opener">): PlaceTarget["kind"] {
  if (!place) return "auto";
  if (place.waitingFor) return photo?.opener ? "opener" : "after";
  if (place.auto) return "auto";
  return place.kind;
}

/** Совпадает ли выбор с тем, где фото стоит сейчас, — тогда писать нечего. */
export function isSamePlace(place: PhotoPlace | undefined, t: PlaceTarget): boolean {
  if (!place) return false;
  if (t.kind === "auto") return place.auto && !place.waitingFor;
  if (place.auto) return false;
  if (t.kind === "answer") return place.kind === "answer" && place.questionId === t.questionId;
  if (t.kind === "opener" || t.kind === "after") return place.kind === t.kind && place.chapterKey === t.chapterKey;
  return place.kind === t.kind;
}

/**
 * Нужен ли вопрос перед переносом (R12): только когда фото уходит из ответа или перестаёт быть фото другой главы
 * (выбранным автором — подставленное прежними правилами место глава получит обратно сама). Остальное — с «Отменить».
 */
export type MoveConfirm = { kind: "answer"; questionId: string } | { kind: "opener"; chapterKey: string } | null;

export function confirmFor(place: PhotoPlace | undefined, t: PlaceTarget): MoveConfirm {
  if (!place || isSamePlace(place, t)) return null;
  if (place.kind === "answer" && place.questionId && !(t.kind === "answer" && t.questionId === place.questionId)) return { kind: "answer", questionId: place.questionId };
  // Фото главы этой же главы ставят после неё или меняют — глава та же, автор видит её в листе.
  const sameChapter = (t.kind === "opener" || t.kind === "after") && t.chapterKey === place.chapterKey;
  if (place.kind === "opener" && !place.auto && place.chapterKey && !sameChapter) return { kind: "opener", chapterKey: place.chapterKey };
  return null;
}

/** Фото главы, выбранное автором (не подставленное прежними правилами), — его сменит новое фото главы. */
export function chosenOpener(places: ReadonlyMap<string, PhotoPlace>, chapterKey: string, except?: string): string | null {
  for (const [id, p] of places) if (p.kind === "opener" && !p.auto && p.chapterKey === chapterKey && id !== except) return id;
  return null;
}

/** Фото главы сейчас — выбранное или подставленное прежними правилами. */
export function openerOf(places: ReadonlyMap<string, PhotoPlace>, chapterKey: string): { id: string; auto: boolean } | null {
  for (const [id, p] of places) if (p.kind === "opener" && p.chapterKey === chapterKey) return { id, auto: p.auto };
  return null;
}

/** Главы, куда можно поставить фото: без писем близких (у них нет ни фото главы, ни страниц фото). */
export const photoChapters = <T extends Pick<PlaceChapter, "key">>(chapters: readonly T[]): T[] => chapters.filter((c) => isChapterPhotoKey(c.key));

// ─── правка и её отмена ─────────────────────────────────────────────────────

/** Место фото до правки — по нему «Отменить» возвращает всё как было (вместе с кадром). */
export interface PlaceSnapshot {
  id: string;
  questionId: string | null;
  chapter: string | null;
  opener: boolean;
  crop: PhotoCrop | null;
}

export const snapshotOf = (p: SheetPhoto): PlaceSnapshot => ({ id: p.id, questionId: p.questionId ?? null, chapter: p.chapter ?? null, opener: !!p.opener, crop: p.crop ?? null });

/** Пакет, который возвращает места из снимков: фото глав — последними, чтобы их отметку не сняла соседняя правка. */
export function restoreUpdates(snaps: readonly PlaceSnapshot[]): { id: string; patch: PlacePatch }[] {
  return [...snaps]
    .sort((a, b) => Number(a.opener) - Number(b.opener))
    .map((s) => ({ id: s.id, patch: { questionId: s.questionId, chapter: s.questionId ? null : s.chapter, opener: s.opener, crop: s.crop } }));
}

/**
 * Фото с отметкой фото главы chapterKey в строках (кроме except): после перевода на правила 2 так закреплено и фото
 * главы, которое прежние правила ставили сами, — пока места не пересобраны, они его ещё зовут подставленным.
 */
function markedOpener(photos: readonly SheetPhoto[] | undefined, chapterKey: string, except: string): string | null {
  return photos?.find((p) => p.opener && !p.questionId && p.chapter === chapterKey && p.id !== except)?.id ?? null;
}

/**
 * Переносы одним пакетом: если фото становится фото главы, где уже стоит выбранное, то прежнее сначала уходит после
 * главы. photos — строки фото: отмеченное в них фото главы — тоже выбранное (тогда оно попадёт в снимок «Отменить»).
 */
export function moveUpdates(moves: readonly { id: string; target: PlaceTarget }[], places: ReadonlyMap<string, PhotoPlace>, photos?: readonly SheetPhoto[]): { id: string; patch: PlacePatch }[] {
  const out: { id: string; patch: PlacePatch }[] = [];
  const moving = new Set(moves.map((m) => m.id));
  for (const m of moves) {
    if (m.target.kind === "opener") {
      const prev = chosenOpener(places, m.target.chapterKey, m.id) ?? markedOpener(photos, m.target.chapterKey, m.id);
      if (prev && !moving.has(prev) && !out.some((u) => u.id === prev)) out.push({ id: prev, patch: { questionId: null, chapter: m.target.chapterKey, opener: false } });
    }
    out.push({ id: m.id, patch: placePatch(m.target) });
  }
  return out;
}

/**
 * Строка фото после правки — правило одно с редактором (patchEditorPhotos, editor-model.ts, оно же у домена
 * Photo.update): ответ снимает главу и отметку фото главы, отметка — только у фото с настоящей главой. Поля, которых
 * правка не касается (и которых у SheetPhoto может не быть), остаются как были.
 */
export function applyPatch<T extends SheetPhoto>(p: T, patch: Partial<PlacePatch> & Pick<EditorPhotoPatch, "caption" | "layout">): T {
  return patchEditorPhotos([p as unknown as EditorPhoto], [{ id: p.id, patch }])[0] as unknown as T;
}

/** Что знает лист о книге, чтобы сразу показать новое место, не дожидаясь пересборки (её сделает вызывающий). */
export interface PlaceContext {
  openerDesign: boolean;
  photoPlacement: PlaceBook["photoPlacement"];
  /** Главы с текстом. */
  printed: ReadonlySet<string>;
  chapterOfQuestion?: (id: string) => string | undefined;
}

/**
 * Место после правки — до пересборки книги: то же правило, что у photoPlaceOf, по выбору автора. У фото, отданного
 * правилу книги, глава станет известна только после пересборки (chapterKey нет).
 */
export function projectPlace(t: PlaceTarget, prev: PhotoPlace | undefined, ctx: PlaceContext): PhotoPlace {
  const onCover = prev?.onCover ?? null;
  const auto = (): PhotoPlace => {
    // Снимок обложки сам внутрь не идёт; дальше — правило книги.
    if (onCover || ctx.photoPlacement === "none") return { kind: "off", auto: true, onCover };
    if (ctx.photoPlacement === "end" || !ctx.printed.size) return { kind: "album", auto: true, onCover };
    return { kind: "after", auto: true, onCover };
  };
  switch (t.kind) {
    case "answer": {
      const chapterKey = ctx.chapterOfQuestion?.(t.questionId);
      return { kind: "answer", questionId: t.questionId, ...(chapterKey ? { chapterKey } : {}), auto: false, onCover };
    }
    case "opener":
    case "after":
      if (!ctx.printed.has(t.chapterKey)) return { ...auto(), waitingFor: t.chapterKey };
      return { kind: t.kind === "opener" && ctx.openerDesign ? "opener" : "after", chapterKey: t.chapterKey, auto: false, onCover };
    case "album":
      return { kind: "album", auto: false, onCover };
    case "off":
      return { kind: "off", auto: false, onCover };
    case "auto":
      return auto();
  }
}

/** Места после переносов (moveUpdates, photos — строки фото): у перенесённых — новые, у фото главы, которое сменили, — «после главы». */
export function projectMoves(moves: readonly { id: string; target: PlaceTarget }[], places: ReadonlyMap<string, PhotoPlace>, ctx: PlaceContext, photos?: readonly SheetPhoto[]): Map<string, PhotoPlace> {
  const out = new Map<string, PhotoPlace>();
  for (const u of moveUpdates(moves, places, photos)) {
    const move = moves.find((m) => m.id === u.id);
    const prev = places.get(u.id);
    out.set(u.id, move ? projectPlace(move.target, prev, ctx) : { kind: "after", chapterKey: u.patch.chapter ?? undefined, auto: false, onCover: prev?.onCover ?? null });
  }
  return out;
}

// ─── альбом в конце ─────────────────────────────────────────────────────────

/** Фото альбома в конце в порядке печати: выбранные в альбом автором — первыми, потом вставшие туда сами (R1). */
export function albumPhotos<T extends Pick<SheetPhoto, "id">>(photos: readonly T[], places: ReadonlyMap<string, PhotoPlace>): T[] {
  const inAlbum = photos.filter((p) => places.get(p.id)?.kind === "album");
  return [...inAlbum.filter((p) => !places.get(p.id)!.auto), ...inAlbum.filter((p) => places.get(p.id)!.auto)];
}

/**
 * Куда уходит фото, которое убрали из альбома: «пусть встанет само», если правило книги не вернёт его в альбом
 * (раскладывает после глав и главы с текстом есть), иначе — «не печатать».
 */
export function albumOutTarget(place: PhotoPlace | undefined, ctx: PlaceContext): PlaceTarget {
  return projectPlace({ kind: "auto" }, place, ctx).kind === "album" ? { kind: "off" } : { kind: "auto" };
}

/**
 * «Убрать альбом» (S9): правило книги для фото без места и куда деть фото, выбранные в альбом автором, — после глав
 * (правило «после глав», выбор места снимается) или не печатать (правило «не печатать», фото — в «не печатается»).
 */
export function albumRemoval(choice: "chapters" | "none", photos: readonly Pick<SheetPhoto, "id">[], places: ReadonlyMap<string, PhotoPlace>): { photoPlacement: PlaceBook["photoPlacement"]; moves: { id: string; target: PlaceTarget }[] } {
  const target: PlaceTarget = choice === "chapters" ? { kind: "auto" } : { kind: "off" };
  return { photoPlacement: choice, moves: albumPhotos(photos, places).filter((p) => !places.get(p.id)!.auto).map((p) => ({ id: p.id, target })) };
}

/** Строки оглавления, где у строки key поле field задано (value) или снято; пустая строка уходит совсем. */
function withLineField<K extends "noOpenerPhoto" | "title">(lines: TocLines, key: string, field: K, value: TocLineSetting[K] | undefined): TocLines {
  const next: TocLineSetting = { ...lines[key] };
  if (value === undefined) delete next[field];
  else next[field] = value;
  const out = { ...lines };
  if (Object.keys(next).length) out[key] = next;
  else delete out[key];
  return out;
}

/** Строка главы с отметкой «без фото» (R3) — или без неё; остальные настройки строки не трогаются. */
export const withNoOpenerPhoto = (lines: TocLines, chapterKey: string, on: boolean): TocLines => withLineField(lines, tocKey.chapter(chapterKey), "noOpenerPhoto", on ? true : undefined);

/** Своё название альбома в конце (строка оглавления альбома) — пустое возвращает название по виду книги. */
export const withGalleryTitle = (lines: TocLines, title: string): TocLines => withLineField(lines, tocKey.chapter(GALLERY_KEY), "title", title.trim() || undefined);

export const galleryTitleOf = (lines: TocLines, fallback: string) => lines[tocKey.chapter(GALLERY_KEY)]?.title?.trim() || fallback;
export const noOpenerPhotoOf = (lines: TocLines, chapterKey: string) => !!lines[tocKey.chapter(chapterKey)]?.noOpenerPhoto;

/**
 * Новый порядок всех фото, когда в списке подмножества (фото после главы) одно сдвинули на step: остальные фото
 * книги остаются на своих местах, переставляются только позиции этого подмножества.
 */
export function reorderWithin(all: readonly string[], subset: readonly string[], id: string, step: -1 | 1): string[] | null {
  const i = subset.indexOf(id);
  const j = i + step;
  if (i < 0 || j < 0 || j >= subset.length) return null;
  const next = [...subset];
  [next[i], next[j]] = [next[j], next[i]];
  const inSubset = new Set(subset);
  let k = 0;
  return all.map((x) => (inSubset.has(x) ? next[k++] : x));
}
