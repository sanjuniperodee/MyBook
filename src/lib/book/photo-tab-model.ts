import type { ClientMessages } from "@/i18n/messages";
import type { PhotoCrop } from "@/lib/book/photo-crop";
import { WARN_LOSS } from "@/lib/book/photo-loss";
import type { PhotoPlace } from "@/lib/book/photo-place";
import { GALLERY_KEY } from "@/lib/book/toc";

/**
 * Чистая модель мест фото и фильтров вкладки «Фото» без React/Next: переиспользуется в UI веба
 * (`src/components/editor/photos/model.ts`, `src/app/(app)/books/[id]/photos/photos-tab.ts`) и в обоих
 * HTTP-процессах API v1 (`apps/api`, `apps/backend`).
 */

/** Фото книги в листах: размеры и поля места — строка photos или фото редактора. Порядок списка — порядок вкладки «Фото». */
export interface SheetPhoto {
  id: string;
  width: number;
  height: number;
  questionId?: string | null;
  chapter?: string | null;
  opener?: boolean;
  crop?: PhotoCrop | null;
  caption?: string;
  layout?: "full" | "bleed" | "half" | "grid";
}

/** Глава книги по порядку: название (своё из tocLines), номер и эпиграф для мини-страницы; printed — в ней есть что печатать. */
export interface PlaceChapter {
  key: string;
  title: string;
  number?: number | null;
  epigraph?: string;
  printed: boolean;
}

/** Ответ (раздел) книги — куда можно поставить фото. */
export interface PlaceAnswer {
  id: string;
  title: string;
  chapterKey: string;
}

/** Названия для подписей мест. */
export interface PlaceNames {
  chapter: (key: string) => string;
  question: (id: string) => string;
}

/** Выбор автора в листе места. */
export type PlaceTarget =
  | { kind: "answer"; questionId: string }
  | { kind: "opener"; chapterKey: string }
  | { kind: "after"; chapterKey: string }
  | { kind: "album" }
  | { kind: "auto" }
  | { kind: "off" };

/** album — название альбома в конце (как печатается): «Фото главы «…»» у фото начальной полосы альбома. */
export function placeNames(chapters: readonly Pick<PlaceChapter, "key" | "title">[], answers: readonly Pick<PlaceAnswer, "id" | "title">[] = [], album = ""): PlaceNames {
  const c = new Map(chapters.map((ch) => [ch.key, ch.title]));
  if (album) c.set(GALLERY_KEY, album);
  const q = new Map(answers.map((a) => [a.id, a.title]));
  return { chapter: (key) => c.get(key) || "—", question: (id) => q.get(id) || "—" };
}

/** Какой пункт листа места отмечен «сейчас здесь». Фото, ждущее главу без текста, — выбор «после главы» (или фото главы). */
export function currentOption(place: PhotoPlace | undefined, photo?: Pick<SheetPhoto, "opener">): PlaceTarget["kind"] {
  if (!place) return "auto";
  if (place.waitingFor) return photo?.opener ? "opener" : "after";
  if (place.auto) return "auto";
  return place.kind;
}

/**
 * Где стоит фото — одной строкой (R6: только по photoPlaceOf). marked — у фото отметка «фото главы»; в оформлении без
 * фото главы (openerDesign = false) оно печатается после главы, и подпись это говорит. У фото, отданного правилу книги
 * до пересборки (глава ещё неизвестна), — «Пусть встанет само».
 */
export function placeText(place: PhotoPlace, names: PlaceNames, t: ClientMessages["editor"], blank: boolean, opts: { marked?: boolean; openerDesign?: boolean } = {}): string {
  const p = t.photoPlace;
  if (place.waitingFor) return p.waiting(names.chapter(place.waitingFor));
  let label: string;
  switch (place.kind) {
    case "answer":
      label = (blank ? p.answerBlank : p.answer)(place.questionId ? names.question(place.questionId) : "—");
      break;
    case "opener":
      label = p.opener(names.chapter(place.chapterKey ?? ""));
      break;
    case "after":
      if (!place.chapterKey) return t.placeSheet.auto.label;
      label = opts.marked && opts.openerDesign === false && !place.auto ? `${p.opener(names.chapter(place.chapterKey))} · ${p.noteNoOpener}` : p.after(names.chapter(place.chapterKey));
      break;
    case "album":
      label = p.album;
      break;
    case "off":
      label = p.off;
      break;
  }
  return place.auto ? p.withAuto(label) : label;
}

// ─── фильтры и итоги вкладки «Фото» ────────────────────────────────────────

export const PHOTO_FILTERS = ["all", "auto", "cover", "off", "crop"] as const;
export type PhotoFilter = (typeof PHOTO_FILTERS)[number];
export const isPhotoFilter = (v: unknown): v is PhotoFilter => (PHOTO_FILTERS as readonly unknown[]).includes(v);

/**
 * Обрезка фото на его месте — по сборке сервера. Пока вид на странице поменяли, а книгу ещё не пересобрали
 * (layout не тот, что у сервера), прежняя оценка неверна — 0.
 */
export function lossOf(photo: Pick<SheetPhoto, "id" | "layout">, server: Pick<SheetPhoto, "layout"> | undefined, losses: Readonly<Record<string, number>>): number {
  if (!server || (photo.layout ?? "full") !== (server.layout ?? "full")) return 0;
  return losses[photo.id] ?? 0;
}

/** Фото с заметной обрезкой (R11): метка у фото, фильтр «С обрезкой». */
export const isLossy = (loss: number) => loss >= WARN_LOSS;

/** Подходит ли фото под фильтр: «Встали сами» — напечатаются по правилу книги; «Не печатаются» — и по выбору, и по правилу. */
export function matchesFilter(filter: PhotoFilter, place: PhotoPlace | undefined, loss: number): boolean {
  switch (filter) {
    case "all":
      return true;
    case "auto":
      return !!place && place.auto && place.kind !== "off";
    case "cover":
      return !!place?.onCover;
    case "off":
      return place?.kind === "off";
    case "crop":
      return isLossy(loss);
  }
}

/** Сколько фото под каждым фильтром. */
export function filterCounts(photos: readonly Pick<SheetPhoto, "id">[], places: ReadonlyMap<string, PhotoPlace>, loss: (id: string) => number): Record<PhotoFilter, number> {
  const out = Object.fromEntries(PHOTO_FILTERS.map((f) => [f, 0])) as Record<PhotoFilter, number>;
  for (const p of photos) for (const f of PHOTO_FILTERS) if (matchesFilter(f, places.get(p.id), loss(p.id))) out[f]++;
  return out;
}

/** Чипы фильтров: «Все», остальные — если под ними есть фото или фильтр выбран сейчас (ссылка ?filter=crop). */
export const visibleFilters = (counts: Record<PhotoFilter, number>, active: PhotoFilter): PhotoFilter[] => PHOTO_FILTERS.filter((f) => f === "all" || f === active || counts[f] > 0);

/** Сколько фото каждого вида по месту: выбрал автор, встали сами (правило книги), не печатаются внутри книги. */
export function placeTotals(photos: readonly { id: string }[], places: ReadonlyMap<string, PhotoPlace>): { total: number; placed: number; auto: number; off: number } {
  let placed = 0;
  let auto = 0;
  let off = 0;
  for (const p of photos) {
    const place = places.get(p.id);
    if (!place || place.kind === "off") off++;
    else if (place.auto) auto++;
    else placed++;
  }
  return { total: photos.length, placed, auto, off };
}
