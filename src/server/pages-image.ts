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
import { createHash } from "node:crypto";
import { getFile, putFile } from "@/shared/infrastructure/storage";

/**
 * Развороты «Страниц» для приложения (modules/production/pagesPreview.ts): выборка книги в её оформлении или — для
 * миниатюры и крупного просмотра стиля — в другом оформлении без настроек дизайнера (как миниатюры StylesTab сайта).
 * Картинки лежат в хранилище по версии: одна вёрстка на правку, дальше — из хранилища.
 */

/** Оформление, которое ещё не в книге (вариант ИИ-дизайнера): стиль и настройки — по ключу в хранилище. */
export interface PagesOverride {
  interior: string;
  style: Record<string, unknown>;
}

const previewKey = (bookId: string, id: string) =>
  `pages-preview/${bookId}/${id}.json`;

/** Запомнить оформление для картинки разворота (варианты ИИ-дизайнера); ключ — его отпечаток. */
export async function storePagesPreview(
  bookId: string,
  o: PagesOverride,
): Promise<string> {
  const json = JSON.stringify(o);
  const id = createHash("sha1").update(json).digest("hex").slice(0, 16);
  await putFile(previewKey(bookId, id), Buffer.from(json));
  return id;
}

/**
 * Выборка книги для разворотов; design — другое оформление без настроек (просмотр стиля), preview — запомненное
 * оформление (вариант ИИ-дизайнера). В книгу не пишется.
 */
export async function pagesSampleOf(
  bookId: string,
  design?: string,
  preview?: string,
): Promise<PagesSample | null> {
  const bundle = await container().authoring.queries.bundle(bookId);
  if (!bundle) return null;
  let book = bundle.book;
  if (design)
    book = {
      ...book,
      interior: getInteriorDesign(design).id,
      interiorStyle: {},
    };
  if (preview) {
    const o = JSON.parse(
      (await getFile(previewKey(bookId, preview))).toString("utf8"),
    ) as PagesOverride;
    book = {
      ...book,
      interior: getInteriorDesign(o.interior).id,
      interiorStyle: o.style,
    };
  }
  return pagesSample(
    { ...bundle, book },
    messagesFor(book.language).books.pages.dedicationEmpty,
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
  preview?: string,
): Promise<{ image: Buffer; version: string } | null> {
  const s = await pagesSampleOf(bookId, design, preview).catch(() => null);
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
