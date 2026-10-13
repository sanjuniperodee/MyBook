import { buildBookContent, toPhotoItem } from "@/lib/book/layout";
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
