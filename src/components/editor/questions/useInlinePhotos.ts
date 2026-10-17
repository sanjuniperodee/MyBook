"use client";

import { useCallback, useLayoutEffect, useRef, useState } from "react";
import { toastError } from "@/components/ui/overlays";
import { apiFetch } from "@/lib/client-api";
import type { EditorPhoto } from "@/lib/book/editor-model";
import { normalizeStyle, type InlinePhotoStyle } from "@/lib/book/inline-photo";

/**
 * Фото книги в редакторе: какое выделено, вид фото в ответе (размер, место, рамка — сохраняется через 350 мс
 * после последней правки), подпись (через 700 мс), поворот, привязка к ответу.
 */
export function useInlinePhotos({ bookId, editable, initialPhotos }: { bookId: string; editable: boolean; initialPhotos: EditorPhoto[] }) {
  const [photos, setPhotos] = useState(initialPhotos);
  const [selectedPhotoId, setSelectedPhotoId] = useState<string | null>(null);

  // Актуальные фото для обработчиков: updateInline стабилен, чтобы превью не перерисовывалось из-за нового обработчика.
  const photosRef = useRef(photos);
  useLayoutEffect(() => {
    photosRef.current = photos;
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
      const res = await apiFetch<{ photo: EditorPhoto }>(`/api/books/${bookId}/photos/${id}/rotate`, { method: "POST" });
      setPhotos((ps) => ps.map((p) => (p.id === id ? { ...p, width: res.photo.width, height: res.photo.height, inline: res.photo.inline, rev: (p.rev ?? 0) + 1 } : p)));
    } catch (e) {
      toastError(e);
    }
  };

  /** Привязать к ответу или отвязать, сменить подпись — сразу; при ошибке откатываем. */
  const patchPhoto = async (id: string, patch: Partial<Pick<EditorPhoto, "questionId" | "caption">>) => {
    const prev = photos;
    setPhotos((ps) => ps.map((p) => (p.id === id ? { ...p, ...patch } : p)));
    try {
      await apiFetch(`/api/books/${bookId}/photos/${id}`, { method: "PATCH", json: patch });
    } catch (e) {
      setPhotos(prev);
      toastError(e);
    }
  };

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
  const addUploaded = (list: EditorPhoto[]) => {
    setPhotos((ps) => [...ps, ...list]);
    if (list[0]?.questionId) setSelectedPhotoId(list[0].id);
  };

  /** Разделы удалены (с главой или поодиночке): их фото на сервере отвязаны и ушли в общую галерею — здесь то же. */
  const detachQuestions = useCallback((ids: ReadonlySet<string>) => {
    setPhotos((ps) => ps.map((p) => (p.questionId && ids.has(p.questionId) ? { ...p, questionId: null, inline: null } : p)));
  }, []);

  return { photos, selectedPhotoId, setSelectedPhotoId, updateInline, rotatePhoto, patchPhoto, editCaption, addUploaded, detachQuestions };
}
