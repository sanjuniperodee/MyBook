import "server-only";
import sharp from "sharp";
import { decodeHeic, isHeic } from "./heic";

export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;
const MAX_SIDE = 4200;
const THUMB_SIDE = 1000;

interface ProcessedImage {
  full: Buffer;
  thumb: Buffer;
  width: number;
  height: number;
  /** На снимке сплошной зелёный прямоугольник — так выглядит фото, повреждённое телефоном при выгрузке (см. hasGreenBlock). */
  damaged: boolean;
}

/**
 * iPhone при выборе пачки больших фото в браузере сам превращает HEIC в JPEG (у sharp на сервере нет HEVC, получить
 * оригинал мы не можем), и иногда декодер не справляется с куском кадра: блок кодируется нулями YUV, а это чистый
 * зелёный (0, 139, 0). Признаки: прямоугольник кратных 64 px размеров от верхнего края снимка, заметный и сплошной
 * (случай 24.10.2026, книга заказа 27: три фото из пачки в семь). Сервер получает уже испорченный файл, поэтому
 * единственное, что можно сделать, — заметить это сразу и попросить загрузить фото ещё раз. Ищем один сплошной прямоугольник нескольких процентов кадра из почти чисто зелёных пикселей
 * (R и B почти нули, G заметно выше): в живых фото такого нет, на 839 фото прода — ровно три поломанных и ни одного
 * ложного срабатывания.
 */
export function hasGreenBlock(raw: Uint8Array, width: number, height: number): boolean {
  let n = 0;
  let x0 = width;
  let y0 = height;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 3;
      if (raw[i] < 40 && raw[i + 2] < 40 && raw[i + 1] > 100 && raw[i + 1] - raw[i] > 80) {
        n++;
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  if (!n) return false;
  const box = (x1 - x0 + 1) * (y1 - y0 + 1);
  const share = n / (width * height);
  // Сплошной прямоугольник: пиксели заполняют свою рамку почти целиком, и он заметен, но не весь кадр.
  return share >= 0.008 && share <= 0.4 && n / box >= 0.85;
}

/** Нормализует загруженное фото: поворот по EXIF, sRGB, JPEG, без метаданных; плюс превью. */
export async function processUpload(input: Buffer): Promise<ProcessedImage> {
  // HEIC с iPhone: sharp на сервере не раскодирует HEVC — раскодируем отдельно (снимок уже повёрнут и в sRGB).
  const heic = isHeic(input) ? await decodeHeic(input) : null;
  const base = heic
    ? sharp(heic.data, { raw: { width: heic.width, height: heic.height, channels: 4 }, limitInputPixels: 120_000_000 }).removeAlpha()
    : sharp(input, { failOn: "error", limitInputPixels: 120_000_000 }).rotate();
  const meta = await base.metadata();
  if (!meta.width || !meta.height) throw new Error("unreadable image");
  const { data: full, info } = await base
    .clone()
    .resize({ width: MAX_SIDE, height: MAX_SIDE, fit: "inside", withoutEnlargement: true })
    .toColourspace("srgb")
    .jpeg({ quality: 92, mozjpeg: true, chromaSubsampling: "4:4:4" })
    .toBuffer({ resolveWithObject: true });
  const thumb = await sharp(full)
    .resize({ width: THUMB_SIDE, height: THUMB_SIDE, fit: "inside" })
    .jpeg({ quality: 82, mozjpeg: true })
    .toBuffer();
  const probe = await sharp(thumb).resize({ width: 120, height: 120, fit: "inside" }).raw().toBuffer({ resolveWithObject: true });
  return { full, thumb, width: info.width, height: info.height, damaged: probe.info.channels === 3 && hasGreenBlock(probe.data, probe.info.width, probe.info.height) };
}
