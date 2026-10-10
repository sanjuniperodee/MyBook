import "server-only";
import { createHash } from "node:crypto";
import sharp from "sharp";
import { fileExists, getFile, putFile } from "@/shared/infrastructure/storage";

/** Длинная сторона копии для просмотра: 3D-книге хватает с запасом (текстура обложки — 1536 px), оригинал — до 3600 px и 3 МБ. */
export const VIEW_SIDE = 1400;

const inflight = new Map<string, Promise<Buffer>>();

/**
 * Уменьшенная копия фото для просмотра (3D-книга): строится один раз и кладётся в кэш хранилища.
 * Ключ кэша зависит от ключа файла, так что после поворота или замены фото копия строится заново.
 */
export function photoViewFile(storageKey: string): Promise<Buffer> {
  const cacheKey = `cache/photo-view/${createHash("sha1").update(storageKey).digest("hex").slice(0, 24)}-${VIEW_SIDE}.jpg`;
  let job = inflight.get(cacheKey);
  if (!job) {
    job = (async () => {
      if (await fileExists(cacheKey)) return getFile(cacheKey);
      const out = await sharp(await getFile(storageKey))
        .resize({ width: VIEW_SIDE, height: VIEW_SIDE, fit: "inside", withoutEnlargement: true })
        .jpeg({ quality: 84, mozjpeg: true })
        .toBuffer();
      await putFile(cacheKey, out);
      return out;
    })().finally(() => inflight.delete(cacheKey));
    inflight.set(cacheKey, job);
  }
  return job;
}
