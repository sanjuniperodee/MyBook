import type { z } from "zod";
import type { PhotoEditorResult, PhotoEditorState } from "@mybook/contracts";
import type { Messages } from "@/i18n/messages";
import { getFormat } from "@/lib/book/formats";
import { getInteriorDesign } from "@/lib/book/interiors/catalog";
import { photoAreaMm } from "@/lib/book/layout";
import { cropFrameOf } from "@/lib/book/photo-pages";
import type { PhotoPlace } from "@/lib/book/photo-place";
import { FILTERS } from "@/lib/photo-edit/color";
import { ADJUST_KEYS, ADJUST_RANGE, emptyEdit, FILTER_IDS, MAX_LAYERS, photoVersion, type Levels, type PhotoEdit } from "@/lib/photo-edit/doc";
import type { BookRow, PhotoRow } from "../infrastructure/queries";

/**
 * Чистые сборщики состояния и ответа редактора фото для API v1 — общие для mybook-api и бэкенда на Nest (ADR 0014).
 */

const ASPECT_KEYS = ["free", "original", "1:1", "4:5", "3:4", "2:3", "4:3", "3:2", "16:9"] as const;
const PLACEHOLDER_NUM = 987654;

function parseRatio(a: string): number | null {
  const m = /^(\d+):(\d+)$/.exec(a);
  return m ? Number(m[1]) / Number(m[2]) : null;
}

const frameLabelKey = (kind: string): "opener" | "page" | "cell" => (kind === "page" ? "page" : kind === "grid" ? "cell" : "opener");

export const photoUrlV = (photoId: string, size: "thumb" | "view" | "original", version: string) =>
  `/api/photos/${photoId}?size=${size}&v=${encodeURIComponent(version)}`;

export function toPhotoEditorResult(row: Pick<PhotoRow, "id" | "width" | "height" | "storageKey">, edited: boolean): z.output<typeof PhotoEditorResult> {
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

export function resolvePhotoEditorSlot(
  book: Pick<BookRow, "format" | "interior">,
  photo: Pick<PhotoRow, "id" | "layout">,
  places: readonly [string, PhotoPlace][],
  m: Messages,
): { slot: z.output<typeof PhotoEditorState>["slot"]; slotAspect: { key: string; label: string; ratio: number } | null } {
  const place = new Map(places).get(photo.id);
  if (place?.kind === "off") return { slot: null, slotAspect: null };
  const fmt = getFormat(book.format);
  const design = getInteriorDesign(book.interior);
  const layout = photo.layout || "full";
  const frame = cropFrameOf(place, layout, fmt, design);
  if (frame) {
    const label = m.editor.crop.frameLabel[frameLabelKey(frame.kind)];
    return {
      slot: { ratio: frame.ratio, widthMm: frame.w, heightMm: frame.h, mode: "cover", label, mask: frame.mask ?? null },
      slotAspect: { key: "slot", label, ratio: frame.ratio },
    };
  }
  const area = photoAreaMm(fmt, layout);
  return {
    slot: { ratio: area.w / area.h, widthMm: area.w, heightMm: area.h, mode: layout === "bleed" ? "cover" : "contain", label: null, mask: null },
    slotAspect: null,
  };
}

export function buildPhotoEditorStateView(input: {
  bookId: string;
  photo: Pick<PhotoRow, "id" | "width" | "height">;
  state: { edit: PhotoEdit | null; version: string };
  originalWidth: number;
  originalHeight: number;
  suggestedLevels: Levels;
  slot: z.output<typeof PhotoEditorState>["slot"];
  slotAspect: { key: string; label: string; ratio: number } | null;
  m: Messages;
}): z.output<typeof PhotoEditorState> {
  const { bookId, photo, state, originalWidth, originalHeight, suggestedLevels, slot, slotAspect, m } = input;
  const t = m.editor.photoEditor;
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
    bookId,
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
      layers: doc.layers.map((layer) => Object.fromEntries(Object.entries(layer))),
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
}
