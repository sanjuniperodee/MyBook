import { isValidElement, type ReactElement, type ReactNode } from "react";
import { describe, expect, it } from "vitest";
import { buildBookContent } from "@/lib/book/book-content";
import { previewFromContent, type EditorQuestion } from "@/lib/book/editor-model";
import { toPhotoItem, type BookContent } from "@/lib/book/layout";
import { bookToc, GALLERY_KEY, printedGalleryTitle, tocKey } from "@/lib/book/toc";
import { InteriorDocument } from "@/modules/production/infrastructure/pdf/interior";
import { fixtureBook } from "./fixtures/books";

/**
 * Своё название альбома в конце (строка альбома в оглавлении) — одно во всей книге: начальная полоса альбома в PDF,
 * строка оглавления и превью редактора. Раньше PDF печатал на полосе альбома название по умолчанию.
 */
const { bundle } = fixtureBook("classic", "a5", "ru");
// Все фото — альбомом в конце: у книги точно есть альбом.
const content = (tocLines: Record<string, { title?: string; hidden?: boolean }> = {}) =>
  buildBookContent({ ...bundle.book, photoPlacement: "end", tocLines }, bundle.questions, bundle.photos.map((p) => toPhotoItem({ ...p, questionId: null })), [], 2026, bundle.letters);

/** Название на начальной полосе альбома в блоке книги (PDF): элемент с ключом open-__gallery. */
function pdfGalleryTitle(c: BookContent): string | undefined {
  const doc = InteriorDocument({ content: c, options: { bleedMm: 0, images: new Map() } }) as ReactElement<{ children: ReactNode[] }>;
  const opener = doc.props.children.find((el) => isValidElement(el) && el.key === `open-${GALLERY_KEY}`) as ReactElement<{ title: string }> | undefined;
  return opener?.props.title;
}

const previewTitle = (c: BookContent) => previewFromContent(c, [] as EditorQuestion[], [], { currentId: null }).gallery?.title;

describe("название альбома в конце", () => {
  it("по умолчанию — название книги для альбома везде", () => {
    const c = content();
    expect(c.galleryPhotos.length).toBeGreaterThan(0);
    expect(printedGalleryTitle(c)).toBe(c.galleryTitle);
    expect(pdfGalleryTitle(c)).toBe(c.galleryTitle);
    expect(previewTitle(c)).toBe(c.galleryTitle);
  });

  it("своё название — на полосе альбома в PDF, в оглавлении и в превью редактора, без эмодзи", () => {
    const c = content({ [tocKey.chapter(GALLERY_KEY)]: { title: "  Наше лето 🌸 " } });
    expect(printedGalleryTitle(c)).toBe("Наше лето");
    expect(pdfGalleryTitle(c)).toBe("Наше лето");
    expect(bookToc(c).find((l) => l.pageKey === GALLERY_KEY)?.label).toBe("Наше лето");
    expect(previewTitle(c)).toBe("Наше лето");
  });

  it("скрытая строка альбома убирает его только из оглавления: название на полосе — своё", () => {
    const c = content({ [tocKey.chapter(GALLERY_KEY)]: { title: "Наше лето", hidden: true } });
    expect(pdfGalleryTitle(c)).toBe("Наше лето");
    expect(bookToc(c).some((l) => l.pageKey === GALLERY_KEY)).toBe(false);
  });
});
