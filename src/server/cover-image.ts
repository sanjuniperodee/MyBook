import "server-only";
import { createHash } from "node:crypto";
import sharp from "sharp";
import { container } from "@/server/container";
import { coverPhotoDataUrl, renderCoverBackPreview, renderCoverPreview } from "@/modules/production";
import { coverPhotoSlots, getCoverTemplate, isKnownCover, renderCoverSvg } from "@/lib/book/covers";
import { coverFrontGeometry, getFormat } from "@/lib/book/formats";
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
  side?: "front" | "back";
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
export const coverVersion = (b: CoverBook, o: CoverImageOptions) => (o.side === "back" ? `back-${coverBackVersion(b)}` : o.template ? `t-${o.template}-${coverImageVersion({ ...b, coverTemplate: o.template, coverDesign: null })}` : coverImageVersion(b));

/**
 * Лицевая крышка картинкой (WebP) — для приложения: та же обложка, что в печати (renderCoverPreview, PDF → растр).
 * Готовая картинка лежит в хранилище по версии обложки: рисуется один раз после правки, дальше — из хранилища.
 */
export async function coverImage(b: CoverBook, width: CoverImageWidth, o: CoverImageOptions = {}): Promise<Buffer | null> {
  const key = `cover-images/${b.id}/${coverVersion(b, o)}-${width}.webp`;
  try {
    return await getFile(key);
  } catch {}
  const bundle = await container().authoring.queries.bundle(b.id);
  if (!bundle) return null;
  // Предпросмотр шаблона: та же книга с другим шаблоном и без обложки из слоёв — в книгу не пишется.
  const drawn = o.template ? { ...bundle, book: { ...bundle.book, coverTemplate: o.template, coverDesign: null } } : bundle;
  const picture = o.side === "back" ? await renderCoverBackPreview(drawn, width) : await renderCoverPreview(drawn, width);
  if (!picture) return null;
  // WebP вместо PNG: обложка с фото в 5–7 раз легче (телефон, мобильный интернет).
  const webp = await sharp(Buffer.from(picture.data, "base64")).webp({ quality: 86 }).toBuffer();
  await putFile(key, webp).catch(() => undefined);
  return webp;
}

/** Адрес картинки обложки для ответов API: версия в адресе — кэш не устаревает. */
export const coverImagePath = (b: CoverBook, width: CoverImageWidth) => `/api/books/${b.id}/cover-image?w=${width}&v=${coverImageVersion(b)}`;

/**
 * Миниатюра шаблона для выбора обложки в приложении — с фото этой книги на местах шаблона (как миниатюры на странице
 * обложки сайта): сначала выбранные для обложки, потом остальные фото книги по порядку; фото нет — снимки-примеры.
 * Рисунок — тот же renderCoverSvg, что у сайта и печати; готовая картинка лежит в хранилище по набору фото.
 */
export async function coverTemplateThumb(
  b: { id: string; format: string; coverLines?: boolean | null; coverPhotoId: string | null; coverPhotoExtra?: string[] | null },
  templateId: string,
): Promise<Buffer | null> {
  if (!isKnownCover(templateId)) return null;
  const template = getCoverTemplate(templateId, b.coverLines ?? true);
  const slots = coverPhotoSlots(template);
  if (!slots) return null;
  const photos = await container().authoring.queries.photos(b.id);
  const chosen = [b.coverPhotoId, ...(b.coverPhotoExtra ?? [])].filter((id): id is string => !!id && photos.some((p) => p.id === id));
  const ids = [...chosen, ...photos.map((p) => p.id).filter((id) => !chosen.includes(id))].slice(0, slots);
  const version = createHash("sha1")
    .update(JSON.stringify([templateId, template.rev ?? 0, b.format, b.coverLines ?? true, ids, process.env.COVER_ART_VERSION ?? ""]))
    .digest("hex")
    .slice(0, 12);
  const key = `cover-images/${b.id}/thumb-${templateId}-${version}.webp`;
  try {
    return await getFile(key);
  } catch {}
  const refs = await Promise.all(
    ids.map(async (id) => {
      const p = photos.find((x) => x.id === id)!;
      const buf = await getFile(p.thumbKey).catch(() => null);
      return buf ? { href: `data:image/jpeg;base64,${(await sharp(buf).jpeg({ quality: 85 }).toBuffer()).toString("base64")}`, width: p.width, height: p.height } : undefined;
    }),
  );
  const samples = new Map(await Promise.all((template.samples ?? []).map(async (k) => [k, await coverPhotoDataUrl(k, 700)] as const)));
  const imageHref = template.photo ? await coverPhotoDataUrl(template.photo.photo.key, 900) : undefined;
  const g = coverFrontGeometry(getFormat(b.format));
  const svg = renderCoverSvg(template, g, { uid: `t${templateId}`, photos: refs, imageHref, sampleHref: (k) => samples.get(k) ?? "" });
  const px = 420;
  const webp = await sharp(Buffer.from(svg), { density: (72 * px) / g.front.w, limitInputPixels: false })
    .resize(px, Math.round((px * g.front.h) / g.front.w), { fit: "fill" })
    .flatten({ background: "#ffffff" })
    .webp({ quality: 76, effort: 5 })
    .toBuffer();
  await putFile(key, webp).catch(() => undefined);
  return webp;
}

/** Адрес картинки оборота (ширину ?w= подставляет клиент): версия оборота в адресе. */
export const coverBackImagePath = (b: CoverBook) => `/api/books/${b.id}/cover-image?side=back&v=${coverBackVersion(b)}`;
