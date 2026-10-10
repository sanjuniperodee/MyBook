import { brotliCompressSync, constants, gzipSync } from "node:zlib";
import { notFound } from "next/navigation";
import sharp from "sharp";
import { cropSvg, getCoverTemplate, isKnownCover, renderCoverSvg, type CoverTemplate } from "@/lib/book/covers";
import { coverFrontGeometry, coverSpreadGeometry, formats, getFormat, type BookFormat } from "@/lib/book/formats";
import { coverPhotoDataUrl } from "@/server/cover-photos";

/**
 * Фон обложки (без текста) отдельным файлом: браузер кэширует его навсегда — версия в адресе
 * меняется вместе с кодом рисунков (COVER_ART_VERSION в next.config) и с правками шаблона в CRM.
 * Так одна и та же обложка не встраивается в HTML страницы несколько раз по 200 КБ.
 *
 * Рисованные обложки — SVG (сжимаем сами: сжатие Next к ответам из кэша не применяется).
 * Обложки на снимках и с фото клиента (на снимках-примерах) — JPEG: картинка-SVG не может загрузить снимок,
 * поэтому растрируем на сервере.
 */
const FILE = /^([a-z0-9]+)-([a-z0-9]+)(-lite)?(-back|-backplain)?\.(svg|jpg)$/;
/** Толщина книги для фона задней крышки в редакторе: от неё зависит только стык узора с корешком. */
const PREVIEW_PAGES = 120;
type Entry = { type: string; raw: string | Buffer; br?: Buffer; gzip?: Buffer };
const cache = new Map<string, Entry>();

/** Ширина растра снимка-обложки: миниатюра в выборе и крупное превью. */
const PHOTO_PX = { lite: 420, full: 1000 };

async function photoArt(template: CoverTemplate, format: BookFormat, lite: boolean, back: boolean, plainBack: boolean): Promise<Buffer> {
  const px = lite ? PHOTO_PX.lite : PHOTO_PX.full;
  // Снимок встраиваем уменьшенным: на холсте развёртки он примерно вдвое шире лица.
  const imageHref = template.photo ? await coverPhotoDataUrl(template.photo.photo.key, lite ? 900 : 2400) : undefined;
  // Обложка с фото клиента — на снимках-примерах: место под фото меньше лица, хватает меньшего размера.
  const samples = new Map(await Promise.all((template.samples ?? []).map(async (k) => [k, await coverPhotoDataUrl(k, lite ? 700 : 1400)] as const)));
  const g = back ? coverSpreadGeometry(format, PREVIEW_PAGES) : coverFrontGeometry(format);
  const side = back ? g.back! : g.front;
  let svg = renderCoverSvg(template, g, { uid: `${template.id}${format.id}`, imageHref, sampleHref: (k) => samples.get(k) ?? "" }, { plainBack });
  if (back) svg = cropSvg(svg, side, { w: g.width, h: g.height });
  // Единицы SVG — миллиметры; librsvg читает их как пиксели при 72 dpi.
  return sharp(Buffer.from(svg), { density: (72 * px) / side.w, limitInputPixels: false })
    .resize(px, Math.round((px * side.h) / side.w), { fit: "fill" })
    .flatten({ background: "#ffffff" })
    .jpeg({ quality: lite ? 78 : 86, mozjpeg: true })
    .toBuffer();
}

async function art(file: string): Promise<Entry | null> {
  const m = FILE.exec(file);
  if (!m || !isKnownCover(m[1]) || !(m[2] in formats)) return null;
  const template = getCoverTemplate(m[1]);
  const raster = !!(template.photo || template.samples);
  if ((m[5] === "jpg") !== raster) return null;
  const key = `${file}@${template.rev ?? 0}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const format = getFormat(m[2]);
  // -backplain — оборот без повтора композиции лица: под карточками «Полароидов».
  const plainBack = m[4] === "-backplain";
  let entry: Entry;
  if (raster) {
    entry = { type: "image/jpeg", raw: await photoArt(template, format, !!m[3], !!m[4], plainBack) };
  } else {
    let raw: string;
    if (m[4]) {
      // Задняя крышка — кусок развёртки: так её узор и повтор композиции лица такие же, как в печати.
      const g = coverSpreadGeometry(format, PREVIEW_PAGES);
      raw = cropSvg(renderCoverSvg(template, g, { uid: `${template.id}${format.id}b` }, { noTexture: !!m[3], plainBack }), g.back!, { w: g.width, h: g.height });
    } else raw = renderCoverSvg(template, coverFrontGeometry(format), { uid: `${template.id}${format.id}` }, { noTexture: !!m[3] });
    entry = { type: "image/svg+xml; charset=utf-8", raw, br: brotliCompressSync(raw, { params: { [constants.BROTLI_PARAM_QUALITY]: 11 } }), gzip: gzipSync(raw, { level: 9 }) };
  }
  // Старые версии шаблона из CRM больше не запросят — не держим их в памяти.
  for (const k of cache.keys()) if (k.startsWith(`${file}@`)) cache.delete(k);
  cache.set(key, entry);
  return entry;
}

export async function GET(req: Request, { params }: { params: Promise<{ file: string }> }) {
  const entry = await art((await params).file);
  if (!entry) notFound();
  const accept = req.headers.get("accept-encoding") ?? "";
  const [body, encoding] = entry.br && /\bbr\b/.test(accept) ? [entry.br, "br"] : entry.gzip && /\bgzip\b/.test(accept) ? [entry.gzip, "gzip"] : [entry.raw, null];
  return new Response(typeof body === "string" ? body : new Uint8Array(body), {
    headers: {
      "Content-Type": entry.type,
      "Cache-Control": "public, max-age=31536000, immutable",
      Vary: "Accept-Encoding",
      ...(encoding ? { "Content-Encoding": encoding } : {}),
    },
  });
}
