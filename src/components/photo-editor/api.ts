/** Запросы редактора фото: правка и версия файла, сохранение готовой картинки, «Вернуть оригинал». */
import { apiFetch } from "@/lib/client-api";
import type { PhotoEdit } from "@/lib/photo-edit/doc";
import type { PhotoRowView } from "@/components/editor/photos/model";

export interface EditState {
  edit: PhotoEdit | null;
  version: string;
}

/** Ответ сохранения и отмены: новая строка фото (размеры, кадр) и правлено ли оно теперь. */
export interface EditResult {
  photo: PhotoRowView;
  edited: boolean;
}

const base = (bookId: string, photoId: string) => `/api/books/${bookId}/photos/${photoId}/edit`;

export const loadEditState = (bookId: string, photoId: string) => apiFetch<EditState>(base(bookId, photoId));

export function saveEdit(bookId: string, photoId: string, image: Blob, edit: PhotoEdit, version: string) {
  const form = new FormData();
  form.append("image", image, "edit.jpg");
  form.append("edit", JSON.stringify(edit));
  form.append("version", version);
  return apiFetch<EditResult>(base(bookId, photoId), {
    method: "POST",
    body: form,
  });
}

export const revertEdit = (bookId: string, photoId: string) => apiFetch<EditResult>(base(bookId, photoId), { method: "DELETE" });

/** Исходный снимок для редактора (у правленого фото — сохранённый оригинал); версия — чтобы не взять старый из кэша. */
export const originalUrl = (photoId: string, version: string) => `/api/photos/${photoId}?size=original&v=${encodeURIComponent(version)}`;
