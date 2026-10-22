/**
 * Подсказка фото начала главы: какие снимки подходят этой главе. Сама подсказка ничего не меняет — фото главы
 * ставит только автор, нажав на неё (правила раскладки 2). Модуль общий для сервера и браузера.
 */
import { effectiveDpi, type BookContent, type CoverRefs } from "./layout";
import { photoPlaceOf, type PhotoPlace } from "./photo-place";
import type { PlaceFrame } from "./photo-pages";

/** Сколько лучших кандидатов редактор отмечает «подходит по форме». */
export const SUGGEST_TOP = 3;
/** Разрешение, с которого снимок в кадре главы печатается чётко. */
export const SUGGEST_MIN_DPI = 150;

export interface OpenerCandidate {
  id: string;
  /**
   * Откуда фото: 0 — уже после этой главы, 1 — место не выбрано (стоит по правилу книги), 2 — место выбрано в другом
   * месте (после другой главы, в альбоме, не печатается), 3 — в ответе, 4 — только на обложке.
   */
  tier: 0 | 1 | 2 | 3 | 4;
  /** Насколько пропорции снимка не совпадают с кадром: |ln(снимок / кадр)|, 0 — совпадают. */
  misfit: number;
  /** Чёткость в кадре не ниже SUGGEST_MIN_DPI. */
  sharp: boolean;
  position: number;
}

type SuggestPhoto = { id: string; width: number; height: number; chapter?: string | null; questionId?: string | null; position?: number };

function tierOf(place: PhotoPlace, chapterKey: string): OpenerCandidate["tier"] | null {
  // Фото начала любой главы не предлагаем: у этой оно уже стоит, у другой его пришлось бы забрать.
  if (place.kind === "opener") return null;
  if (place.kind === "after" && place.chapterKey === chapterKey) return 0;
  if (place.kind === "answer") return 3;
  if (place.kind === "off" && place.auto && place.onCover) return 4;
  return place.auto ? 1 : 2;
}

/**
 * Кандидаты в фото начала главы chapterKey по порядку: откуда фото, потом пропорции к кадру (frame — openerFrame
 * текущего оформления), потом чёткость в кадре, потом порядок фото в книге. Лучшие SUGGEST_TOP — подсказка.
 */
export function suggestOpener(content: Pick<BookContent, "chapters" | "galleryPhotos">, photos: readonly SuggestPhoto[], frame: PlaceFrame, chapterKey: string, book: CoverRefs): OpenerCandidate[] {
  const places = photoPlaceOf(content, photos, book);
  const out: OpenerCandidate[] = [];
  photos.forEach((p, i) => {
    const place = places.get(p.id);
    const tier = place ? tierOf(place, chapterKey) : null;
    if (tier === null) return;
    // Пропорции — с точностью до тысячных: снимки с одного телефона равны, и решает чёткость.
    const misfit = Math.round(Math.abs(Math.log(p.width / Math.max(1, p.height) / frame.ratio)) * 1000) / 1000;
    const sharp = effectiveDpi(p, { w: frame.w, h: frame.h }, "cover") >= SUGGEST_MIN_DPI;
    out.push({ id: p.id, tier, misfit, sharp, position: p.position ?? i });
  });
  return out.sort((a, b) => a.tier - b.tier || a.misfit - b.misfit || Number(b.sharp) - Number(a.sharp) || a.position - b.position);
}
