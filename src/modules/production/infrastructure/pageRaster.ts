import "server-only";
import { execFile } from "node:child_process";
import { setPriority } from "node:os";
import sharp from "sharp";
import { print } from "@/lib/book/formats";
import { storagePath } from "@/shared/infrastructure/storage";
import { slots } from "./pdf/queue";
import { RasterizerMissingError, type PageRaster } from "../application/PrintFilesService";

/**
 * Сколько pdftoppm одновременно (RASTER_CONCURRENCY, по умолчанию 1): каждый занимает ядро целиком и держит в памяти
 * разобранный PDF, а на двухъядерном сервере рядом вёрстка PDF, сам сайт и соседние проекты.
 */
const rasterSlot = slots(Math.max(1, Math.floor(Number(process.env.RASTER_CONCURRENCY) || 1)));

/** Растр — фоновая работа: с пониженным приоритетом процессор сначала отдаётся запросам сайта. */
const RASTER_NICE = 10;

const WEBP = { quality: 82 };

type Trim = { w: number; h: number };

/** Высота картинки полосы шириной width — одна и та же у растра и у пустой полосы. */
const heightFor = (width: number, trim: Trim) => Math.round((width * trim.h) / trim.w);

/** pdftoppm с аргументами списком (без оболочки); stdout — растр. signal отменён — процесс прерывается. */
function pdftoppm(args: string[], signal?: AbortSignal): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const child = execFile("pdftoppm", args, { encoding: "buffer", maxBuffer: 64 << 20, timeout: 60_000, signal }, (err, stdout, stderr) => {
      if ((err as NodeJS.ErrnoException | null)?.code === "ENOENT") reject(new RasterizerMissingError());
      else if (signal?.aborted) reject(signal.reason);
      else if (err) reject(new Error(`pdftoppm: ${stderr.toString().trim() || err.message}`));
      else resolve(stdout);
    });
    try {
      if (child.pid) setPriority(child.pid, RASTER_NICE);
    } catch {
      // Приоритет не поменять (уже завершился, нет прав) — растр просто идёт как есть.
    }
  });
}

/** Кадр PPM (P6) от pdftoppm: sharp не читает PPM, поэтому заголовок разбираем сами и отдаём пиксели RGB как raw. */
function readPpm(ppm: Buffer) {
  const header = /^P6\s+(\d+)\s+(\d+)\s+255\s/.exec(ppm.subarray(0, 64).toString("latin1"));
  if (!header) throw new Error("pdftoppm: not a PPM");
  const width = Number(header[1]);
  const height = Number(header[2]);
  const data = ppm.subarray(header[0].length);
  if (data.length < width * height * 3) throw new Error("pdftoppm: truncated raster");
  return { width, height, data: data.subarray(0, width * height * 3) };
}

/**
 * Растр полос экранной сборки через poppler. PDF сборки — с вылетами print.bleedMm по краям: разрешение подбирается
 * так, чтобы обрезной формат лёг ровно в width px, а вылеты pdftoppm отрезает сам (-x/-y/-W/-H) — картинка ровно
 * обрезной формат, как книга после обрезки.
 */
export const pdfPageRaster: PageRaster = {
  async page(pdfKey, n, width, trim, signal) {
    const dpi = (width * 25.4) / trim.w;
    const bleed = Math.round((print.bleedMm * dpi) / 25.4);
    const height = heightFor(width, trim);
    const ppm = await rasterSlot(() => {
      // Пока ждали слот, полосу пролистали: слот сразу переходит к следующей — к той, что на экране сейчас.
      signal?.throwIfAborted();
      return pdftoppm(["-f", String(n), "-l", String(n), "-r", dpi.toFixed(4), "-x", String(bleed), "-y", String(bleed), "-W", String(width), "-H", String(height), storagePath(pdfKey)], signal);
    });
    const img = readPpm(ppm);
    return sharp(img.data, { raw: { width: img.width, height: img.height, channels: 3 } }).webp(WEBP).toBuffer();
  },
  async blank(width, trim) {
    return sharp({ create: { width, height: heightFor(width, trim), channels: 3, background: "#ffffff" } }).webp(WEBP).toBuffer();
  },
};
