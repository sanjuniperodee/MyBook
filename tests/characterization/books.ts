import { toPhotoItem } from "@/lib/book/layout";
import { buildBookContent } from "@/lib/book/book-content";
import { fixtureBooks, fixtureVariants, type FixtureBook } from "../fixtures/books";

/** Книги для характеристических снимков вёрстки: вся матрица набора (92 книги) и варианты вне неё. */
export function characterizationBooks(): FixtureBook[] {
  return [...fixtureBooks(), ...fixtureVariants()];
}

/** Год в книгах снимков: buildBookContent по умолчанию берёт текущий. */
export const YEAR = 2026;

export const contentOf = ({ bundle }: FixtureBook) => buildBookContent(bundle.book, bundle.questions, bundle.photos.map(toPhotoItem), YEAR, bundle.letters);

/** Короткие имена вместо UUID: вопрос — q<позиция>, письмо — letter<номер>, фото — имя снимка набора (p3, cover). */
export function fixtureNames({ bundle }: FixtureBook): Map<string, string> {
  return new Map([
    ...bundle.questions.map((q) => [q.id, `q${q.position}`] as const),
    ...(bundle.letters ?? []).map((l, i) => [l.id, `letter${i}`] as const),
    ...bundle.photos.map((p) => [p.id, p.storageKey.replace(/^.*\/|\.jpg$/g, "")] as const),
  ]);
}

/**
 * Полос в PDF (renderInterior до добивки) — по книге на оформление (A5 ru) и квадрат ru и kk. Таблицу сверяет
 * render.test, остальные снимки сравнивают с ней оценки, не рендеря книги заново.
 */
export const pdfContentPages: Record<string, number> = {
  "classic-a5-ru": 28,
  "photobook-a5-ru": 25,
  "gallery-a5-ru": 25,
  "romance-a5-ru": 28,
  "cinema-a5-ru": 25,
  "stars-a5-ru": 28,
  "memories-a5-ru": 25,
  "arches-a5-ru": 25,
  "herbarium-a5-ru": 28,
  "oyu-a5-ru": 28,
  "luna-a5-ru": 25,
  "editorial-a5-ru": 28,
  "watercolor-a5-ru": 28,
  "shanyrak-a5-ru": 28,
  "mountains-a5-ru": 28,
  "deco-a5-ru": 28,
  "album-a5-ru": 28,
  "sea-a5-ru": 28,
  "airmail-a5-ru": 28,
  "vintage-a5-ru": 28,
  "confetti-a5-ru": 28,
  "modern-a5-ru": 28,
  "minimal-a5-ru": 28,
  "classic-square-ru": 30,
  "classic-square-kk": 31,
};
