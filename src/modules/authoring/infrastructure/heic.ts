import "server-only";
import * as threads from "node:worker_threads";

/**
 * Фото с iPhone в оригинале (HEIC, HEVC). У sharp на сервере декодера HEVC нет, поэтому HEIC раскодирует heic-decode
 * (libheif в WebAssembly). Раскодирование — секунда-другая чистого JS/wasm на снимок, и главный поток на это время
 * замирал бы, поэтому оно идёт в отдельном потоке (по одному за раз: снимок в 48 Мп — сотни мегабайт). Потока нет
 * (тесты, неудача запуска) — раскодируем здесь же.
 *
 * Зачем оригиналы: если браузер iPhone сам превращает HEIC в JPEG, на больших снимках иногда выходят зелёные квадраты
 * (декодер HEVC в телефоне не справляется с куском кадра, а чистый зелёный — это нулевые YUV). Оригинал в этом
 * не виноват. Цвет: iPhone снимает в Display P3 — сразу переводим в sRGB (matrix + sRGB-кривая), как это делал бы
 * телефон при конвертации в JPEG.
 */

/** Бренды HEIC (HEVC); AVIF и другие форматы sharp читает сам. */
const HEIC_BRANDS = new Set(["heic", "heix", "hevc", "hevx", "heim", "heis"]);

/** Файл — HEIC/HEIF с HEVC: контейнер ISO BMFF с ftyp, где среди брендов есть HEIC и нет AVIF. */
export function isHeic(buf: Buffer): boolean {
  if (buf.length < 16 || buf.toString("latin1", 4, 8) !== "ftyp") return false;
  const size = Math.min(buf.readUInt32BE(0), buf.length, 256);
  const brands = [buf.toString("latin1", 8, 12)];
  for (let i = 16; i + 4 <= size; i += 4) brands.push(buf.toString("latin1", i, i + 4));
  return brands.some((b) => HEIC_BRANDS.has(b)) && !brands.some((b) => b === "avif" || b === "avis");
}

/** В файле встроен профиль Display P3 (имя — в ICC, ASCII или UTF-16): такие снимки переводим в sRGB. */
export function isDisplayP3(buf: Buffer): boolean {
  return buf.includes("Display P3") || buf.includes(Buffer.from("Display P3", "utf16le").swap16());
}

/**
 * Исходник раскодирования — обычный JS без зависимостей от сборки: он же уходит в поток (eval) и выполняется здесь, если
 * потока нет. decode — heic-decode; результат — RGBA и размеры (heic-decode уже применил поворот снимка).
 */
const RUN_SOURCE = `
async function run(decode, input, p3) {
  const img = await decode({ buffer: input });
  const px = new Uint8Array(img.data.buffer, img.data.byteOffset, img.data.byteLength);
  if (p3) {
    const lin = new Float32Array(256);
    for (let i = 0; i < 256; i++) { const c = i / 255; lin[i] = c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }
    const enc = new Uint8Array(4097);
    for (let k = 0; k <= 4096; k++) { const v = k / 4096; enc[k] = Math.round(255 * (v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - 0.055)); }
    for (let i = 0; i < px.length; i += 4) {
      const r = lin[px[i]], g = lin[px[i + 1]], b = lin[px[i + 2]];
      let R = 1.2249401 * r - 0.2249404 * g, G = -0.0420569 * r + 1.0420571 * g, B = -0.0196376 * r - 0.0786361 * g + 1.0982735 * b;
      R = R < 0 ? 0 : R > 1 ? 1 : R; G = G < 0 ? 0 : G > 1 ? 1 : G; B = B < 0 ? 0 : B > 1 ? 1 : B;
      px[i] = enc[(R * 4096) | 0]; px[i + 1] = enc[(G * 4096) | 0]; px[i + 2] = enc[(B * 4096) | 0];
    }
  }
  return { width: img.width, height: img.height, data: px };
}`;

const WORKER_SOURCE = `${RUN_SOURCE}
const { parentPort, workerData } = require("node:worker_threads");
run(require("heic-decode"), Buffer.from(workerData.input), workerData.p3).then(
  (r) => parentPort.postMessage({ ok: true, width: r.width, height: r.height, data: r.data }, [r.data.buffer]),
  (e) => parentPort.postMessage({ ok: false, error: String(e && e.message || e) }),
);`;

export interface Rgba {
  width: number;
  height: number;
  /** RGBA, 4 байта на пиксель. */
  data: Buffer;
}

/** Не больше одного раскодирования за раз. */
let tail: Promise<unknown> = Promise.resolve();
const DECODE_TIMEOUT_MS = 90_000;

/** Раскодирование в потоке; null — потока не вышло (не нашёл пакет, не запустился): пусть раскодирует вызывающий. */
export function decodeHeicInThread(input: Buffer, p3: boolean): Promise<Rgba | null> {
  return new Promise((resolve) => {
    let done = false;
    const finish = (v: Rgba | null) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      void w.terminate();
      resolve(v);
    };
    const Worker = Reflect.get(threads, "Worker") as typeof threads.Worker;
    // Конструктор — через Reflect, как у потока PDF: Turbopack, увидев `new Worker(…)`, пытается собрать его сам.
    const w: threads.Worker = Reflect.construct(Worker, [WORKER_SOURCE, { eval: true, workerData: { input, p3 } }]);
    const timer = setTimeout(() => finish(null), DECODE_TIMEOUT_MS);
    w.once("message", (m: { ok: boolean; width?: number; height?: number; data?: Uint8Array; error?: string }) => {
      if (m.ok && m.data && m.width && m.height) finish({ width: m.width, height: m.height, data: Buffer.from(m.data.buffer, m.data.byteOffset, m.data.byteLength) });
      else {
        console.error("[heic] decode in worker failed:", m.error);
        finish(null);
      }
    });
    w.once("error", (err: Error) => {
      console.error("[heic] worker error:", err.message);
      finish(null);
    });
  });
}

/** Раскодирование здесь же (резерв): тот же исходник, что в потоке. */
async function inline(input: Buffer, p3: boolean): Promise<Rgba> {
  const run = new Function(`${RUN_SOURCE}; return run;`)() as (decode: unknown, input: Buffer, p3: boolean) => Promise<{ width: number; height: number; data: Uint8Array }>;
  const decode = (await import("heic-decode")).default;
  const r = await run(decode, input, p3);
  return { width: r.width, height: r.height, data: Buffer.from(r.data.buffer, r.data.byteOffset, r.data.byteLength) };
}

/** HEIC → RGBA (повёрнут как на экране, sRGB). Кидает ошибку, если файл не раскодировался. */
export function decodeHeic(input: Buffer): Promise<Rgba> {
  const p3 = isDisplayP3(input);
  const job = tail.then(async () => (await decodeHeicInThread(input, p3)) ?? inline(input, p3));
  tail = job.catch(() => {});
  return job;
}
