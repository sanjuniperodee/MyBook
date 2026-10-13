import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import sharp from "sharp";

/**
 * Фото для набора книг (tests/fixtures/books.ts). Рисуются sharp из SVG без текста — без системных шрифтов,
 * поэтому байты одинаковы при каждом запуске. В каждом снимке тёмный квадрат в левом верхнем углу:
 * по нему на растре видно поворот, отражение и кадрирование.
 */

/** Размеры снимков, px: альбомные, книжные и квадратные — под все раскладки и рамки. */
export const photoSpecs = {
  cover: [1200, 1500],
  a: [1600, 1067],
  b: [1200, 1600],
  c: [1600, 1200],
  d: [1200, 1500],
  e: [1600, 1000],
  f: [1500, 1000],
  p1: [1600, 1067],
  p2: [1100, 1600],
  p3: [1600, 900],
  p4: [1600, 1000],
  p5: [1200, 1200],
  p6: [1000, 1400],
  p7: [1500, 1000],
  p8: [1200, 900],
  p9: [1600, 900],
  p10: [900, 1300],
  p11: [1000, 1400],
  p12: [1100, 1500],
  p13: [1600, 1067],
  p14: [1000, 1500],
  p15: [1500, 1100],
  p16: [1300, 1300],
} as const satisfies Record<string, readonly [number, number]>;

export type PhotoName = keyof typeof photoSpecs;

export const photoNames = Object.keys(photoSpecs) as PhotoName[];

/** Превью — как у загруженных фото: по длинной стороне не больше 1000 px. */
const THUMB_SIDE = 1000;

export const photoKey = (name: PhotoName) => `fixtures/photos/${name}.jpg`;
export const thumbKey = (name: PhotoName) => `fixtures/photos/${name}_t.jpg`;

/** Папка хранилища по умолчанию: общая для запусков, поэтому фото пишутся один раз. */
const FIXTURE_STORAGE_DIR = path.join(tmpdir(), "mybook-fixtures");

function photoSvg(name: PhotoName) {
  const [w, h] = photoSpecs[name];
  const i = photoNames.indexOf(name);
  const hue = (i * 47) % 360;
  const m = Math.min(w, h);
  const sun = { x: w * (0.2 + (i % 4) * 0.2), y: h * (0.25 + (i % 3) * 0.15) };
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="hsl(${hue},55%,72%)"/><stop offset="1" stop-color="hsl(${(hue + 40) % 360},45%,32%)"/></linearGradient></defs>
<rect width="100%" height="100%" fill="url(#g)"/>
<path d="M0,${h * 0.78} L${w * 0.3},${h * 0.55} L${w * 0.55},${h * 0.7} L${w * 0.8},${h * 0.5} L${w},${h * 0.66} V${h} H0Z" fill="hsl(${(hue + 180) % 360},35%,28%)" opacity="0.85"/>
<circle cx="${sun.x}" cy="${sun.y}" r="${m * 0.16}" fill="#FFFFFF" opacity="0.55"/>
<rect x="${w * 0.62}" y="${h * 0.12}" width="${w * 0.22}" height="${h * 0.18}" fill="hsl(${(hue + 120) % 360},60%,50%)"/>
<rect width="${m * 0.08}" height="${m * 0.08}" fill="#111111"/>
</svg>`;
}

/** Снимок и превью — заново, без кэша. */
export async function renderPhoto(name: PhotoName): Promise<{ full: Buffer; thumb: Buffer }> {
  const full = await sharp(Buffer.from(photoSvg(name))).jpeg({ quality: 88, chromaSubsampling: "4:4:4" }).toBuffer();
  const thumb = await sharp(full).resize({ width: THUMB_SIDE, height: THUMB_SIDE, fit: "inside" }).jpeg({ quality: 80 }).toBuffer();
  return { full, thumb };
}

let files: Promise<Map<string, Buffer>> | undefined;

/** Все файлы набора: ключ хранилища → байты (считаются один раз за процесс). */
export function photoFiles(): Promise<Map<string, Buffer>> {
  files ??= Promise.all(photoNames.map(async (name) => ({ name, ...(await renderPhoto(name)) }))).then(
    (list) => new Map(list.flatMap((p) => [[photoKey(p.name), p.full] as const, [thumbKey(p.name), p.thumb] as const])),
  );
  return files;
}

/** Кладёт фото в папку хранилища. Файл с теми же байтами не переписывается; возвращает, сколько файлов записано. */
export async function prepareFixturePhotos(dir: string): Promise<number> {
  let written = 0;
  for (const [key, data] of await photoFiles()) {
    const full = path.join(dir, key);
    const current = await readFile(full).catch(() => null);
    if (current?.equals(data)) continue;
    await mkdir(path.dirname(full), { recursive: true });
    // Через временный файл: параллельные воркеры vitest не прочтут недописанный снимок.
    const tmp = `${full}.${process.pid}.tmp`;
    await writeFile(tmp, data);
    await rename(tmp, full);
    written++;
  }
  return written;
}

/**
 * Хранилище для рендера: STORAGE_DIR → папка с фото набора. Модуль env читает STORAGE_DIR один раз,
 * поэтому вызывать до первого импорта рендера (в тестах — рендер через `await import(...)`).
 */
export async function useFixtureStorage(dir = FIXTURE_STORAGE_DIR): Promise<string> {
  process.env.STORAGE_DIR = dir;
  await prepareFixturePhotos(dir);
  const { getFile } = await import("@/shared/infrastructure/storage");
  const probe = await getFile(photoKey("cover")).catch(() => null);
  const expected = (await photoFiles()).get(photoKey("cover"));
  if (!expected || !probe?.equals(expected)) throw new Error(`Хранилище открыто не на ${dir}: useFixtureStorage нужно вызвать до импорта рендера`);
  return dir;
}
