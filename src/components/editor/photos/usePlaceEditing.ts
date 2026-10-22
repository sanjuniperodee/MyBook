"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { confirmDialog, toast, type ToastAction } from "@/components/ui/overlays";
import { useMessages } from "@/i18n/client";
import { getInteriorDesign } from "@/lib/book/interiors";
import type { PhotoPlace } from "@/lib/book/photo-place";
import type { TocLines } from "@/lib/book/toc";
import { MAX_PHOTOS } from "@/modules/authoring/domain/Photo";
import { patchBook, patchPhotos, reorderPhotos, uploadPhotos, type PhotoPatch } from "./api";
import {
  applyPatch,
  confirmFor,
  isSamePlace,
  moveUpdates,
  placeNames,
  projectMoves,
  restoreUpdates,
  snapshotOf,
  type PhotoRowView,
  type PlaceBook,
  type PlaceContext,
  type PlaceData,
  type PlaceEvents,
  type PlaceSnapshot,
  type PlaceTarget,
  type SheetPhoto,
} from "./model";

type Move = { id: string; target: PlaceTarget };

interface Overlay {
  /** Данные вызывающего, поверх которых лежат правки этого листа. */
  src: PlaceData;
  rows: Map<string, SheetPhoto>;
  places: Map<string, PhotoPlace>;
  /** Загруженные здесь фото, пока вызывающий не добавил их в свой список. */
  extra: SheetPhoto[];
  tocLines: TocLines | null;
  placement: PlaceBook["photoPlacement"] | null;
  /** Новый порядок фото (id), пока вызывающий не передал свой. */
  order: string[] | null;
}

const fresh = (src: PlaceData): Overlay => ({ src, rows: new Map(), places: new Map(), extra: [], tocLines: null, placement: null, order: null });

/**
 * Правки мест фото в листе: сразу показывает новое место (projectPlace), пишет его одним PATCH или пакетом, после
 * правки — тост с «Отменить» на 7 секунд (R12), вопрос — только когда фото уходит из ответа или из фото другой главы.
 * Правки лежат поверх данных вызывающего, пока он не передаст новые (пересобрал книгу по onPhotos): тогда верны его.
 */
export function usePlaceEditing(data: PlaceData, on: PlaceEvents) {
  const m = useMessages();
  const t = m.editor;
  const [state, setState] = useState(() => fresh(data));
  let cur = state;
  if (state.src !== data) {
    const was = state.src;
    const known = new Set(data.photos.map((p) => p.id));
    cur = {
      src: data,
      rows: was.photos === data.photos ? state.rows : new Map(),
      order: was.photos === data.photos ? state.order : null,
      places: was.places === data.places ? state.places : new Map(),
      extra: state.extra.filter((p) => !known.has(p.id)),
      tocLines: was.tocLines === data.tocLines ? state.tocLines : null,
      placement: was.book === data.book ? state.placement : null,
    };
    setState(cur);
  }
  const [error, setError] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [uploading, setUploading] = useState<{ done: number; total: number } | null>(null);
  const busy = useRef(false);

  const photos = useMemo(() => {
    const list = [...data.photos.map((p) => cur.rows.get(p.id) ?? p), ...cur.extra.map((p) => cur.rows.get(p.id) ?? p)];
    if (!cur.order) return list;
    const at = new Map(cur.order.map((id, i) => [id, i]));
    return list.sort((a, b) => (at.get(a.id) ?? Infinity) - (at.get(b.id) ?? Infinity));
  }, [data.photos, cur.rows, cur.extra, cur.order]);
  const places = useMemo<ReadonlyMap<string, PhotoPlace>>(() => (cur.places.size ? new Map([...data.places, ...cur.places]) : data.places), [data.places, cur.places]);
  const tocLines = cur.tocLines ?? data.tocLines;
  const photoPlacement = cur.placement ?? data.book.photoPlacement;
  const book = data.book;
  const design = getInteriorDesign(book.interior);
  const names = useMemo(() => placeNames(data.chapters, data.answers), [data.chapters, data.answers]);
  const ctx = useMemo<PlaceContext>(() => {
    const answers = new Map((data.answers ?? []).map((a) => [a.id, a.chapterKey]));
    return { openerDesign: !!design.opener.photo, photoPlacement, printed: new Set(data.chapters.filter((c) => c.printed).map((c) => c.key)), chapterOfQuestion: (id) => answers.get(id) };
  }, [design, photoPlacement, data.chapters, data.answers]);
  // Предел фото: со страницы (data.maxPhotos), иначе — домена.
  const maxPhotos = data.maxPhotos ?? MAX_PHOTOS;

  // Последние фото и места: «Отменить» и второе действие тоста срабатывают позже, когда лист уже показал новые места
  // (или закрыт), — вопрос, снимки для отмены и новые места считаются по ним, а не по замыканию тоста.
  const live = useRef({ photos, places, ctx, tocLines, photoPlacement });
  useEffect(() => {
    live.current = { photos, places, ctx, tocLines, photoPlacement };
  });

  /** Строки и места поверх данных вызывающего; места — и листу под этим (onPlaces). */
  const overlay = (rows: readonly SheetPhoto[], placeMap?: ReadonlyMap<string, PhotoPlace | undefined>) => {
    const placed = new Map([...(placeMap ?? [])].filter((e): e is [string, PhotoPlace] => !!e[1]));
    setState((s) => ({ ...s, rows: new Map([...s.rows, ...rows.map((r) => [r.id, { ...(s.rows.get(r.id) ?? {}), ...r }] as const)]), places: placed.size ? new Map([...s.places, ...placed]) : s.places }));
    if (placed.size) on.onPlaces?.(placed);
  };
  const received = (rows: PhotoRowView[]) => {
    overlay(rows);
    if (rows.length) on.onPhotos(rows);
  };

  /** Вопрос перед переносом (R12) — по первому фото, которое уходит из ответа или из фото другой главы. */
  const confirmMoves = async (moves: readonly Move[], places: ReadonlyMap<string, PhotoPlace>) => {
    const cp = t.chapterPhoto;
    for (const mv of moves) {
      const c = confirmFor(places.get(mv.id), mv.target);
      if (!c) continue;
      if (c.kind === "answer")
        return confirmDialog({ title: book.blank ? cp.confirmAnswerTitleBlank : cp.confirmAnswerTitle, text: (book.blank ? cp.confirmAnswerBlank : cp.confirmAnswer)(names.question(c.questionId)), confirmLabel: cp.move, cancelLabel: cp.cancel });
      const toChapter = mv.target.kind === "opener" || mv.target.kind === "after";
      return confirmDialog({ title: toChapter ? cp.confirmChapterTitle : t.placeSheet.confirmTitle, text: cp.confirmChapter(names.chapter(c.chapterKey)), confirmLabel: cp.move, cancelLabel: cp.cancel });
    }
    return true;
  };

  /** Вернуть места из снимков (и что ещё отменить — например, настройку книги). */
  const restore = async (snaps: readonly PlaceSnapshot[], before: ReadonlyMap<string, PhotoPlace | undefined>, also?: () => Promise<void>) => {
    if (also) await also();
    const rows = await patchPhotos(book.id, restoreUpdates(snaps));
    overlay(rows, before);
    if (rows.length) on.onPhotos(rows);
  };

  /**
   * Перенести фото. toast — текст тоста по новым местам; alt — второе действие тоста; also — вместе с отменой
   * вернуть ещё что-то (настройку книги); placement — правило книги, которое только что сменили (для новых мест до
   * пересборки). Возвращает, получилось ли (false — отказались в вопросе, ошибка сети или переносить нечего).
   */
  const move = async (
    moves: readonly Move[],
    opts: {
      toast: string | ((before: ReadonlyMap<string, PhotoPlace | undefined>, after: ReadonlyMap<string, PhotoPlace>) => string);
      undoLabel: string;
      alt?: (snaps: PlaceSnapshot[]) => ToastAction;
      also?: () => Promise<void>;
      confirm?: boolean;
      placement?: PlaceBook["photoPlacement"];
    },
  ): Promise<boolean> => {
    const { photos, places, ctx } = live.current;
    const todo = moves.filter((mv) => !isSamePlace(places.get(mv.id), mv.target));
    if (!todo.length || !book.editable || busy.current) return false;
    if (opts.confirm !== false && !(await confirmMoves(todo, places))) return false;
    const updates = moveUpdates(todo, places);
    const byId = new Map(photos.map((p) => [p.id, p]));
    const snaps = updates.flatMap((u) => (byId.has(u.id) ? [snapshotOf(byId.get(u.id)!)] : []));
    const before = new Map(updates.map((u) => [u.id, places.get(u.id)]));
    const after = projectMoves(todo, places, opts.placement ? { ...ctx, photoPlacement: opts.placement } : ctx);
    overlay(
      updates.flatMap((u) => (byId.has(u.id) ? [applyPatch(byId.get(u.id)!, u.patch)] : [])),
      after,
    );
    busy.current = true;
    try {
      received(await patchPhotos(book.id, updates));
      setError(false);
    } catch {
      overlay(snaps.map((s) => ({ ...byId.get(s.id)!, ...s })), before);
      setError(true);
      return false;
    } finally {
      busy.current = false;
    }
    const text = typeof opts.toast === "string" ? opts.toast : opts.toast(before, after);
    toast(text, "success", { action: { label: opts.undoLabel, run: () => restore(snaps, before, opts.also) }, ...(opts.alt ? { alt: opts.alt(snaps) } : {}) });
    return true;
  };

  /** Правка одного фото без отмены: кадр, вид на странице, подпись. */
  const edit = async (id: string, patch: PhotoPatch) => {
    const prev = live.current.photos.find((p) => p.id === id);
    if (!prev || !book.editable) return;
    overlay([applyPatch(prev, patch)]);
    try {
      received(await patchPhotos(book.id, [{ id, patch }]));
      setError(false);
    } catch {
      overlay([prev]);
      setError(true);
    }
  };

  /** Новый порядок всех фото книги (reorderWithin): сразу в листе, потом на сервер; вызывающему — onOrder. */
  const reorder = async (ids: string[]) => {
    const prev = cur.order;
    setState((s) => ({ ...s, order: ids }));
    try {
      await reorderPhotos(book.id, ids);
      on.onOrder?.(ids);
      setError(false);
    } catch {
      setState((s) => ({ ...s, order: prev }));
      setError(true);
    }
  };

  /**
   * Настройки книги (строки оглавления, правило фото): сразу в листе, потом на сервер; вызывающему — onBook.
   * tocLines функцией — правка последних строк (из «Отменить» в тосте, когда строки уже другие).
   */
  const saveBook = async (input: { tocLines?: TocLines | ((lines: TocLines) => TocLines); photoPlacement?: PlaceBook["photoPlacement"] }) => {
    const lines = typeof input.tocLines === "function" ? input.tocLines(live.current.tocLines) : input.tocLines;
    const patch: { tocLines?: TocLines; photoPlacement?: PlaceBook["photoPlacement"] } = { ...(lines ? { tocLines: lines } : {}), ...(input.photoPlacement ? { photoPlacement: input.photoPlacement } : {}) };
    const prev = { tocLines: cur.tocLines, placement: cur.placement };
    setState((s) => ({ ...s, ...(patch.tocLines ? { tocLines: patch.tocLines } : {}), ...(patch.photoPlacement ? { placement: patch.photoPlacement } : {}) }));
    try {
      const res = await patchBook(book.id, patch);
      setState((s) => ({ ...s, ...(patch.tocLines ? { tocLines: res.tocLines } : {}), ...(patch.photoPlacement ? { placement: res.photoPlacement } : {}) }));
      on.onBook?.({ ...(patch.tocLines ? { tocLines: res.tocLines } : {}), ...(patch.photoPlacement ? { photoPlacement: res.photoPlacement } : {}) });
      setError(false);
      return true;
    } catch {
      setState((s) => ({ ...s, tocLines: prev.tocLines, placement: prev.placement }));
      setError(true);
      return false;
    }
  };

  /**
   * Загрузить фото и сразу поставить их на место (R14): place получает загруженные строки и говорит, куда каждую.
   * Больше предела книги не отправляем и говорим, сколько не поместилось.
   */
  const upload = async (files: readonly File[], place: (rows: PhotoRowView[]) => Move[]) => {
    if (!files.length || !book.editable) return [];
    const { photos, places, ctx } = live.current;
    const room = Math.max(0, maxPhotos - photos.length);
    const list = files.slice(0, room);
    setNote(null);
    if (!list.length) {
      setNote(t.photoPicker.cap(maxPhotos, 0));
      return [];
    }
    setUploading({ done: 0, total: list.length });
    try {
      const res = await uploadPhotos(book.id, list, (done) => setUploading({ done, total: list.length }));
      let rows = res.photos;
      const moves = place(rows);
      let placedOk = true;
      if (moves.length) {
        try {
          const placed = await patchPhotos(book.id, moveUpdates(moves, places));
          const byId = new Map(placed.map((r) => [r.id, r]));
          rows = rows.map((r) => byId.get(r.id) ?? r);
          // Фото главы, которое сменило загруженное, — вызывающему тоже.
          const others = placed.filter((r) => !rows.some((x) => x.id === r.id));
          if (others.length) received(others);
        } catch {
          // Фото загружены, но место не записалось: они остаются без места, автор поставит их сам.
          placedOk = false;
        }
      }
      setState((s) => ({ ...s, extra: [...s.extra, ...rows] }));
      if (placedOk) overlay([], projectMoves(moves, places, ctx));
      on.onUploaded?.(rows);
      const notes = [...res.errors.filter(Boolean)];
      if (files.length > list.length) notes.push(t.photoPicker.cap(maxPhotos, rows.length));
      if (notes.length) setNote(notes.join(" "));
      setError(!placedOk);
      return placedOk ? rows : [];
    } catch (e) {
      setNote(e instanceof Error && e.message ? e.message : t.chapterPhoto.error);
      return [];
    } finally {
      setUploading(null);
    }
  };

  /** Данные с правками этого листа — для листа, который он открывает поверх себя, и события, которые их обновляют. */
  const view = useMemo<PlaceData>(() => ({ ...data, book: { ...data.book, photoPlacement }, photos, places, tocLines }), [data, photoPlacement, photos, places, tocLines]);
  const relay: PlaceEvents = {
    onPhotos: received,
    onUploaded: (rows) => {
      setState((s) => ({ ...s, extra: [...s.extra, ...rows] }));
      on.onUploaded?.(rows);
    },
    onBook: (patch) => {
      setState((s) => ({ ...s, ...(patch.tocLines ? { tocLines: patch.tocLines } : {}), ...(patch.photoPlacement ? { placement: patch.photoPlacement } : {}) }));
      on.onBook?.(patch);
    },
    onOrder: (ids) => {
      setState((s) => ({ ...s, order: ids }));
      on.onOrder?.(ids);
    },
    onPlaces: (p) => overlay([], p),
  };

  return { photos, places, tocLines, photoPlacement, book, design, names, ctx, maxPhotos, view, relay, error, setError, note, uploading, move, edit, saveBook, upload, reorder, restore };
}
