import { fixtureBooks, fixtureSample, fixtureVariants, type FixtureBook } from "../../tests/fixtures/books";
import { photoKey, photoNames, variantPhotoNames, type PhotoName } from "../../tests/fixtures/photos";

/**
 * Книги снимков pdf-snapshot и html-snapshot. Полный прогон — весь набор (оформление × формат × язык) и варианты;
 * --quick — каждое оформление один раз, формат и язык по кругу (fixtureSample, как pdf-critical.test), и варианты:
 * быстрый прогон покрывает все оформления, оба формата и языка, оба размещения фото и крайние случаи.
 */
export const snapshotBooks = (quick: boolean): FixtureBook[] => [...(quick ? fixtureSample() : fixtureBooks()), ...fixtureVariants()];

/** Снимки, нужные книгам: набор матрицы и снимки вариантов, только если книги на них ссылаются (big рисуется около секунды). */
export function photoNamesFor(books: FixtureBook[]): PhotoName[] {
  const keys = new Set(books.flatMap((b) => b.bundle.photos.map((p) => p.storageKey)));
  return [...photoNames, ...variantPhotoNames.filter((name) => keys.has(photoKey(name)))];
}
