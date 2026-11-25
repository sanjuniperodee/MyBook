import "server-only";
import { messagesFor } from "@/i18n/messages";
import { getInteriorDesign } from "@/lib/book/interiors";
import {
  PAGES_IMAGE_WIDTHS,
  PAGES_SPREADS,
  pagesSample,
  pagesVersion,
  renderPagesSpreadsOnce,
  type PagesImageWidth,
  type PagesSample,
  type PagesSpread,
} from "@/modules/production";

export {
  PAGES_IMAGE_WIDTHS,
  PAGES_SPREADS,
  type PagesImageWidth,
  type PagesSpread,
};
import { container } from "@/server/container";
import { getFile, putFile } from "@/shared/infrastructure/storage";

/**
 * Развороты «Страниц» для приложения (modules/production/pagesPreview.ts): выборка книги в её оформлении или — для
 * миниатюры и крупного просмотра стиля — в другом оформлении без настроек дизайнера (как миниатюры StylesTab сайта).
 * Картинки лежат в хранилище по версии: одна вёрстка на правку, дальше — из хранилища.
 */

/** Выборка книги для разворотов; design — другое оформление (просмотр стиля), в книгу не пишется. */
export async function pagesSampleOf(
  bookId: string,
  design?: string,
): Promise<PagesSample | null> {
  const bundle = await container().authoring.queries.bundle(bookId);
  if (!bundle) return null;
  const b = design
    ? {
        ...bundle,
        book: {
          ...bundle.book,
          interior: getInteriorDesign(design).id,
          interiorStyle: {},
        },
      }
    : bundle;
  return pagesSample(
    b,
    messagesFor(b.book.language).books.pages.dedicationEmpty,
  );
}

/** Какие развороты есть у выборки: «Фото» — только у книги с фото, которые печатаются. */
export function pagesSpreadsOf(s: PagesSample): PagesSpread[] {
  return PAGES_SPREADS.filter(
    (k) =>
      k !== "photos" ||
      (s.bundle.photos.length > 0 && s.bundle.book.photoPlacement !== "none"),
  );
}

const keyOf = (
  bookId: string,
  version: string,
  kind: PagesSpread,
  width: PagesImageWidth,
) => `pages-images/${bookId}/${version}-${kind}-${width}.webp`;

/** Картинка разворота kind шириной width; null — такого разворота у книги нет. */
export async function pagesSpreadImage(
  bookId: string,
  kind: PagesSpread,
  width: PagesImageWidth,
  design?: string,
): Promise<{ image: Buffer; version: string } | null> {
  const s = await pagesSampleOf(bookId, design);
  if (!s) return null;
  const version = pagesVersion(s);
  try {
    return {
      image: await getFile(keyOf(bookId, version, kind, width)),
      version,
    };
  } catch {}
  const all = await renderPagesSpreadsOnce(
    `${bookId}:${version}:${width}`,
    s,
    width,
  );
  await Promise.all(
    Object.entries(all).map(([k, img]) =>
      putFile(keyOf(bookId, version, k as PagesSpread, width), img!).catch(
        () => undefined,
      ),
    ),
  );
  const image = all[kind];
  return image ? { image, version } : null;
}
