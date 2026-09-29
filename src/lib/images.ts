import "server-only";
import sharp from "sharp";

export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;
const MAX_SIDE = 4200;
const THUMB_SIDE = 1000;

export interface ProcessedImage {
  full: Buffer;
  thumb: Buffer;
  width: number;
  height: number;
}

/** Нормализует загруженное фото: поворот по EXIF, sRGB, JPEG, без метаданных; плюс превью. */
export async function processUpload(input: Buffer): Promise<ProcessedImage> {
  const base = sharp(input, { failOn: "error", limitInputPixels: 120_000_000 }).rotate();
  const meta = await base.metadata();
  if (!meta.width || !meta.height) throw new Error("Не удалось прочитать изображение");
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
  return { full, thumb, width: info.width, height: info.height };
}
