import { createHash } from "node:crypto";

/**
 * Версия и адрес картинки обложки — чистые функции без рисования: адрес с версией отдают ответы API (оба HTTP-процесса,
 * ADR 0014), версия — ключ хранилища и ETag картинки (src/server/cover-image.ts).
 */

/** Ширины картинки обложки: миниатюра полки и крупная обложка (экраны @3x). */
export const COVER_IMAGE_WIDTHS = [240, 480, 900] as const;
export type CoverImageWidth = (typeof COVER_IMAGE_WIDTHS)[number];

export type CoverBook = {
  id: string;
  coverTemplate: string;
  coverDesign: unknown;
  coverLines?: boolean | null;
  coverPhotoId: string | null;
  coverPhotoExtra?: string[] | null;
  title: string;
  subtitle: string;
  format: string;
  theme: string;
  authorName: string;
  recipientName: string;
  hideRecipientOnCover: boolean;
  namesOnCover?: string | null;
  // Оборот (side: "back"): вариант, текст, фото, своё оформление, год праздника.
  backText?: string;
  backLayout?: string;
  backPhotoId?: string | null;
  backPhotoExtra?: string[] | null;
  coverBack?: unknown;
  occasionDate?: string | null;
};

/** Что рисовать: лицо книги как есть, лицо с другим шаблоном (предпросмотр выбора, в книгу не пишется) или оборот. */
export interface CoverImageOptions {
  template?: string;
  /** spread — вся развёртка с корешком под pages страниц (3D-книга); ширина картинки — ширина лица в ней. */
  side?: "front" | "back" | "spread";
  pages?: number;
}

/** Версия картинки: меняется вместе со всем, что видно на лицевой крышке (шаблон, надписи, фото, формат). */
export function coverImageVersion(b: CoverBook): string {
  const visible = [b.coverTemplate, b.coverDesign, b.coverLines ?? null, b.coverPhotoId, b.coverPhotoExtra ?? null, b.title, b.subtitle, b.format, b.theme, b.authorName, b.recipientName, b.hideRecipientOnCover, b.namesOnCover ?? null, process.env.COVER_ART_VERSION ?? ""];
  return createHash("sha1").update(JSON.stringify(visible)).digest("hex").slice(0, 12);
}

/** Версия оборота: вариант, текст, фото и оформление оборота, подпись и имена, а также фон лица (по нему цвета надписей). */
export function coverBackVersion(b: CoverBook): string {
  const visible = [b.backLayout ?? null, b.backText ?? null, b.backPhotoId ?? null, b.backPhotoExtra ?? null, b.coverBack ?? null, b.occasionDate ?? null, coverImageVersion(b)];
  return createHash("sha1").update(JSON.stringify(visible)).digest("hex").slice(0, 12);
}

/** Версия картинки по тому, что рисуется: лицо, лицо с другим шаблоном или оборот (ключ хранилища и ETag). */
export const coverVersion = (b: CoverBook, o: CoverImageOptions) =>
  o.side === "spread" ? `spread-${o.pages ?? 0}-${coverBackVersion(b)}` : (o.side === "back" ? `back-${coverBackVersion(b)}` : o.template ? `t-${o.template}-${coverImageVersion({ ...b, coverTemplate: o.template, coverDesign: null })}` : coverImageVersion(b));

/** Адрес картинки обложки для ответов API: версия в адресе — кэш не устаревает. */
export const coverImagePath = (b: CoverBook, width: CoverImageWidth) => `/api/books/${b.id}/cover-image?w=${width}&v=${coverImageVersion(b)}`;

/** Адрес картинки оборота (ширину ?w= подставляет клиент): версия оборота в адресе. */
export const coverBackImagePath = (b: CoverBook) => `/api/books/${b.id}/cover-image?side=back&v=${coverBackVersion(b)}`;
