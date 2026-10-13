import type { Locale } from "@/i18n/config";
import type { FormatId } from "@/lib/book/formats";
import type { InteriorId } from "@/lib/book/interiors";
import { buildBookContent, toPhotoItem } from "@/lib/book/layout";
import { fixtureBook, fixtureBooks, type FixtureBook } from "../fixtures/books";

/**
 * Книги для характеристических снимков вёрстки: все оформления × A5 × ru и несколько квадратных и казахских —
 * квадрат с фото по главам и в конце книги, фото на начальной полосе главы при обеих раскладках фото.
 */
const EXTRA: [InteriorId, FormatId, Locale][] = [
  ["classic", "a5", "kk"],
  ["classic", "square", "ru"],
  ["classic", "square", "kk"],
  ["photobook", "square", "ru"],
  ["luna", "square", "kk"],
];

/** Год в книгах снимков: buildBookContent по умолчанию берёт текущий. */
export const YEAR = 2026;

export function characterizationBooks(): FixtureBook[] {
  return [...fixtureBooks({ formats: ["a5"], languages: ["ru"] }), ...EXTRA.map(([d, f, l]) => fixtureBook(d, f, l))];
}

export const contentOf = ({ bundle }: FixtureBook) => buildBookContent(bundle.book, bundle.questions, bundle.photos.map(toPhotoItem), YEAR, bundle.letters);

/** Короткие имена вместо UUID: вопрос — q<позиция>, письмо — letter<номер>, фото — имя снимка набора (p3, cover). */
export function fixtureNames({ bundle }: FixtureBook): Map<string, string> {
  return new Map([
    ...bundle.questions.map((q) => [q.id, `q${q.position}`] as const),
    ...(bundle.letters ?? []).map((l, i) => [l.id, `letter${i}`] as const),
    ...bundle.photos.map((p) => [p.id, p.storageKey.replace(/^.*\/|\.jpg$/g, "")] as const),
  ]);
}
