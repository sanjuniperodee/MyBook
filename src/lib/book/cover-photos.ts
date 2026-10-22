/**
 * Снимки, которые обложка печатает на самом деле: лицевая сторона — места шаблона (covers: coverPhotoIds), оборот —
 * фото варианта, который получится при этих снимках и тексте (cover-back: resolveBackLayout — как designBack и PDF).
 * Выбранные, но не видные снимки — остались после смены шаблона на шаблон с меньшим числом мест или варианта оборота
 * на вариант без фото — обложкой не считаются: правила раскладки фото 2 ставят их внутрь, как остальные фото
 * (layout.ts, CoverPhotos). Модуль тянет каталог обложек — он для сервера; браузер получает готовый CoverPhotos.
 */
import type { Book } from "@/shared/infrastructure/db/schema";
import { coverPhotoIds } from "./covers";
import { BACK_PHOTO_SLOTS, BACK_TEXT_MAX, backPhotoIds, DEFAULT_BACK_LAYOUT, isBackLayout, resolveBackLayout } from "./cover-back";
import type { BookLike, CoverPhotos } from "./layout";

/** Настройки обложки и оборота, от которых зависит, какие снимки на них видны. */
export type CoverSettings = Pick<Book, "coverTemplate" | "coverPhotoId" | "coverPhotoExtra" | "backPhotoId" | "backPhotoExtra" | "backLayout" | "backText">;

/** Видные на обложке и обороте снимки; photoIds — фото книги (удалённый снимок места не занимает — как в PDF). */
export function shownCoverPhotos(book: CoverSettings, photoIds: Iterable<string>): CoverPhotos {
  const exists = new Set(photoIds);
  const front = coverPhotoIds(book).filter((id): id is string => !!id && exists.has(id));
  const back = backPhotoIds(book).filter((id) => exists.has(id));
  const layout = resolveBackLayout(isBackLayout(book.backLayout) ? book.backLayout : DEFAULT_BACK_LAYOUT, book.backText.trim().slice(0, BACK_TEXT_MAX), back.length);
  return { front, back: back.slice(0, BACK_PHOTO_SLOTS[layout] ?? 0) };
}

/**
 * Книга для сборки с видными снимками обложки (coverPhotos) — если известны шаблон и оборот (полная строка книги);
 * иначе — как есть, и сборка считает обложкой все выбранные для неё снимки.
 */
export function withCoverPhotos<B extends BookLike & Partial<CoverSettings>>(book: B, photoIds: Iterable<string>): B {
  const { coverTemplate, backLayout, backText } = book;
  if (book.coverPhotos || coverTemplate === undefined || backLayout === undefined || backText === undefined) return book;
  const settings: CoverSettings = { coverTemplate, backLayout, backText, coverPhotoId: book.coverPhotoId, coverPhotoExtra: book.coverPhotoExtra ?? [], backPhotoId: book.backPhotoId ?? null, backPhotoExtra: book.backPhotoExtra ?? [] };
  return { ...book, coverPhotos: shownCoverPhotos(settings, photoIds) };
}
