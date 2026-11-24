import "server-only";
import { createHash } from "node:crypto";
import sharp from "sharp";
import { container } from "@/server/container";
import { renderCoverPreview } from "@/modules/production";
import { getFile, putFile } from "@/shared/infrastructure/storage";

/** Ширины картинки обложки: миниатюра полки и крупная обложка (экраны @3x). */
export const COVER_IMAGE_WIDTHS = [240, 480, 900] as const;
export type CoverImageWidth = (typeof COVER_IMAGE_WIDTHS)[number];

type CoverBook = {
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
};

/** Версия картинки: меняется вместе со всем, что видно на лицевой крышке (шаблон, надписи, фото, формат). */
export function coverImageVersion(b: CoverBook): string {
  const visible = [b.coverTemplate, b.coverDesign, b.coverLines ?? null, b.coverPhotoId, b.coverPhotoExtra ?? null, b.title, b.subtitle, b.format, b.theme, b.authorName, b.recipientName, b.hideRecipientOnCover, b.namesOnCover ?? null, process.env.COVER_ART_VERSION ?? ""];
  return createHash("sha1").update(JSON.stringify(visible)).digest("hex").slice(0, 12);
}

/**
 * Лицевая крышка картинкой (WebP) — для приложения: та же обложка, что в печати (renderCoverPreview, PDF → растр).
 * Готовая картинка лежит в хранилище по версии обложки: рисуется один раз после правки, дальше — из хранилища.
 */
export async function coverImage(b: CoverBook, width: CoverImageWidth): Promise<Buffer | null> {
  const key = `cover-images/${b.id}/${coverImageVersion(b)}-${width}.webp`;
  try {
    return await getFile(key);
  } catch {}
  const bundle = await container().authoring.queries.bundle(b.id);
  if (!bundle) return null;
  const picture = await renderCoverPreview(bundle, width);
  if (!picture) return null;
  // WebP вместо PNG: обложка с фото в 5–7 раз легче (телефон, мобильный интернет).
  const webp = await sharp(Buffer.from(picture.data, "base64")).webp({ quality: 86 }).toBuffer();
  await putFile(key, webp).catch(() => undefined);
  return webp;
}

/** Адрес картинки обложки для ответов API: версия в адресе — кэш не устаревает. */
export const coverImagePath = (b: CoverBook, width: CoverImageWidth) => `/api/books/${b.id}/cover-image?w=${width}&v=${coverImageVersion(b)}`;
