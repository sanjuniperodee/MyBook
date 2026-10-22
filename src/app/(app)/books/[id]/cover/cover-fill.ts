/**
 * Какие фото книги подставлять в пустые места обложки и оборота — без React, его проверяют тесты. Место фото — только
 * из photoPlaceOf (R6): ключи глав здесь не сравниваются.
 */
import type { PhotoPlace } from "@/lib/book/photo-place";

/**
 * Фото для пустых мест по порядку: сначала без выбранного автором места (вставшие сами и «не печатается»), потом
 * остальные (после главы, в альбоме). Фото главы и фото в ответе — никогда: снимок повторился бы на обложке.
 * Фото, которого нет в местах (только что загружено), — как без места.
 */
export function coverFillOrder(photos: readonly { id: string }[], places: ReadonlyMap<string, PhotoPlace>): string[] {
  const free: string[] = [];
  const rest: string[] = [];
  for (const p of photos) {
    const place = places.get(p.id);
    if (!place) free.push(p.id);
    else if (place.kind === "answer" || place.kind === "opener") continue;
    else if ((place.auto && !place.waitingFor) || place.kind === "off") free.push(p.id);
    else rest.push(p.id);
  }
  return [...free, ...rest];
}

/** Место фото со снимками обложки, выбранными сейчас (до сохранения и пересборки книги): значок «на обложке» / «на обороте». */
export function withCoverNow(place: PhotoPlace | undefined, id: string, front: readonly (string | null)[], back: readonly string[]): PhotoPlace | undefined {
  if (!place) return place;
  const onCover = front.includes(id) ? "cover" : back.includes(id) ? "back" : null;
  return onCover === place.onCover ? place : { ...place, onCover };
}
