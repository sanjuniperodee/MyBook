import "server-only";
import { getSettings } from "@/modules/workspace";
import { MAX_PHOTOS, MAX_PHOTOS_CEILING } from "@/modules/authoring/domain/Photo";

/** Разбор предела из настройки: целое 1…MAX_PHOTOS_CEILING, иначе — по умолчанию. */
export function parsePhotoLimit(raw: string | null | undefined): number {
  const v = (raw ?? "").trim();
  if (!/^\d{1,4}$/.test(v)) return MAX_PHOTOS;
  const n = Number(v);
  return n >= 1 && n <= MAX_PHOTOS_CEILING ? n : MAX_PHOTOS;
}

/** Сколько фото можно загрузить в одну книгу — CRM → «Сайт» → «Фото в книге» (по умолчанию MAX_PHOTOS). */
export async function maxPhotos(): Promise<number> {
  const v = await getSettings(["books.maxPhotos"]);
  return parsePhotoLimit(v["books.maxPhotos"]);
}
