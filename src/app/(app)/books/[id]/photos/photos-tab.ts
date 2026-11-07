/**
 * Правила вкладки «Фото» без React — их проверяют тесты: фильтры над сеткой, метка обрезки и общий совет
 * «Показать целиком», рамка «Кадра» по месту фото и вопрос при удалении. Место фото — только из photoPlaceOf
 * (R6): ключи глав здесь не сравниваются.
 */
import type { ClientMessages } from "@/i18n/messages";
import type { BookFormat } from "@/lib/book/formats";
import type { InteriorDesign } from "@/lib/book/interiors";
import { WARN_LOSS } from "@/lib/book/photo-loss";
import { gridCellFrame, openerFrame, pageFrame, type PlaceFrame } from "@/lib/book/photo-pages";
import type { PhotoPlace } from "@/lib/book/photo-place";
import type { PlaceAnswer, PlaceBook, PlaceChapter, SheetPhoto } from "@/components/editor/photos/model";
import type { TocLines } from "@/lib/book/toc";

export type PhotoLayout = NonNullable<SheetPhoto["layout"]>;

/** Фото на вкладке: место, кадр, подпись и вид на странице. */
export type TabPhoto = SheetPhoto & {
  caption: string;
  layout: PhotoLayout;
  /** Версия файла (меняется при повороте и правке) — в адресе картинки, чтобы браузер не показал прежнюю. */
  version?: string;
  /** Правлено в редакторе фото. */
  edited?: boolean;
};

/** Что страница посчитала на сервере (та же сборка, что у PDF): места фото, обрезка на месте, главы и ответы для листов. */
export interface PhotosTabData {
  book: PlaceBook;
  photos: TabPhoto[];
  /** photoPlaceOf — парами [id, место] (Map не переходит границу сервер → браузер). */
  places: [string, PhotoPlace][];
  chapters: PlaceChapter[];
  answers: PlaceAnswer[];
  tocLines: TocLines;
  /** photoLosses: доля снимка, которая срежется на его месте (id → 0…1). */
  losses: Record<string, number>;
}

// ─── фильтры ───────────────────────────────────────────────────────────────

export const PHOTO_FILTERS = ["all", "auto", "cover", "off", "crop"] as const;
export type PhotoFilter = (typeof PHOTO_FILTERS)[number];
export const isPhotoFilter = (v: unknown): v is PhotoFilter => (PHOTO_FILTERS as readonly unknown[]).includes(v);

/**
 * Обрезка фото на его месте — по сборке сервера. Пока вид на странице поменяли, а книгу ещё не пересобрали
 * (layout не тот, что у сервера), прежняя оценка неверна — 0.
 */
export function lossOf(photo: Pick<SheetPhoto, "id" | "layout">, server: Pick<SheetPhoto, "layout"> | undefined, losses: Readonly<Record<string, number>>): number {
  if (!server || (photo.layout ?? "full") !== (server.layout ?? "full")) return 0;
  return losses[photo.id] ?? 0;
}

/** Фото с заметной обрезкой (R11): метка у фото, фильтр «С обрезкой». */
export const isLossy = (loss: number) => loss >= WARN_LOSS;

/** Подходит ли фото под фильтр: «Встали сами» — напечатаются по правилу книги; «Не печатаются» — и по выбору, и по правилу. */
export function matchesFilter(filter: PhotoFilter, place: PhotoPlace | undefined, loss: number): boolean {
  switch (filter) {
    case "all":
      return true;
    case "auto":
      return !!place && place.auto && place.kind !== "off";
    case "cover":
      return !!place?.onCover;
    case "off":
      return place?.kind === "off";
    case "crop":
      return isLossy(loss);
  }
}

/** Сколько фото под каждым фильтром. */
export function filterCounts(photos: readonly Pick<SheetPhoto, "id">[], places: ReadonlyMap<string, PhotoPlace>, loss: (id: string) => number): Record<PhotoFilter, number> {
  const out = Object.fromEntries(PHOTO_FILTERS.map((f) => [f, 0])) as Record<PhotoFilter, number>;
  for (const p of photos) for (const f of PHOTO_FILTERS) if (matchesFilter(f, places.get(p.id), loss(p.id))) out[f]++;
  return out;
}

/** Чипы фильтров: «Все», остальные — если под ними есть фото или фильтр выбран сейчас (ссылка ?filter=crop). */
export const visibleFilters = (counts: Record<PhotoFilter, number>, active: PhotoFilter): PhotoFilter[] => PHOTO_FILTERS.filter((f) => f === "all" || f === active || counts[f] > 0);

// ─── место на странице ─────────────────────────────────────────────────────

/** Фото на страницах фото — после главы или в альбоме: у него есть вид на странице, подпись и «Кадр». */
export const onPhotoPages = (place: PhotoPlace | undefined) => place?.kind === "after" || place?.kind === "album";

/** «Показать целиком» — у фото «До краёв» на страницах фото с заметной обрезкой: оно станет «Целиком, с полями». */
export const canShowWhole = (photo: Pick<SheetPhoto, "layout">, place: PhotoPlace | undefined, loss: number) => photo.layout === "bleed" && onPhotoPages(place) && isLossy(loss);

/** Фото для общего совета «Показать их целиком?»; совет — когда таких два и больше. */
export function wideBleedIds(photos: readonly Pick<SheetPhoto, "id" | "layout">[], places: ReadonlyMap<string, PhotoPlace>, loss: (id: string) => number): string[] {
  return photos.filter((p) => canShowWhole(p, places.get(p.id), loss(p.id))).map((p) => p.id);
}
export const BANNER_MIN = 2;

/**
 * Рамка «Кадра» — форма места фото в книге (R4): фото главы — по оформлению; на страницах фото — лист под обрез
 * или клетка сетки. Где кадр на печать не влияет (вписано целиком, в ответе — там свой кадр, не печатается), — null.
 */
export function cropFrameOf(place: PhotoPlace | undefined, layout: PhotoLayout, format: BookFormat, design: InteriorDesign): PlaceFrame | null {
  if (place?.kind === "opener") return openerFrame(format, design);
  if (!onPhotoPages(place)) return null;
  if (layout === "bleed") return pageFrame(format);
  if (layout === "grid") return gridCellFrame(format, design);
  return null;
}

// ─── удаление ──────────────────────────────────────────────────────────────

/**
 * Вопрос перед удалением: где фото сейчас, что станет с обложкой и главой, и вариант, который ничего не удаляет —
 * «Оставить только на обложке» у снимка обложки, «Не печатать в книге» у остальных (у фото, которое и так
 * не печатается, его нет: отмена уже ничего не удаляет).
 */
export interface DeleteDialog {
  title: string;
  text: string;
  confirmLabel: string;
  cancelLabel: string;
  /** Второй ответ: убрать фото из книги, не удаляя (место «не печатается»). */
  altLabel?: string;
}

export function deleteDialogOf(place: PhotoPlace | undefined, t: ClientMessages["books"]["photosTab"]["delete"], names: { place: string; chapter: (key: string) => string }): DeleteDialog {
  const lines = [t.text];
  if (place) lines.push(t.now(names.place));
  if (place?.onCover) lines.push(t.cover);
  if (place?.kind === "opener" && place.chapterKey) lines.push(t.opener(names.chapter(place.chapterKey)));
  const base = { title: t.title, text: lines.join(" "), cancelLabel: t.cancel };
  if (place?.onCover) return { ...base, confirmLabel: t.deleteAll, altLabel: t.keepCover };
  if (place && place.kind !== "off") return { ...base, confirmLabel: t.confirm, altLabel: t.keep };
  return { ...base, confirmLabel: t.confirm };
}

// ─── вид «По главам» ───────────────────────────────────────────────────────

/** Группа галереи «По главам»: глава (по порядку книги), альбом в конце или фото, которые не печатаются. */
export interface PhotoGroup<T> {
  id: string;
  kind: "chapter" | "album" | "off";
  /** Ключ главы — у групп-глав. */
  chapterKey?: string;
  photos: T[];
}

/**
 * Фото по месту в книге: сначала главы в порядке книги (фото главы, фото в ответах и после главы — одной группой; фото,
 * ждущее главу без текста, — в ней же), потом альбом в конце и «не печатаются». Пустые группы пропускаются; главы, которых
 * нет в порядке (влитые автором), — после известных. Место — только из photoPlaceOf.
 */
export function groupByPlace<T extends { id: string }>(photos: readonly T[], places: ReadonlyMap<string, PhotoPlace>, chapterOrder: readonly string[]): PhotoGroup<T>[] {
  const chapters = new Map<string, T[]>(chapterOrder.map((k) => [k, []]));
  const album: T[] = [];
  const off: T[] = [];
  for (const p of photos) {
    const place = places.get(p.id);
    if (!place || place.kind === "off") off.push(p);
    else if (place.kind === "album" && !place.waitingFor) album.push(p);
    else {
      const key = place.waitingFor ?? place.chapterKey;
      if (!key) album.push(p);
      else chapters.set(key, [...(chapters.get(key) ?? []), p]);
    }
  }
  return [
    ...[...chapters].filter(([, list]) => list.length).map(([key, list]): PhotoGroup<T> => ({ id: `chapter:${key}`, kind: "chapter", chapterKey: key, photos: list })),
    ...(album.length ? [{ id: "album", kind: "album" as const, photos: album }] : []),
    ...(off.length ? [{ id: "off", kind: "off" as const, photos: off }] : []),
  ];
}

/** Сколько фото каждого вида по месту: выбрал автор, встали сами (правило книги), не печатаются внутри книги. */
export function placeTotals(photos: readonly { id: string }[], places: ReadonlyMap<string, PhotoPlace>): { total: number; placed: number; auto: number; off: number } {
  let placed = 0;
  let auto = 0;
  let off = 0;
  for (const p of photos) {
    const place = places.get(p.id);
    if (!place || place.kind === "off") off++;
    else if (place.auto) auto++;
    else placed++;
  }
  return { total: photos.length, placed, auto, off };
}
