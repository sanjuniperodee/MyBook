/**
 * Редактор фото в API v1: загрузка состояния фото и photo_edits (с локализованными подписями, пределами и слотом
 * книги), сохранение правки с серверным рендером через sharp + applyColor и «Вернуть оригинал».
 * Права и блокировка заказанных книг — те же, что на сайте (PhotosService.editState / saveEdit / revertEdit).
 */
import type { z } from "zod";
import type { PhotoEditorResult, PhotoEditorState } from "@mybook/contracts";
import { defaultLocale, isLocale } from "@/i18n/config";
import { messagesFor } from "@/i18n/messages";
import { getFormat } from "@/lib/book/formats";
import { getInteriorDesign } from "@/lib/book/interiors/catalog";
import { photoAreaMm } from "@/lib/book/layout";
import { FILTERS } from "@/lib/photo-edit/color";
import { ADJUST_KEYS, ADJUST_RANGE, emptyEdit, FILTER_IDS, isEmptyEdit, MAX_EDIT_BYTES, MAX_LAYERS, parsePhotoEdit, photoVersion } from "@/lib/photo-edit/doc";
import { cropFrameOf, type PhotoLayout } from "@/app/(app)/books/[id]/photos/photos-tab";
import { photosTabData } from "@/app/(app)/books/[id]/photos/photos-data";
import { apiBook, apiViewer, HttpError } from "@/server/api";
import { container } from "@/server/container";
import { probeOriginalImage, renderPhotoEdit } from "@/server/photo-edit-render";
import { rateLimit } from "@/server/rateLimit";
import type { Handlers } from "../app";

const ASPECT_KEYS = ["free", "original", "1:1", "4:5", "3:4", "2:3", "4:3", "3:2", "16:9"] as const;
const PLACEHOLDER_NUM = 987654;

function parseRatio(a: string): number | null {
  const m = /^(\d+):(\d+)$/.exec(a);
  return m ? Number(m[1]) / Number(m[2]) : null;
}

const frameLabelKey = (kind: string): "opener" | "page" | "cell" => (kind === "page" ? "page" : kind === "grid" ? "cell" : "opener");

const photoUrlV = (photoId: string, size: "thumb" | "view" | "original", version: string) => `/api/photos/${photoId}?size=${size}&v=${encodeURIComponent(version)}`;

async function photoResult(bookId: string, photoId: string, edited: boolean): Promise<z.output<typeof PhotoEditorResult>> {
  const row = (await container().authoring.queries.photos(bookId)).find((p) => p.id === photoId);
  if (!row) throw new HttpError(404, "photoNotFound");
  const version = photoVersion(row.storageKey);
  return {
    photoId: row.id,
    width: row.width,
    height: row.height,
    edited,
    version,
    thumbUrl: photoUrlV(row.id, "thumb", version),
    url: photoUrlV(row.id, "view", version),
  };
}

export const photoEditorHandlers: Pick<Handlers, "photoEditorGet" | "photoEditorSave" | "photoEditorRevert"> = {
  async photoEditorGet({ req, user, input }) {
    const locale = isLocale(user?.locale) ? user.locale : defaultLocale;
    const m = messagesFor(locale);
    const t = m.editor.photoEditor;
    const { book, viewer } = await apiBook(req, input.bookId, { editable: true });
    const authoring = container().authoring;
    // editState проверяет права, черновик книги и существование фото — те же правила, что на сайте.
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

    // Слот фото в книге (формат, дизайн, место на странице) — для подсказки DPI и пропорции кадра.
    let slot: z.output<typeof PhotoEditorState>["slot"] = null;
    let slotAspect: { key: string; label: string; ratio: number } | null = null;
    try {
      const tab = await photosTabData(book, true, m);
      const place = new Map(tab.places).get(photo.id);
      if (place?.kind !== "off") {
        const fmt = getFormat(book.format);
        const design = getInteriorDesign(book.interior);
        const layout = (photo.layout || "full") as PhotoLayout;
        const frame = cropFrameOf(place, layout, fmt, design);
        if (frame) {
          const label = m.editor.crop.frameLabel[frameLabelKey(frame.kind)];
          slot = { ratio: frame.ratio, widthMm: frame.w, heightMm: frame.h, mode: "cover", label, mask: frame.mask ?? null };
          slotAspect = { key: "slot", label, ratio: frame.ratio };
        } else {
          const area = photoAreaMm(fmt, layout);
          slot = { ratio: area.w / area.h, widthMm: area.w, heightMm: area.h, mode: layout === "bleed" ? "cover" : "contain", label: null, mask: null };
        }
      }
    } catch {
      slot = null;
    }

    const doc = state.edit ?? emptyEdit();
    const adjustRecord: Record<string, number> = {};
    for (const key of ADJUST_KEYS) {
      const v = doc.adjust[key];
      if (typeof v === "number" && v !== 0) adjustRecord[key] = v;
    }

    const aspects = [
      { key: "free", label: t.crop.aspects.free, ratio: null },
      { key: "original", label: t.crop.aspects.original, ratio: originalWidth / Math.max(1, originalHeight) },
      ...(slotAspect ? [slotAspect] : []),
      ...ASPECT_KEYS.filter((k) => k !== "free" && k !== "original").map((k) => ({ key: k, label: t.crop.aspects[k] ?? k, ratio: parseRatio(k) })),
    ];

    return {
      bookId: book.id,
      photoId: photo.id,
      editable: true,
      edited: state.edit !== null,
      version: state.version,
      width: photo.width,
      height: photo.height,
      originalWidth,
      originalHeight,
      originalUrl: photoUrlV(photo.id, "original", state.version),
      thumbUrl: photoUrlV(photo.id, "thumb", state.version),
      viewUrl: photoUrlV(photo.id, "view", state.version),
      edit: {
        v: 1,
        geometry: doc.geometry,
        adjust: adjustRecord,
        levels: doc.levels,
        filter: doc.filter,
        layers: doc.layers as unknown as Record<string, unknown>[],
      },
      suggestedLevels,
      slot,
      limits: {
        minCropFraction: 0.02,
        smallLongSidePx: 1200,
        minDpi: 150,
        straightenMin: -45,
        straightenMax: 45,
        straightenStep: 0.5,
        filterStrengthMin: 0,
        filterStrengthMax: 100,
        filterStrengthStep: 1,
        filterStrengthDefault: 100,
        maxLayers: MAX_LAYERS,
      },
      aspects,
      adjustControls: ADJUST_KEYS.map((key) => {
        const [min, max] = ADJUST_RANGE[key];
        return { key, label: t.adjust.names[key], min, max, step: 1, defaultValue: 0, centered: min < 0 };
      }),
      filters: FILTER_IDS.map((id) => {
        const def = FILTERS[id];
        const adjust: Record<string, number> = {};
        for (const [k, v] of Object.entries(def.adjust ?? {})) if (typeof v === "number") adjust[k] = v;
        return {
          id,
          label: t.filters.names[id],
          adjust,
          mono: def.mono ?? 0,
          sepia: def.sepia ?? 0,
          splitShadows: def.split ? [...def.split.shadows] : null,
          splitHighlights: def.split ? [...def.split.highlights] : null,
        };
      }),
      labels: {
        title: t.title,
        close: t.close,
        save: t.save,
        saving: t.saving,
        savingHint: t.savingHint,
        saved: t.saved,
        unsaved: t.unsaved,
        reverted: t.reverted,
        loading: t.loading,
        loadError: t.loadError,
        retry: t.retry,
        undo: t.undo,
        redo: t.redo,
        compare: t.compare,
        compareShort: t.compareShort,
        more: t.more,
        resetAll: t.resetAll,
        revert: t.revert,
        revertTitle: t.revertTitle,
        revertText: t.revertText,
        revertYes: t.revertYes,
        discardTitle: t.discardTitle,
        discardText: t.discardText,
        discardYes: t.discardYes,
        discardNo: t.discardNo,
        cancel: t.cancel,
        done: t.done,
        toolCrop: t.tools.crop,
        toolAdjust: t.tools.adjust,
        toolFilters: t.tools.filters,
        cropAspect: t.crop.aspect,
        cropRotateLeft: t.crop.rotateLeft,
        cropRotateRight: t.crop.rotateRight,
        cropFlip: t.crop.flip,
        cropStraighten: t.crop.straighten,
        cropReset: t.crop.reset,
        cropHint: t.crop.hint,
        cropSmallTemplate: t.crop.small(PLACEHOLDER_NUM).replace(String(PLACEHOLDER_NUM), "{px}"),
        lowRes: m.books.photos.lowRes,
        lowDpiTemplate: m.books.photos.dpi(PLACEHOLDER_NUM).replace(String(PLACEHOLDER_NUM), "{dpi}"),
        adjustAuto: t.adjust.auto,
        adjustAutoHint: t.adjust.autoHint,
        adjustReset: t.adjust.reset,
        adjustResetAll: t.adjust.resetAll,
        filterStrength: t.filters.strength,
      },
    };
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

    // Правок не осталось — как в PhotoEditor.tsx: снимаем правку к оригиналу (или ничего не меняем).
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
