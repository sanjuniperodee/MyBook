import type { z } from "zod";
import type { BookModel } from "@mybook/contracts";
import type { Messages } from "@/i18n/messages";
import { AMBIENT, BOARD_MM, BOOK_PAPER, bookDims, INITIAL_VIEW, LIGHT, READ_VIEW, READ_ZOOM, SHADE_MAX, TILT_LIMIT, VIEWS, ZOOM } from "@/lib/book/book-model";
import { sceneForApp } from "@/lib/book/book-scene";
import { COVER_IMAGE_WIDTHS, coverVersion, type CoverBook } from "@/lib/book/cover-image-version";
import { leafCount, RENDER_WINDOW, sheetCount, visibleSpread } from "@/lib/book/flipbook";
import { getFormat } from "@/lib/book/formats";

const VIEW_ORDER = ["front", "spine", "back", "edge", "top", "bottom"] as const;

/**
 * Сборка объёмной модели книги (3D-сцена, размеры, развёртка обложки, ракурсы, подписи) — общая для mybook-api
 * и бэкенда на Nest (ADR 0014).
 */
export function buildBookModelView(book: CoverBook, pages: number, m: Messages["books"]["preview"]): z.output<typeof BookModel> {
  const format = getFormat(book.format);
  const d = bookDims(format, pages);
  const sheets = sheetCount(pages);
  const spreads = Array.from({ length: sheets }, (_, slot) => {
    if (slot === 0) return m.flip.cover;
    if (slot === sheets - 1) return m.flip.backCover;
    const s = visibleSpread(slot, sheets);
    return m.flip.pages(s.left, s.right);
  });
  return {
    pageCount: pages,
    dims: { w: d.w, h: d.h, d: d.d, boardMm: BOARD_MM, block: d.block, spread: d.spread, rects: d.rects },
    spreadUrl: `/api/books/${book.id}/cover-image?side=spread&p=${pages}&v=${coverVersion(book, { side: "spread", pages })}`,
    spreadWidths: [...COVER_IMAGE_WIDTHS],
    sheets,
    leaves: leafCount(pages),
    window: RENDER_WINDOW,
    spreads,
    views: {
      initial: INITIAL_VIEW,
      read: READ_VIEW,
      readZoom: READ_ZOOM,
      zoom: { ...ZOOM },
      tiltLimit: TILT_LIMIT,
      list: VIEW_ORDER.map((id) => ({ id, label: m.model.views[id], ...VIEWS[id] })),
    },
    light: { x: LIGHT[0], y: LIGHT[1], z: LIGHT[2], ambient: AMBIENT, shadeMax: SHADE_MAX },
    paper: { endpaper: [...BOOK_PAPER.endpaper], edge: [...BOOK_PAPER.edge], edgeLine: BOOK_PAPER.edgeLine, stage: [...BOOK_PAPER.stage] },
    scene: sceneForApp(d),
    labels: {
      read: m.model.views.read,
      prev: m.flip.prev,
      next: m.flip.next,
      zoomIn: m.model.zoomIn,
      zoomOut: m.model.zoomOut,
      autoOn: m.model.autoOn,
      autoOff: m.model.autoOff,
      reset: m.model.reset,
      dims: m.model.dims(Math.round(format.widthMm), Math.round(format.heightMm), Math.round(d.d * 10) / 10, pages),
      hint: m.model.hint,
      note: m.model.note,
    },
  };
}
