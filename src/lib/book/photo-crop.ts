/**
 * Кадр фото, выбранный автором: точка, которая остаётся на месте (доли ширины и высоты снимка), и приближение.
 * Применяется везде, где снимок обрезается под место: снимок начальной полосы главы (круг, арка, под обрез),
 * фото под обрез и ячейки сетки. Одна математика для PDF (render.tsx, coverAt) и превью (CropImage): как
 * object-fit: cover + object-position + scale с центром в этой точке.
 */
export interface PhotoCrop {
  x: number;
  y: number;
  zoom: number;
}

export const CROP_ZOOM_MAX = 3;

/** Кадр из запроса или базы: доли в пределах 0…1, приближение 1…CROP_ZOOM_MAX; без кадра — null. */
export function normalizeCrop(raw: Partial<PhotoCrop> | null | undefined): PhotoCrop | null {
  if (!raw || typeof raw !== "object") return null;
  const clamp = (v: unknown, lo: number, hi: number, d: number) => (typeof v === "number" && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d);
  // Центр без приближения — тоже выбор автора (у начальной полосы правило места другое — 30% от верха).
  return { x: clamp(raw.x, 0, 1, 0.5), y: clamp(raw.y, 0, 1, 0.5), zoom: clamp(raw.zoom, 1, CROP_ZOOM_MAX, 1) };
}

/** Кадр снимка с запасным правилом места (например, OPENER_FOCUS у начальной полосы): у автора — его, иначе — запасной. */
export function cropOr(crop: PhotoCrop | null | undefined, fallback: { x: number; y: number }): PhotoCrop {
  return crop ?? { ...fallback, zoom: 1 };
}

/** Поворот снимка на 90° по часовой: точка кадра поворачивается вместе с ним. */
export const rotateCrop = (c: PhotoCrop | null): PhotoCrop | null => (c ? { ...c, x: 1 - c.y, y: c.x } : null);

/** Точка кадра фото на весь лист и в ячейке сетки по умолчанию: центр по горизонтали, 30% от верха (лица обычно выше). */
export const PAGE_FOCUS = { x: 0.5, y: 0.3 } as const;

/**
 * Кадр фото, которое заполняет место с обрезкой (на весь лист, ячейка сетки): ручной кадр автора, иначе точка из
 * редактора фото в ответе (если её двигали), иначе PAGE_FOCUS. Одно правило для PDF и всех превью.
 */
export function fillFocus(p: { crop?: PhotoCrop | null; inline?: { focusX?: number; focusY?: number } | null }): PhotoCrop {
  if (p.crop) return p.crop;
  const fx = p.inline?.focusX;
  const fy = p.inline?.focusY;
  if (typeof fx === "number" && typeof fy === "number" && (fx !== 0.5 || fy !== 0.5)) return { x: fx, y: fy, zoom: 1 };
  return { ...PAGE_FOCUS, zoom: 1 };
}
