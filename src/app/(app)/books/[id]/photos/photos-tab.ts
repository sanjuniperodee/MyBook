/**
 * Правила вкладки «Фото» без React — их проверяют тесты: фильтры над сеткой, метка обрезки и общий совет
 * «Показать целиком», рамка «Кадра» по месту фото и вопрос при удалении. Место фото — только из photoPlaceOf
 * (R6): ключи глав здесь не сравниваются.
 */
import type { ClientMessages } from "@/i18n/messages";
import { cropFrameOf, onPhotoPages } from "@/lib/book/photo-pages";
import type { PhotoPlace } from "@/lib/book/photo-place";
import { filterCounts, isLossy, isPhotoFilter, lossOf, matchesFilter, PHOTO_FILTERS, placeTotals, visibleFilters, type PhotoFilter } from "@/lib/book/photo-tab-model";
import type { PlaceAnswer, PlaceBook, PlaceChapter, SheetPhoto } from "@/components/editor/photos/model";
import type { TocLines } from "@/lib/book/toc";

export { cropFrameOf, filterCounts, isLossy, isPhotoFilter, lossOf, matchesFilter, onPhotoPages, PHOTO_FILTERS, placeTotals, visibleFilters, type PhotoFilter };

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
  /** Предел фото в книге (CRM → «Сайт» → «Фото в книге»). */
  maxPhotos?: number;
}

// ─── место на странице ─────────────────────────────────────────────────────

/** «Показать целиком» — у фото «До краёв» на страницах фото с заметной обрезкой: оно станет «Целиком, с полями». */
export const canShowWhole = (photo: Pick<SheetPhoto, "layout">, place: PhotoPlace | undefined, loss: number) => photo.layout === "bleed" && onPhotoPages(place) && isLossy(loss);

/** Фото для общего совета «Показать их целиком?»; совет — когда таких два и больше. */
export function wideBleedIds(photos: readonly Pick<SheetPhoto, "id" | "layout">[], places: ReadonlyMap<string, PhotoPlace>, loss: (id: string) => number): string[] {
  return photos.filter((p) => canShowWhole(p, places.get(p.id), loss(p.id))).map((p) => p.id);
}
export const BANNER_MIN = 2;

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
