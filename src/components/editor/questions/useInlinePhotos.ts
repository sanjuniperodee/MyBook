"use client";

import { useCallback, useLayoutEffect, useRef, useState } from "react";
import { toastError } from "@/components/ui/overlays";
import { ApiError, apiFetch } from "@/lib/client-api";
import {
  layoutPhotoRows,
  mergePhotoRows,
  patchEditorPhotos,
  photoUndo,
  serverUpdates,
  toEditorPhoto,
  undoUpdates,
  type EditorPhoto,
  type EditorPhotoPatch,
  type EditorPhotoRow,
  type PhotoUndo,
} from "@/lib/book/editor-model";
import { normalizeStyle, type InlinePhotoStyle } from "@/lib/book/inline-photo";
import { ensureLayoutRev2, patchPhotos, syncLayout, touchesLayout, uploadPhotos, type LayoutSync } from "../photos/api";

/** Правка одного фото в пачке. */
export type PhotoUpdate = { id: string; patch: EditorPhotoPatch };

/** Итог загрузки: новые фото (уже на выбранном месте), ошибки по файлам и сколько файлов не поместилось в лимит книги. */
export interface UploadResult {
  photos: EditorPhoto[];
  errors: string[];
  cut: number;
}

const isImage = (f: File) => f.type.startsWith("image/") || /\.(jpe?g|png|webp|heic|heif|avif|tiff?)$/i.test(f.name);

/**
 * Фото книги в редакторе: какое выделено, вид фото в ответе (размер, место, рамка — сохраняется через 350 мс
 * после последней правки), подпись (через 700 мс), поворот, место в книге и кадр, загрузка.
 *
 * Правки мест (patchPhoto, patchMany) сразу видны в списке — по тем же правилам, что у сервера (patchEditorPhotos), —
 * и возвращают снимок для «Отменить» (applyUndo): прежние место и кадр всех задетых фото. Ошибка откатывает правку.
 * maxPhotos — лимит фото в книге: загрузка берёт не больше, чем осталось места, и говорит, сколько не поместилось.
 *
 * layoutRev — правила раскладки фото книги (живая копия у редактора). На прежних правка места (и любой пакет) сначала
 * переводит книгу на правила 2 (ensureLayoutRev2): список фото заменяется строками после перевода, редактор получает
 * новую версию (onLayoutRev) — превью, счётчик и снимок «Отменить» сразу идут по тем же строкам и правилам, что печать.
 * Ответ правки с другой версией (сервер перевёл книгу сам) — сверка: все строки и версия с сервера.
 */
export function useInlinePhotos({
  bookId,
  editable,
  initialPhotos,
  maxPhotos,
  layoutRev,
  onLayoutRev,
}: {
  bookId: string;
  editable: boolean;
  initialPhotos: EditorPhoto[];
  maxPhotos?: number;
  layoutRev?: number;
  onLayoutRev?: (layoutRev: number) => void;
}) {
  const [photos, setPhotos] = useState(initialPhotos);
  const [selectedPhotoId, setSelectedPhotoId] = useState<string | null>(null);

  // Актуальные фото для обработчиков: updateInline стабилен, чтобы превью не перерисовывалось из-за нового обработчика.
  const photosRef = useRef(photos);
  const layoutRevRef = useRef(layoutRev);
  const onLayoutRevRef = useRef(onLayoutRev);
  useLayoutEffect(() => {
    photosRef.current = photos;
    layoutRevRef.current = layoutRev;
    onLayoutRevRef.current = onLayoutRev;
  });
  const inlineTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const updateInline = useCallback(
    (id: string, patch: Partial<InlinePhotoStyle>) => {
      if (!editable) return;
      const cur = photosRef.current.find((p) => p.id === id);
      if (!cur) return;
      const inline = normalizeStyle({ ...normalizeStyle(cur.inline), ...patch });
      setPhotos((ps) => ps.map((p) => (p.id === id ? { ...p, inline } : p)));
      clearTimeout(inlineTimers.current.get(id));
      inlineTimers.current.set(
        id,
        setTimeout(() => {
          apiFetch(`/api/books/${bookId}/photos/${id}`, { method: "PATCH", json: { inline } }).catch((e) => toastError(e));
        }, 350),
      );
    },
    [bookId, editable],
  );

  const rotatePhoto = async (id: string) => {
    try {
      const res = await apiFetch<{ photo: EditorPhotoRow }>(`/api/books/${bookId}/photos/${id}/rotate`, { method: "POST" });
      // Кадр поворачивается вместе со снимком (rotateCrop) — берём его с сервера.
      setPhotos((ps) => ps.map((p) => (p.id === id ? { ...p, width: res.photo.width, height: res.photo.height, inline: res.photo.inline, crop: res.photo.crop ?? null, rev: (p.rev ?? 0) + 1 } : p)));
    } catch (e) {
      toastError(e);
    }
  };

  /** Перевод или сверка правил раскладки: все строки фото — новый список (сразу и в photosRef), версия — редактору. */
  const applyLayout = useCallback((sync: LayoutSync) => {
    photosRef.current = layoutPhotoRows(photosRef.current, sync.photos);
    setPhotos((ps) => layoutPhotoRows(ps, sync.photos));
    layoutRevRef.current = sync.layoutRev;
    onLayoutRevRef.current?.(sync.layoutRev);
  }, []);

  /**
   * Правки нескольких фото — сразу в списке, на сервере одним запросом (одно фото — PATCH, несколько — пачкой).
   * Правка места на книге с прежними правилами — сначала перевод, и снимок для «Отменить» — по строкам после него.
   * Возвращает снимок для «Отменить»; при ошибке правка откатывается и возвращается null.
   */
  const patchMany = useCallback(
    async (updates: readonly PhotoUpdate[]): Promise<PhotoUndo | null> => {
      if (!editable || !updates.length) return null;
      try {
        if (touchesLayout(updates)) {
          const sync = await ensureLayoutRev2(bookId, layoutRevRef.current);
          if (sync) applyLayout(sync);
        }
      } catch (e) {
        toastError(e);
        return null;
      }
      const undo = photoUndo(photosRef.current, updates);
      setPhotos((ps) => patchEditorPhotos(ps, updates));
      try {
        const res = await patchPhotos(bookId, updates);
        setPhotos((ps) => patchEditorPhotos(ps, serverUpdates(res.photos, updates)));
        // Сервер перевёл книгу сам (версия в ответе не та) — сверка: все строки и версия. Не вышло — правка уже
        // записана; сверится следующая.
        if (res.layoutRev !== undefined && res.layoutRev !== (layoutRevRef.current ?? 1)) void syncLayout(bookId).then(applyLayout, () => {});
        return undo;
      } catch (e) {
        setPhotos((ps) => patchEditorPhotos(ps, undoUpdates(undo)));
        toastError(e);
        return null;
      }
    },
    [bookId, editable, applyLayout],
  );

  /** Место, кадр, подпись или вид одного фото: в ответ, фото главы, после главы, альбом, «само», «не печатать». */
  const patchPhoto = useCallback((id: string, patch: EditorPhotoPatch) => patchMany([{ id, patch }]), [patchMany]);

  /** «Отменить»: вернуть фото к снимку (из patchPhoto, patchMany или прошлой отмены). Возвращает снимок для повтора. */
  const applyUndo = useCallback((undo: PhotoUndo) => patchMany(undoUpdates(undo)), [patchMany]);

  /**
   * Строки фото с сервера (ответ листа мест, который сам сходил в API: onPhotos, onUploaded) — заменяют свои фото
   * в списке, новые встают в конец.
   */
  const replace = useCallback((rows: readonly EditorPhotoRow[]) => {
    if (rows.length) setPhotos((ps) => mergePhotoRows(ps, rows));
  }, []);

  /** Новый порядок фото книги (onOrder листа): по нему сборка раскладывает фото, как в печати. */
  const reorder = useCallback((ids: readonly string[]) => {
    const at = new Map(ids.map((id, i) => [id, i]));
    setPhotos((ps) => [...ps].sort((a, b) => (at.get(a.id) ?? ids.length) - (at.get(b.id) ?? ids.length)));
  }, []);

  /**
   * Загрузка: не больше, чем осталось места в книге (maxPhotos), с прогрессом (сколько файлов отправлено из скольких).
   * place(i) — место i-го загруженного фото (в ответ, фото главы, после главы); null или без place — по правилу книги.
   */
  const upload = useCallback(
    async (files: readonly File[], opts: { place?: (index: number) => EditorPhotoPatch | null; onProgress?: (done: number, total: number) => void } = {}): Promise<UploadResult> => {
      const images = files.filter(isImage);
      const room = maxPhotos === undefined ? images.length : Math.max(0, maxPhotos - photosRef.current.length);
      const list = editable ? images.slice(0, room) : [];
      let cut = images.length - list.length;
      if (!list.length) return { photos: [], errors: [], cut };
      opts.onProgress?.(0, list.length);
      let res: { photos: EditorPhotoRow[]; errors: string[] };
      try {
        res = await uploadPhotos(bookId, list, (done) => opts.onProgress?.(done, list.length));
      } catch (e) {
        // Лимит фото в книге (книгу пополнили в другом окне): не поместилось ничего.
        if (e instanceof ApiError && e.code === "photosLimit") cut = images.length;
        return { photos: [], errors: [(e as Error).message], cut };
      }
      setPhotos((ps) => mergePhotoRows(ps, res.photos));
      // Снимок «Отменить» и откат места считаются по photosRef — новые фото должны быть в нём до правки места.
      photosRef.current = mergePhotoRows(photosRef.current, res.photos);
      const created = res.photos.map((r) => toEditorPhoto(r));
      const updates = created.flatMap((p, i) => {
        const patch = opts.place?.(i);
        return patch ? [{ id: p.id, patch }] : [];
      });
      const placed = updates.length && (await patchMany(updates)) ? updates : [];
      return { photos: patchEditorPhotos(created, placed), errors: res.errors, cut };
    },
    [bookId, editable, maxPhotos, patchMany],
  );

  const captionTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const editCaption = (id: string, caption: string) => {
    setPhotos((ps) => ps.map((p) => (p.id === id ? { ...p, caption } : p)));
    clearTimeout(captionTimers.current.get(id));
    captionTimers.current.set(
      id,
      setTimeout(() => void apiFetch(`/api/books/${bookId}/photos/${id}`, { method: "PATCH", json: { caption } }).catch(() => {}), 700),
    );
  };

  /** Загруженные в выборе фото: добавить в список и выделить первое, если оно уже в ответе. */
  const addUploaded = (list: EditorPhotoRow[]) => {
    setPhotos((ps) => mergePhotoRows(ps, list));
    if (list[0]?.questionId) setSelectedPhotoId(list[0].id);
  };

  /** Разделы удалены (с главой или поодиночке): их фото на сервере отвязаны и ушли в общую галерею — здесь то же. */
  const detachQuestions = useCallback((ids: ReadonlySet<string>) => {
    setPhotos((ps) => ps.map((p) => (p.questionId && ids.has(p.questionId) ? { ...p, questionId: null, inline: null } : p)));
  }, []);

  return { photos, selectedPhotoId, setSelectedPhotoId, updateInline, rotatePhoto, patchPhoto, patchMany, applyUndo, replace, reorder, upload, editCaption, addUploaded, detachQuestions, applyLayout };
}
