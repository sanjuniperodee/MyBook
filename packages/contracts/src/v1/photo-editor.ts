/**
 * Редактор фото в API v1 (ADR 0012): состояние фото и текущей правки photo_edits, локализованные подписи и пределы
 * инструментов/ползунков/фильтров с сайта, сохранение правки (с рендером и пересборкой миниатюры на сервере через
 * sharp) и сброс к оригиналу.
 */
import { z } from "zod";
import { route, schemas, uuid, type RouteDef } from "./core";

export const PHOTO_EDITOR_ADJUST_KEYS = [
  "brightness",
  "contrast",
  "highlights",
  "shadows",
  "saturation",
  "warmth",
  "tint",
  "fade",
  "vignette",
  "sharpen",
] as const;

export const PHOTO_EDITOR_FILTER_IDS = [
  "none",
  "vivid",
  "warm",
  "cool",
  "soft",
  "film",
  "vintage",
  "drama",
  "bw",
  "noir",
  "sepia",
  "fade",
] as const;

export const PhotoEditRect = z
  .object({
    x: z.number().min(0).max(1),
    y: z.number().min(0).max(1),
    w: z.number().min(0.01).max(1),
    h: z.number().min(0.01).max(1),
  })
  .register(schemas, { id: "PhotoEditRect" });

export const PhotoEditGeometry = z
  .object({
    turns: z.number().int().min(0).max(3),
    flip: z.boolean(),
    straighten: z.number().min(-45).max(45),
    crop: PhotoEditRect.nullable(),
    aspect: z.string().max(16),
  })
  .register(schemas, { id: "PhotoEditGeometry" });

export const PhotoEditLevels = z
  .object({
    black: z.number().min(0).max(0.5),
    white: z.number().min(0.5).max(1),
    gamma: z.number().min(0.3).max(3),
  })
  .register(schemas, { id: "PhotoEditLevels" });

export const PhotoEditFilter = z
  .object({
    id: z.enum(PHOTO_EDITOR_FILTER_IDS),
    strength: z.number().min(0).max(100),
  })
  .register(schemas, { id: "PhotoEditFilter" });

export const PhotoEditDoc = z
  .object({
    v: z.number().int().min(1).max(1),
    geometry: PhotoEditGeometry,
    adjust: z.record(z.string(), z.number()),
    levels: PhotoEditLevels.nullable(),
    filter: PhotoEditFilter,
    layers: z.array(z.record(z.string(), z.unknown())).max(80),
  })
  .register(schemas, { id: "PhotoEditDoc" });

export const PhotoEditorAspect = z
  .object({
    key: z.string(),
    label: z.string(),
    /** Соотношение сторон (w/h); null — свободный кадр. */
    ratio: z.number().nullable(),
  })
  .register(schemas, { id: "PhotoEditorAspect" });

export const PhotoEditorAdjustControl = z
  .object({
    key: z.enum(PHOTO_EDITOR_ADJUST_KEYS),
    label: z.string(),
    min: z.number(),
    max: z.number(),
    step: z.number(),
    defaultValue: z.number(),
    centered: z.boolean(),
  })
  .register(schemas, { id: "PhotoEditorAdjustControl" });

export const PhotoEditorFilterPreset = z
  .object({
    id: z.enum(PHOTO_EDITOR_FILTER_IDS),
    label: z.string(),
    adjust: z.record(z.string(), z.number()),
    mono: z.number(),
    sepia: z.number(),
    splitShadows: z.array(z.number()).nullable(),
    splitHighlights: z.array(z.number()).nullable(),
  })
  .register(schemas, { id: "PhotoEditorFilterPreset" });

/** Целевой слот фото в книге (для расчёта DPI и пропорции кадра). */
export const PhotoEditorSlot = z
  .object({
    ratio: z.number(),
    widthMm: z.number(),
    heightMm: z.number(),
    /** cover — заполняет рамку с обрезкой (обрез/глава/сетка), contain — вписано целиком. */
    mode: z.enum(["cover", "contain"]),
    label: z.string().nullable(),
    /** circle | arch | null — маска слота на странице (если есть). */
    mask: z.string().nullable(),
  })
  .register(schemas, { id: "PhotoEditorSlot" });

export const PhotoEditorLimits = z
  .object({
    minCropFraction: z.number(),
    smallLongSidePx: z.number().int(),
    minDpi: z.number().int(),
    straightenMin: z.number(),
    straightenMax: z.number(),
    straightenStep: z.number(),
    filterStrengthMin: z.number(),
    filterStrengthMax: z.number(),
    filterStrengthStep: z.number(),
    filterStrengthDefault: z.number(),
    maxLayers: z.number().int(),
  })
  .register(schemas, { id: "PhotoEditorLimits" });

export const PhotoEditorLabels = z
  .object({
    title: z.string(),
    close: z.string(),
    save: z.string(),
    saving: z.string(),
    savingHint: z.string(),
    saved: z.string(),
    unsaved: z.string(),
    reverted: z.string(),
    loading: z.string(),
    loadError: z.string(),
    retry: z.string(),
    undo: z.string(),
    redo: z.string(),
    compare: z.string(),
    compareShort: z.string(),
    more: z.string(),
    resetAll: z.string(),
    revert: z.string(),
    revertTitle: z.string(),
    revertText: z.string(),
    revertYes: z.string(),
    discardTitle: z.string(),
    discardText: z.string(),
    discardYes: z.string(),
    discardNo: z.string(),
    cancel: z.string(),
    done: z.string(),
    toolCrop: z.string(),
    toolAdjust: z.string(),
    toolFilters: z.string(),
    cropAspect: z.string(),
    cropRotateLeft: z.string(),
    cropRotateRight: z.string(),
    cropFlip: z.string(),
    cropStraighten: z.string(),
    cropReset: z.string(),
    cropHint: z.string(),
    /** Шаблон предупреждения о маленьком размере после обрезки: «{px}» заменяется длинной стороной. */
    cropSmallTemplate: z.string(),
    lowRes: z.string(),
    /** Шаблон пояснения о низком DPI: «{dpi}» заменяется эффективным DPI. */
    lowDpiTemplate: z.string(),
    adjustAuto: z.string(),
    adjustAutoHint: z.string(),
    adjustReset: z.string(),
    adjustResetAll: z.string(),
    filterStrength: z.string(),
  })
  .register(schemas, { id: "PhotoEditorLabels" });

export const PhotoEditorState = z
  .object({
    bookId: uuid,
    photoId: uuid,
    editable: z.boolean(),
    edited: z.boolean(),
    version: z.string(),
    width: z.number().int(),
    height: z.number().int(),
    originalWidth: z.number().int(),
    originalHeight: z.number().int(),
    originalUrl: z.string(),
    thumbUrl: z.string(),
    viewUrl: z.string(),
    edit: PhotoEditDoc,
    suggestedLevels: PhotoEditLevels,
    slot: PhotoEditorSlot.nullable(),
    limits: PhotoEditorLimits,
    aspects: z.array(PhotoEditorAspect),
    adjustControls: z.array(PhotoEditorAdjustControl),
    filters: z.array(PhotoEditorFilterPreset),
    labels: PhotoEditorLabels,
  })
  .register(schemas, { id: "PhotoEditorState" });

export const PhotoEditorSaveBody = z
  .object({
    version: z.string().min(1).max(120),
    edit: PhotoEditDoc,
  })
  .strict()
  .register(schemas, { id: "PhotoEditorSaveBody" });

export const PhotoEditorResult = z
  .object({
    photoId: uuid,
    width: z.number().int(),
    height: z.number().int(),
    edited: z.boolean(),
    version: z.string(),
    thumbUrl: z.string(),
    url: z.string(),
  })
  .register(schemas, { id: "PhotoEditorResult" });

export const photoEditorRoutes = {
  photoEditorGet: route({
    method: "GET",
    path: "/api/v1/books/{bookId}/photos/{photoId}/editor",
    auth: "user",
    tag: "photos",
    summary: "Состояние редактора фото: текущая правка photo_edits, оригинал, слот книги, пределы, пресеты и подписи на языке пользователя",
    params: z.object({ bookId: uuid, photoId: uuid }),
    response: PhotoEditorState,
  }),
  photoEditorSave: route({
    method: "PUT",
    path: "/api/v1/books/{bookId}/photos/{photoId}/editor",
    auth: "user",
    tag: "photos",
    summary: "Сохранить правку редактора фото: пересобрать готовую картинку и миниатюру на сервере и записать photo_edits",
    params: z.object({ bookId: uuid, photoId: uuid }),
    body: PhotoEditorSaveBody,
    response: PhotoEditorResult,
  }),
  photoEditorRevert: route({
    method: "DELETE",
    path: "/api/v1/books/{bookId}/photos/{photoId}/editor",
    auth: "user",
    tag: "photos",
    summary: "Сбросить правку редактора фото и вернуть оригинальный снимок",
    params: z.object({ bookId: uuid, photoId: uuid }),
    response: PhotoEditorResult,
  }),
} as const satisfies Record<string, RouteDef>;
