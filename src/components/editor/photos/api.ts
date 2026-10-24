/**
 * Запросы листов мест фото — единственное место, откуда они ходят на сервер. Каждый возвращает новые строки фото
 * (или настройки книги), чтобы вызывающий обновил свой список сам, без перечитывания страницы.
 */
import { apiFetch } from "@/lib/client-api";
import { LAYOUT_REV_2 } from "@/lib/book/layout";
import type { TocLines } from "@/lib/book/toc";
import type { PhotoRowView, PlaceBook, PlacePatch } from "./model";

/** Правка фото: место, кадр, вид на странице или подпись. */
export type PhotoPatch = Partial<PlacePatch> & { layout?: PhotoRowView["layout"]; caption?: string };

/**
 * Ответ правки фото: новые строки и версия правил раскладки книги после неё (правка места или пакет на книге
 * с прежними правилами переводит её на правила 2). Версия не та, что у вызывающего, — он сверяется (syncLayout).
 */
export interface PhotoRows {
  photos: PhotoRowView[];
  layoutRev?: number;
}

/** Одна правка — PATCH фото, несколько — одним пакетом (одна транзакция: не применится ни одна, если упала любая). */
export async function patchPhotos(bookId: string, updates: readonly { id: string; patch: PhotoPatch }[]): Promise<PhotoRows> {
  if (!updates.length) return { photos: [] };
  if (updates.length === 1) {
    const [{ id, patch }] = updates;
    const res = await apiFetch<{ photo?: PhotoRowView; layoutRev?: number }>(`/api/books/${bookId}/photos/${id}`, { method: "PATCH", json: patch });
    return { photos: res.photo ? [res.photo] : [], layoutRev: res.layoutRev };
  }
  const res = await apiFetch<{ photos: PhotoRowView[]; layoutRev?: number }>(`/api/books/${bookId}/photos/batch`, { method: "POST", json: { updates } });
  return { photos: res.photos, layoutRev: res.layoutRev };
}

/**
 * Переведёт ли правка книгу с прежними правилами на правила 2 (как сервер, PhotosService): правка места одного фото
 * (глава, фото главы, ответ) или любой пакет.
 */
export const touchesLayout = (updates: readonly { patch: { chapter?: unknown; opener?: unknown; questionId?: unknown } }[]) =>
  updates.length > 1 || updates.some(({ patch }) => patch.chapter !== undefined || patch.opener !== undefined || patch.questionId !== undefined);

/** Версия правил раскладки книги и все её строки фото (по позициям) — ответ POST …/layout. */
export interface LayoutSync {
  layoutRev: number;
  photos: PhotoRowView[];
}

/** Идущие запросы перевода по книгам: листы и редактор, начавшие правку одновременно, ждут один. */
const syncing = new Map<string, Promise<LayoutSync>>();
/** Книги, которые перевод не повторил: до сверки по ответу правки перед каждой правкой их не переводим заново. */
const refused = new Set<string>();

/** Перевести книгу на правила 2 (если ещё нет и перевод повторяет вёрстку) и взять версию правил и все строки фото. */
export function syncLayout(bookId: string): Promise<LayoutSync> {
  let p = syncing.get(bookId);
  if (!p) {
    p = apiFetch<LayoutSync>(`/api/books/${bookId}/layout`, { method: "POST" })
      .then((res) => {
        if (res.layoutRev === LAYOUT_REV_2) refused.delete(bookId);
        else refused.add(bookId);
        return res;
      })
      .finally(() => syncing.delete(bookId));
    syncing.set(bookId, p);
  }
  return p;
}

/**
 * Перед первой правкой мест на книге с прежними правилами (layoutRev ≠ 2; нет версии — прежние) — явный перевод:
 * вызывающий заменяет свои строки фото и версию правил ответом и только потом считает снимки для «Отменить» и пишет
 * правку, — его превью, счётчик и места сразу те же, что в печати. null — переводить нечего: книга уже на правилах 2
 * или перевод её уже не повторил (правка идёт по правилам 1, как раньше; сервер переведёт её сам, когда сможет, —
 * ответ правки скажет новую версию).
 */
export async function ensureLayoutRev2(bookId: string, layoutRev: number | undefined): Promise<LayoutSync | null> {
  if ((layoutRev ?? 1) === LAYOUT_REV_2 || refused.has(bookId)) return null;
  return syncLayout(bookId);
}

/** Настройки книги, которые меняют листы: строки оглавления (своё название альбома, «без фото» у главы) и правило фото. */
export async function patchBook(bookId: string, patch: { tocLines?: TocLines; photoPlacement?: PlaceBook["photoPlacement"] }): Promise<{ tocLines: TocLines; photoPlacement: PlaceBook["photoPlacement"] }> {
  const res = await apiFetch<{ book: { tocLines?: TocLines | null; photoPlacement: PlaceBook["photoPlacement"] } }>(`/api/books/${bookId}`, { method: "PATCH", json: patch });
  return { tocLines: res.book.tocLines ?? {}, photoPlacement: res.book.photoPlacement };
}

/**
 * Что выбирать в окне загрузки фото. Явные image/heic и .heic нужны iPhone: без них Safari сам превращает фото в JPEG, и на
 * больших снимках в этом превращении иногда появляются зелёные квадраты. С ними телефон отдаёт оригинал, а сервер
 * раскодирует его сам (infrastructure/heic.ts).
 */
export const PHOTO_ACCEPT = "image/*,image/heic,image/heif,.heic,.heif";

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
