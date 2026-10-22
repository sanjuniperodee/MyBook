/**
 * Подпись вёрстки книги: то, что печатается, без пометок мест фото. Две сборки с равной подписью дают одни и те же
 * полосы — по ней перевод книги на правила раскладки 2 проверяет, что напечатанное не изменится (у фото меняются
 * только photos.chapter и opener — выбор места, а не сама страница).
 */
import { estimatePages } from "./estimate";
import type { BookContent, ContentChapter, ContentItem, PhotoItem } from "./layout";

/** Фото без пометок места: глава и «фото начала главы» в печать не идут. */
function bare(p: PhotoItem): PhotoItem {
  const { chapter: _c, opener: _o, ...rest } = p;
  void _c;
  void _o;
  return rest;
}

const bareItem = (it: ContentItem): ContentItem => ({ ...it, ...(it.photos ? { photos: it.photos.map(bare) } : {}), ...(it.photoBefore ? { photoBefore: bare(it.photoBefore) } : {}) });

const bareChapter = (ch: ContentChapter): ContentChapter => ({ ...ch, items: ch.items.map(bareItem), photos: ch.photos.map(bare), ...(ch.openerPhoto ? { openerPhoto: bare(ch.openerPhoto) } : {}) });

/** Подпись: содержимое книги в JSON без PhotoItem.chapter и opener и оценка числа полос. */
export function layoutSignature(content: BookContent): string {
  const printed: BookContent = { ...content, chapters: content.chapters.map(bareChapter), galleryPhotos: content.galleryPhotos.map(bare) };
  return `${estimatePages(content)}|${JSON.stringify(printed)}`;
}

export const sameLayout = (a: BookContent, b: BookContent) => layoutSignature(a) === layoutSignature(b);
