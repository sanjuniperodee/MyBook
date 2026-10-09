import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { getFile } from "@/shared/infrastructure/storage";

/**
 * Снимки обложек: встроенные лежат в assets/cover-photos/<имя>.jpg, загруженные в CRM — в хранилище (designs/…).
 * Уменьшенные копии держим в памяти: превью на сайте берут 600–1600 px, печать — оригинал.
 */
const BUILTIN = /^[a-z0-9]+$/;
const STORED = /^designs\/[a-z0-9-]+\/[a-z0-9-]+\.jpg$/;

export function isCoverPhotoKey(key: string) {
  return BUILTIN.test(key) || STORED.test(key);
}

export async function coverPhotoOriginal(key: string): Promise<Buffer> {
  if (BUILTIN.test(key)) return readFile(path.join(process.cwd(), "assets", "cover-photos", `${key}.jpg`));
  if (STORED.test(key)) return getFile(key);
  throw new Error("Invalid cover photo key");
}

const cache = new Map<string, Promise<Buffer>>();
const CACHE_MAX = 120;

/** Снимок шириной не больше width (по длинной стороне), JPEG. */
export function coverPhotoResized(key: string, width: number): Promise<Buffer> {
  const id = `${key}@${width}`;
  let hit = cache.get(id);
  if (!hit) {
    hit = coverPhotoOriginal(key).then((buf) =>
      sharp(buf).resize(width, width, { fit: "inside", withoutEnlargement: true }).jpeg({ quality: 84, mozjpeg: true }).toBuffer(),
    );
    hit.catch(() => cache.delete(id));
    if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value!);
    cache.set(id, hit);
  }
  return hit;
}

export async function coverPhotoDataUrl(key: string, width?: number) {
  const buf = width ? await coverPhotoResized(key, width) : await coverPhotoOriginal(key);
  return `data:image/jpeg;base64,${buf.toString("base64")}`;
}
