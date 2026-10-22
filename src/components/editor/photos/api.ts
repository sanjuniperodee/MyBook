/**
 * Запросы листов мест фото — единственное место, откуда они ходят на сервер. Каждый возвращает новые строки фото
 * (или настройки книги), чтобы вызывающий обновил свой список сам, без перечитывания страницы.
 */
import { apiFetch } from "@/lib/client-api";
import type { TocLines } from "@/lib/book/toc";
import type { PhotoRowView, PlaceBook, PlacePatch } from "./model";

/** Правка фото: место, кадр, вид на странице или подпись. */
export type PhotoPatch = Partial<PlacePatch> & { layout?: PhotoRowView["layout"]; caption?: string };

/** Одна правка — PATCH фото, несколько — одним пакетом (одна транзакция: не применится ни одна, если упала любая). */
export async function patchPhotos(bookId: string, updates: readonly { id: string; patch: PhotoPatch }[]): Promise<PhotoRowView[]> {
  if (!updates.length) return [];
  if (updates.length === 1) {
    const [{ id, patch }] = updates;
    const res = await apiFetch<{ photo?: PhotoRowView }>(`/api/books/${bookId}/photos/${id}`, { method: "PATCH", json: patch });
    return res.photo ? [res.photo] : [];
  }
  const res = await apiFetch<{ photos: PhotoRowView[] }>(`/api/books/${bookId}/photos/batch`, { method: "POST", json: { updates } });
  return res.photos;
}

/** Настройки книги, которые меняют листы: строки оглавления (своё название альбома, «без фото» у главы) и правило фото. */
export async function patchBook(bookId: string, patch: { tocLines?: TocLines; photoPlacement?: PlaceBook["photoPlacement"] }): Promise<{ tocLines: TocLines; photoPlacement: PlaceBook["photoPlacement"] }> {
  const res = await apiFetch<{ book: { tocLines?: TocLines | null; photoPlacement: PlaceBook["photoPlacement"] } }>(`/api/books/${bookId}`, { method: "PATCH", json: patch });
  return { tocLines: res.book.tocLines ?? {}, photoPlacement: res.book.photoPlacement };
}

/** Сколько файлов уходит одним запросом загрузки (как в выборе фото редактора). */
const UPLOAD_CHUNK = 6;

/**
 * Загрузка фото пачками; onProgress — сколько файлов уже отправлено. Ошибки по файлам — списком; если сервер отказал
 * в пачке (предел фото, сеть), загруженное до неё остаётся, а причина — последней строкой ошибок.
 */
export async function uploadPhotos(bookId: string, files: readonly File[], onProgress?: (done: number) => void): Promise<{ photos: PhotoRowView[]; errors: string[] }> {
  const photos: PhotoRowView[] = [];
  const errors: string[] = [];
  for (let i = 0; i < files.length; i += UPLOAD_CHUNK) {
    const form = new FormData();
    files.slice(i, i + UPLOAD_CHUNK).forEach((f) => form.append("files", f));
    try {
      const res = await apiFetch<{ photos: PhotoRowView[]; errors: string[] }>(`/api/books/${bookId}/photos`, { method: "POST", body: form });
      photos.push(...res.photos);
      errors.push(...res.errors);
    } catch (e) {
      if (!photos.length) throw e;
      errors.push(e instanceof Error ? e.message : "");
      break;
    }
    onProgress?.(Math.min(files.length, i + UPLOAD_CHUNK));
  }
  return { photos, errors };
}

/** Новый порядок фото книги (все id по порядку). */
export async function reorderPhotos(bookId: string, ids: readonly string[]): Promise<void> {
  await apiFetch(`/api/books/${bookId}/photos/order`, { method: "PUT", json: { ids } });
}
