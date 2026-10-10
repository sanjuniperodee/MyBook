import "server-only";
import sharp from "sharp";
import { isDefaultFrame, normalizeFrame, type PhotoFrame } from "@/lib/book/photo-frame";

/**
 * Печатает кадр в сам снимок: вырезает ту часть, которая видна в месте с пропорциями aspect (ширина к высоте) при
 * заданных масштабе и положении. Та же математика, что в framedImageRect/cssFrame, поэтому в PDF снимок стоит
 * там же, где клиент поставил его в редакторе. react-pdf не умеет увеличивать и сдвигать картинку — ему отдаём готовую.
 */
export async function bakeFrame(input: Buffer, aspect: number, frame: PhotoFrame | undefined): Promise<Buffer> {
  if (isDefaultFrame(frame)) return input;
  const f = normalizeFrame(frame);
  const meta = await sharp(input).metadata();
  const iw = meta.width ?? 0;
  const ih = meta.height ?? 0;
  if (!iw || !ih || !(aspect > 0)) return input;
  // место — прямоугольник aspect × 1; снимок масштабируется «по размеру места» × zoom
  const s = Math.max(aspect / iw, 1 / ih) * f.zoom;
  const winW = Math.min(iw, aspect / s);
  const winH = Math.min(ih, 1 / s);
  const left = Math.max(0, Math.min(iw - winW, (iw - winW) * f.x));
  const top = Math.max(0, Math.min(ih - winH, (ih - winH) * f.y));
  return sharp(input)
    .extract({ left: Math.round(left), top: Math.round(top), width: Math.max(1, Math.round(winW)), height: Math.max(1, Math.round(winH)) })
    .jpeg({ quality: 92, chromaSubsampling: "4:4:4" })
    .toBuffer();
}
