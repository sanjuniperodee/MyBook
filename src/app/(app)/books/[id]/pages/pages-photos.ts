/**
 * Фото глав на вкладке «Страницы» без React — их проверяют тесты: значок оформлений с фото в начале главы, подсказки
 * при смене оформления, состояние фото в строке главы и места фото под текущее оформление, пока книга не пересобрана.
 * Место фото — только из photoPlaceOf (R6): ключи глав здесь не сравниваются.
 */
import type { InteriorDesign } from "@/lib/book/interiors";
import type { PhotoPlace } from "@/lib/book/photo-place";
import type { TocLines } from "@/lib/book/toc";
import { albumPhotos, noOpenerPhotoOf, openerOf, photoChapters, type PlaceData, type SheetPhoto } from "@/components/editor/photos/model";

/** Форма фото главы в оформлении (ключ editor.openerShape) или null — глава начинается без фото. */
export type OpenerShape = NonNullable<InteriorDesign["opener"]["photo"]>;
export const openerShapeOf = (design: Pick<InteriorDesign, "opener">): OpenerShape | null => design.opener.photo ?? null;

/** Что страница посчитала на сервере (та же сборка, что у PDF) для фото глав и альбома. */
export type PagesPhotoData = Omit<PlaceData, "places" | "tocLines"> & {
  /** photoPlaceOf — парами [id, место] (Map не переходит границу сервер → браузер). */
  places: [string, PhotoPlace][];
  /** Лучшие кандидаты в фото главы по ключу главы (suggestOpener) — для оформления, по которому собрана книга. */
  fit: Record<string, string[]>;
};

/**
 * Места фото под оформление, выбранное сейчас, пока сервер не пересобрал книгу (R5): в оформлении с фото главы
 * отмеченное автором фото после главы встаёт в начало (одно на главу), в оформлении без него фото главы печатается
 * после её текста. Ничего не меняется — тот же объект.
 */
export function placesForDesign(places: ReadonlyMap<string, PhotoPlace>, photos: readonly Pick<SheetPhoto, "id" | "opener">[], openerDesign: boolean): ReadonlyMap<string, PhotoPlace> {
  let out: Map<string, PhotoPlace> | null = null;
  const set = (id: string, place: PhotoPlace) => (out ??= new Map(places)).set(id, place);
  const withOpener = new Set<string>();
  for (const p of places.values()) if (p.kind === "opener" && p.chapterKey) withOpener.add(p.chapterKey);
  for (const photo of photos) {
    const p = places.get(photo.id);
    if (!p) continue;
    if (!openerDesign && p.kind === "opener") set(photo.id, { ...p, kind: "after" });
    else if (openerDesign && p.kind === "after" && !p.auto && photo.opener && p.chapterKey && !withOpener.has(p.chapterKey)) {
      withOpener.add(p.chapterKey);
      set(photo.id, { ...p, kind: "opener" });
    }
  }
  return out ?? places;
}

/** Фото главы в строке «Главы книги»: оформление без него, выбрано (или подставлено прежними правилами), «без фото», не выбрано. */
export type ChapterPhotoStatus = { kind: "noDesign" } | { kind: "chosen"; photoId: string; auto: boolean } | { kind: "none" } | { kind: "needed" };

export function chapterPhotoStatus(chapterKey: string, places: ReadonlyMap<string, PhotoPlace>, tocLines: TocLines, openerDesign: boolean): ChapterPhotoStatus {
  if (!openerDesign) return { kind: "noDesign" };
  const opener = openerOf(places, chapterKey);
  if (opener) return { kind: "chosen", photoId: opener.id, auto: opener.auto };
  return noOpenerPhotoOf(tocLines, chapterKey) ? { kind: "none" } : { kind: "needed" };
}

/** Сколько фото печатается в главе: фото главы и фото после неё. */
export function chapterPhotoCount(chapterKey: string, places: ReadonlyMap<string, PhotoPlace>): number {
  let n = 0;
  for (const p of places.values()) if ((p.kind === "opener" || p.kind === "after") && p.chapterKey === chapterKey) n++;
  return n;
}

/**
 * Подсказка под выбором оформления: «глава начинается с фото» — сколько глав с выбранным фото и какую открыть первой
 * (без фото и без решения «без фото»); «уходите из оформления с фото» — когда фото глав уже выбраны (R5: отметки
 * остаются). null — сказать нечего.
 */
export type DesignNotice = { kind: "toPhoto"; shape: OpenerShape; chosen: number; total: number; next: string | null } | { kind: "leaving" } | null;

export function designNotice(opts: { design: Pick<InteriorDesign, "opener">; from: Pick<InteriorDesign, "opener">; changed: boolean; data: Pick<PlaceData, "chapters" | "photos">; places: ReadonlyMap<string, PhotoPlace>; tocLines: TocLines }): DesignNotice {
  const { design, from, changed, data, places, tocLines } = opts;
  const shape = openerShapeOf(design);
  if (!shape) return changed && openerShapeOf(from) && markedOpeners(data.photos, places) > 0 ? { kind: "leaving" } : null;
  const printed = photoChapters(data.chapters.filter((c) => c.printed));
  const chosen = printed.filter((c) => openerOf(places, c.key));
  // Глав с текстом пока нет — считать нечего.
  if (!printed.length || (!changed && chosen.length === printed.length)) return null;
  const free = printed.filter((c) => !openerOf(places, c.key));
  const next = free.find((c) => !noOpenerPhotoOf(tocLines, c.key)) ?? free[0];
  return { kind: "toPhoto", shape, chosen: chosen.length, total: printed.length, next: next?.key ?? null };
}

/** Фото, которые автор отметил фото главы и которые печатаются в главе (в начале или — в оформлении без фото — после неё). */
export function markedOpeners(photos: readonly Pick<SheetPhoto, "id" | "opener">[], places: ReadonlyMap<string, PhotoPlace>): number {
  return photos.filter((p) => {
    const place = places.get(p.id);
    return p.opener && !!place && !place.auto && (place.kind === "opener" || place.kind === "after");
  }).length;
}

/** Сколько фото в альбоме в конце — строка альбома в «Главах книги» видна, только когда в нём есть фото. */
export const albumCount = (data: Pick<PlaceData, "photos">, places: ReadonlyMap<string, PhotoPlace>) => albumPhotos(data.photos, places).length;
