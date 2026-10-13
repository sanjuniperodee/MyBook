import { createHash } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { availableParallelism } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import sharp from "sharp";

/**
 * Общее для снимков (pdf-snapshot, html-snapshot) и сверки (compare). Снимок — каталог с manifest.json
 * и PNG по страницам: ключ «pdf:block:classic-a5-ru» → pdf/block/classic-a5-ru/001.png, 002.png…
 */

/** Корень репозитория: снимки запускаются из него (пути @/ из tsconfig, assets/fonts). */
export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

export interface ManifestEntry {
  pages: number;
  /** sha256 пикселей каждой страницы (размер и RGBA), а не байтов PNG. */
  sha256: string[];
  /** Сборка упала: текст ошибки вместо страниц. */
  error?: string;
}

export type Manifest = Record<string, ManifestEntry>;

const MANIFEST = "manifest.json";

export async function readManifest(dir: string): Promise<Manifest> {
  return JSON.parse(await readFile(path.join(dir, MANIFEST), "utf8")) as Manifest;
}

/** Ключи по алфавиту (без учёта локали): одинаковые снимки — одинаковые файлы. */
export async function writeManifest(dir: string, manifest: Manifest) {
  const sorted = Object.fromEntries(Object.entries(manifest).sort(([a], [b]) => (a < b ? -1 : 1)));
  await writeFile(path.join(dir, MANIFEST), JSON.stringify(sorted, null, 2) + "\n");
}

export const keyDir = (root: string, key: string) => path.join(root, ...key.split(":"));
export const pagePath = (dir: string, page: number) => path.join(dir, `${String(page + 1).padStart(3, "0")}.png`);

/** Пустой каталог страниц ключа. */
export async function freshKeyDir(out: string, key: string) {
  const dir = keyDir(out, key);
  await rm(dir, { recursive: true, force: true });
  await mkdir(dir, { recursive: true });
  return dir;
}

export interface Pixels {
  width: number;
  height: number;
  /** RGBA построчно. */
  data: Buffer;
}

export async function readPixels(file: string): Promise<Pixels> {
  const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { width: info.width, height: info.height, data };
}

export const pixelHash = ({ width, height, data }: Pixels) => createHash("sha256").update(`${width}x${height}:`).update(data).digest("hex");

/** Запись манифеста по готовым PNG страниц. */
export async function entryFor(files: string[]): Promise<ManifestEntry> {
  const sha256: string[] = [];
  for (const file of files) sha256.push(pixelHash(await readPixels(file)));
  return { pages: files.length, sha256 };
}

export const errorEntry = (err: unknown): ManifestEntry => ({ pages: 0, sha256: [], error: err instanceof Error ? err.message.split("\n")[0] : String(err) });

export interface SnapshotFlags {
  out: string;
  /** Подстрока ключа: снимаются только подходящие ключи. */
  filter?: string;
  /** По одной книге на оформление: A5, ru. */
  quick: boolean;
  jobs: number;
}

export function snapshotFlags(args: string[]): SnapshotFlags {
  const { values } = parseArgs({
    args,
    options: { out: { type: "string" }, filter: { type: "string" }, quick: { type: "boolean", default: false }, jobs: { type: "string" } },
  });
  if (!values.out) throw new Error("Нужен --out <каталог>");
  const jobs = values.jobs === undefined ? Math.max(1, availableParallelism() - 1) : Number(values.jobs);
  if (!Number.isInteger(jobs) || jobs < 1) throw new Error(`--jobs: ожидается целое ≥ 1, получено «${values.jobs}»`);
  return { out: path.resolve(values.out), filter: values.filter, quick: values.quick, jobs };
}

/** Каталог снимка: прежние manifest.json и diff/ удаляются, страницы ключей перезаписываются по одному. */
export async function prepareOut(out: string) {
  await mkdir(out, { recursive: true });
  await rm(path.join(out, MANIFEST), { force: true });
  await rm(path.join(out, "diff"), { recursive: true, force: true });
}

/** fn для всех items, не больше jobs одновременно; результаты — в порядке items. */
export async function runPool<T, R>(items: T[], jobs: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const lane = async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(jobs, items.length) }, lane));
  return results;
}

export const seconds = (from: number) => `${((performance.now() - from) / 1000).toFixed(1)} с`;

/** Итог снимка; код выхода 1, если какая-то сборка упала (ошибка записана в манифест). */
export function reportSnapshot(manifest: Manifest, out: string, started: number) {
  const entries = Object.entries(manifest);
  const failed = entries.filter(([, e]) => e.error);
  const pages = entries.reduce((n, [, e]) => n + e.pages, 0);
  for (const [key, e] of failed) console.error(`✗ ${key}: ${e.error}`);
  console.log(`Снимок за ${seconds(started)}: ключей ${entries.length}, страниц ${pages} → ${out}`);
  if (failed.length) process.exitCode = 1;
}
