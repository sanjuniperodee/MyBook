import { describe, expect, it } from "vitest";
import { buildBookContent } from "@/lib/book/book-content";
import { toPhotoItem, type BookContent } from "@/lib/book/layout";
import { fixtureBook } from "./fixtures/books";

// Фото «на всю страницу» в истории печатается один раз — в истории. Раньше оно не считалось «уже в ответе»
// (из photos его забирает photoBefore продолжения) и при фото «по главам» или «в конце» печаталось ещё и на
// фотостранице главы (или в альбоме), а в оформлениях с фото главы могло стать снимком её начальной полосы.

const placements = ["chapters", "end", "none"] as const;

function bookWithPagePhotos(design: "classic" | "cinema", photoPlacement: (typeof placements)[number]) {
  const fb = fixtureBook(design, "a5", "ru");
  const inline = fb.bundle.photos.filter((p) => p.questionId && p.inline && p.id !== fb.bundle.book.coverPhotoId);
  // Два фото из историй — на всю страницу: одно посреди истории, одно в конце.
  const pageIds = new Set(inline.slice(0, 2).map((p) => p.id));
  const photos = fb.bundle.photos.map((p, i) => (pageIds.has(p.id) ? { ...p, inline: { ...p.inline!, page: true, anchor: i % 2 ? null : p.inline!.anchor } } : p));
  const book = { ...fb.bundle.book, photoPlacement };
  const content = buildBookContent(book, fb.bundle.questions, photos.map(toPhotoItem), fb.bundle.chapters, 2026, fb.bundle.letters);
  return { content, pageIds, photos };
}

/** Все места, где фото печатается внутри книги. */
function printed(c: BookContent) {
  return [
    ...c.chapters.flatMap((ch) => [...(ch.openerPhoto ? [ch.openerPhoto] : []), ...ch.photos, ...ch.items.flatMap((it) => [...(it.photos ?? []), ...(it.photoBefore ? [it.photoBefore] : [])])]),
    ...c.galleryPhotos,
  ].map((p) => p.id);
}

describe("фото на всю страницу из истории — один раз, в истории", () => {
  for (const design of ["classic", "cinema"] as const)
    for (const placement of placements)
      it(`${design}, фото вне историй: ${placement}`, () => {
        const { content, pageIds } = bookWithPagePhotos(design, placement);
        const ids = printed(content);
        expect(pageIds.size).toBe(2);
        for (const id of pageIds) {
          expect(ids.filter((x) => x === id)).toHaveLength(1);
          // То самое одно место — страница фото в истории.
          expect(content.chapters.some((ch) => ch.items.some((it) => it.photoBefore?.id === id))).toBe(true);
        }
        // И вообще ни одно фото не печатается дважды.
        expect(ids.length).toBe(new Set(ids).size);
      });
});
