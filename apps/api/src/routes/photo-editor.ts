/**
 * Редактор фото в API v1: загрузка состояния фото и photo_edits (с локализованными подписями, пределами и слотом
 * книги), сохранение правки с серверным рендером через sharp + applyColor и «Вернуть оригинал».
 * Сборка DTO вынесена в authoring/ui/photoEditorView.ts (общая с бэкендом на Nest).
 */
import type { z } from "zod";
import type { PhotoEditorResult, PhotoEditorState } from "@mybook/contracts";
import { defaultLocale, isLocale } from "@/i18n/config";
import { messagesFor } from "@/i18n/messages";
import { isEmptyEdit, MAX_EDIT_BYTES, parsePhotoEdit } from "@/lib/photo-edit/doc";
import { buildPhotoEditorStateView, resolvePhotoEditorSlot, toPhotoEditorResult } from "@/modules/authoring/ui/photoEditorView";
import { apiBook, apiViewer, HttpError } from "@/server/api";
import { container } from "@/server/container";
import { probeOriginalImage, renderPhotoEdit } from "@/server/photo-edit-render";
import { photosTabData } from "@/server/photos-tab-data";
import { rateLimit } from "@/server/rateLimit";
import type { Handlers } from "../app";

async function photoResult(bookId: string, photoId: string, edited: boolean): Promise<z.output<typeof PhotoEditorResult>> {
  const row = (await container().authoring.queries.photos(bookId)).find((p) => p.id === photoId);
  if (!row) throw new HttpError(404, "photoNotFound");
  return toPhotoEditorResult(row, edited);
}

export const photoEditorHandlers: Pick<Handlers, "photoEditorGet" | "photoEditorSave" | "photoEditorRevert"> = {
  async photoEditorGet({ req, user, input }) {
    const locale = isLocale(user?.locale) ? user.locale : defaultLocale;
    const m = messagesFor(locale);
    const { book, viewer } = await apiBook(req, input.bookId, { editable: true });
    const authoring = container().authoring;
    const state = await authoring.photos.editState(input.bookId, viewer, input.photoId);
    const photo = await authoring.queries.photoFor(input.photoId, viewer);
    if (!photo || photo.bookId !== input.bookId) throw new HttpError(404, "photoNotFound");

    const originalKey = await authoring.photos.originalKey(photo);
    let originalWidth = photo.width;
    let originalHeight = photo.height;
    let suggestedLevels = { black: 0, white: 1, gamma: 1 };
    try {
      const origBytes = await authoring.photoFile(originalKey);
      const probed = await probeOriginalImage(origBytes);
      originalWidth = probed.width;
      originalHeight = probed.height;
      suggestedLevels = probed.suggestedLevels;
    } catch {
      // В тестах без реального изображения в хранилище оставляем размеры строки фото.
    }

    let slot: z.output<typeof PhotoEditorState>["slot"] = null;
    let slotAspect: { key: string; label: string; ratio: number } | null = null;
    try {
      const tab = await photosTabData(book, true, m);
      const resolved = resolvePhotoEditorSlot(book, photo, tab.places, m);
      slot = resolved.slot;
      slotAspect = resolved.slotAspect;
    } catch {
      slot = null;
    }

    return buildPhotoEditorStateView({
      bookId: book.id,
      photo,
      state,
      originalWidth,
      originalHeight,
      suggestedLevels,
      slot,
      slotAspect,
      m,
    });
  },

  async photoEditorSave({ req, input }) {
    const { user, viewer } = await apiViewer(req, input.bookId);
    if (!(await rateLimit(`photo-edit:${user.id}`, 120, 3600_000))) throw new HttpError(429, "photosRate");
    const serialized = JSON.stringify(input.body.edit);
    if (serialized.length > MAX_EDIT_BYTES) throw new HttpError(400, "photoEditInvalid");
    const doc = parsePhotoEdit(input.body.edit);
    if (!doc) throw new HttpError(400, "photoEditInvalid");

    const authoring = container().authoring;
    const current = await authoring.photos.editState(input.bookId, viewer, input.photoId);
    if (current.version !== input.body.version) throw new HttpError(409, "photosOutdated");

    if (isEmptyEdit(doc)) {
      if (current.edit !== null) await authoring.photos.revertEdit(input.bookId, viewer, input.photoId);
      return photoResult(input.bookId, input.photoId, false);
    }

    const photo = await authoring.queries.photoFor(input.photoId, viewer);
    if (!photo || photo.bookId !== input.bookId) throw new HttpError(404, "photoNotFound");
    const originalKey = await authoring.photos.originalKey(photo);
    const origBytes = await authoring.photoFile(originalKey);
    const rendered = await renderPhotoEdit(origBytes, doc);
    await authoring.photos.saveEdit(input.bookId, viewer, input.photoId, {
      bytes: rendered,
      doc,
      version: input.body.version,
    });
    return photoResult(input.bookId, input.photoId, true);
  },

  async photoEditorRevert({ req, input }) {
    const { viewer } = await apiViewer(req, input.bookId);
    await container().authoring.photos.revertEdit(input.bookId, viewer, input.photoId);
    return photoResult(input.bookId, input.photoId, false);
  },
};
