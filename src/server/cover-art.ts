import "server-only";
import { brotliCompressSync, constants, gzipSync } from "node:zlib";
import sharp from "sharp";
import { cropSvg, getCoverTemplate, isKnownCover, renderCoverSvg, type CoverTemplate } from "@/lib/book/covers";
import { coverFrontGeometry, coverSpreadGeometry, formats, getFormat, type BookFormat } from "@/lib/book/formats";
import { Lru } from "@/lib/lru";
import { coverPhotoDataUrl } from "@/modules/production";

/**
 * Фон обложки (без текста) отдельным файлом — общий генератор и LRU-кэш для сайта (`/api/covers/{file}`) и NestJS.
 * Рисованные обложки — SVG (со сжатыми копиями br/gzip), обложки на снимках и с фото клиента — JPEG/WebP через sharp.
 */
const FILE = /^([a-z0-9]+)-([a-z0-9]+)(-nl)?(-lite)?(-back|-backplain)?(?:-p(\d{1,4}))?\.(svg|jpg|webp)$/;
/** Толщина книги для фона задней крышки, когда страниц в адресе нет (-p<страниц>). */
const PREVIEW_PAGES = 120;
const MAX_PAGES = 2000;

export interface CoverArtEntry {
  type: string;
  raw: string | Buffer;
  br?: Buffer;
  gzip?: Buffer;
}

/**
 * Готовые фоны в памяти процесса (до 200 записей — рабочий набор: каталог миниатюр и крупные превью ходовых обложек).
 */
const cache = new Lru<string, CoverArtEntry>(200);

/** Ширина растра снимка-обложки: миниатюра в выборе и крупное превью. */
const PHOTO_PX = { lite: 420, full: 1000 };

async function photoArt(template: CoverTemplate, format: BookFormat, lite: boolean, back: boolean, plainBack: boolean, webp: boolean, pages: number): Promise<Buffer> {
  const px = lite ? PHOTO_PX.lite : PHOTO_PX.full;
  // Снимок встраиваем уменьшенным: на холсте развёртки он примерно вдвое шире лица.
  const imageHref = template.photo ? await coverPhotoDataUrl(template.photo.photo.key, lite ? 900 : 2400) : undefined;
  // Обложка с фото клиента — на снимках-примерах: место под фото меньше лица, хватает меньшего размера.
  const samples = new Map(await Promise.all((template.samples ?? []).map(async (k) => [k, await coverPhotoDataUrl(k, lite ? 700 : 1400)] as const)));
  const g = back ? coverSpreadGeometry(format, pages) : coverFrontGeometry(format);
  const side = back ? g.back! : g.front;
  let svg = renderCoverSvg(template, g, { uid: `${template.id}${format.id}`, imageHref, sampleHref: (k) => samples.get(k) ?? "" }, { plainBack });
  if (back) svg = cropSvg(svg, side, { w: g.width, h: g.height });
  // Единицы SVG — миллиметры; librsvg читает их как пиксели при 72 dpi.
  const raster = sharp(Buffer.from(svg), { density: (72 * px) / side.w, limitInputPixels: false })
    .resize(px, Math.round((px * side.h) / side.w), { fit: "fill" })
    .flatten({ background: "#ffffff" });
  return (webp ? raster.webp({ quality: lite ? 72 : 78, effort: 5 }) : raster.jpeg({ quality: lite ? 78 : 86, mozjpeg: true })).toBuffer();
}

/** Собрать (или взять из LRU-кэша) фон обложки по имени файла; null — неизвестный шаблон/формат/расширение. */
export async function getCoverArt(file: string): Promise<CoverArtEntry | null> {
  const m = FILE.exec(file);
  if (!m || !isKnownCover(m[1]) || !(m[2] in formats)) return null;
  // -nl — без декоративных линий (books.cover_lines).
  const template = getCoverTemplate(m[1], !m[3]);
  const [lite, side, pagesIn, ext] = [m[4], m[5], m[6], m[7]];
  const raster = !!(template.photo || template.samples);
  if ((ext !== "svg") !== raster) return null;
  // Страницы — только у оборота.
  if (pagesIn && !side) return null;
  const pages = pagesIn ? Number(pagesIn) : PREVIEW_PAGES;
  if (pages < 1 || pages > MAX_PAGES) return null;
  const key = `${file}@${template.rev ?? 0}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const format = getFormat(m[2]);
  // -backplain — оборот без повтора композиции лица: под карточками «Полароидов».
  const plainBack = side === "-backplain";
  let entry: CoverArtEntry;
  if (raster) {
    const webp = ext === "webp";
    entry = { type: webp ? "image/webp" : "image/jpeg", raw: await photoArt(template, format, !!lite, !!side, plainBack, webp, pages) };
  } else {
    let raw: string;
    if (side) {
      // Задняя крышка — кусок развёртки: так её узор и повтор композиции лица такие же, как в печати.
      const g = coverSpreadGeometry(format, pages);
      raw = cropSvg(renderCoverSvg(template, g, { uid: `${template.id}${format.id}b` }, { noTexture: !!lite, plainBack }), g.back!, { w: g.width, h: g.height });
    } else raw = renderCoverSvg(template, coverFrontGeometry(format), { uid: `${template.id}${format.id}` }, { noTexture: !!lite });
    entry = { type: "image/svg+xml; charset=utf-8", raw, br: brotliCompressSync(raw, { params: { [constants.BROTLI_PARAM_QUALITY]: 11 } }), gzip: gzipSync(raw, { level: 9 }) };
  }
  // Старые версии шаблона из CRM больше не запросят — не держим их в памяти.
  for (const k of [...cache.keys()]) if (k.startsWith(`${file}@`)) cache.delete(k);
  cache.set(key, entry);
  return entry;
}
