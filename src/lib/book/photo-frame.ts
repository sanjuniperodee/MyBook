/**
 * Кадр фото на обложке: масштаб и положение внутри своего места.
 *
 * Фото всегда заполняет место целиком (как object-fit: cover), а кадр сдвигает и увеличивает его:
 *  - zoom — во сколько раз крупнее «по размеру места» (1…4);
 *  - x, y — положение как у CSS object-position: 0 — снимок прижат к левому/верхнему краю, 1 — к правому/нижнему, 0.5 — по центру.
 * Одна и та же математика рисует кадр везде: в SVG (печать, 3D), в HTML-превью и в обороте.
 */
export interface PhotoFrame {
  zoom: number;
  x: number;
  y: number;
}

export interface FrameRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export const MAX_ZOOM = 4;
export const DEFAULT_FRAME: PhotoFrame = { zoom: 1, x: 0.5, y: 0.5 };

/** Кадры по местам: ключ — «cover:0» (лицо) или «back:1» (оборот) и номер места. */
export type FrameMap = Record<string, PhotoFrame>;

export const frameKey = (side: "cover" | "back", slot: number) => `${side}:${slot}`;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const num = (v: unknown, fallback: number) => (typeof v === "number" && Number.isFinite(v) ? v : fallback);
const round = (v: number) => Math.round(v * 1000) / 1000;

export function normalizeFrame(raw: unknown): PhotoFrame {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  return { zoom: round(clamp(num(o.zoom, 1), 1, MAX_ZOOM)), x: round(clamp(num(o.x, 0.5), 0, 1)), y: round(clamp(num(o.y, 0.5), 0, 1)) };
}

export function isDefaultFrame(f: PhotoFrame | null | undefined) {
  return !f || (f.zoom === 1 && f.x === 0.5 && f.y === 0.5);
}

const KEY = /^(cover|back):\d{1,2}$/;

/** Кадры из базы или запроса: лишние ключи отбрасываются, числа ограничиваются, кадры «по умолчанию» не хранятся. */
export function parseFrames(raw: unknown): FrameMap {
  const out: FrameMap = {};
  if (!raw || typeof raw !== "object") return out;
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!KEY.test(k)) continue;
    const f = normalizeFrame(v);
    if (!isDefaultFrame(f)) out[k] = f;
  }
  return out;
}

/** Где рисуется снимок внутри места box: масштаб «по размеру места» × zoom, смещение — по object-position. */
export function framedImageRect(box: FrameRect, img: { width: number; height: number }, frame: PhotoFrame): FrameRect {
  const f = normalizeFrame(frame);
  const s = Math.max(box.w / img.width, box.h / img.height) * f.zoom;
  const w = img.width * s;
  const h = img.height * s;
  return { x: box.x + (box.w - w) * f.x, y: box.y + (box.h - h) * f.y, w, h };
}

/**
 * То же самое для HTML: <img> с object-fit: cover, object-position и scale вокруг той же точки —
 * результат совпадает с framedImageRect (scale вокруг точки (px·W, py·H) эквивалентен смещению (W − w)·p).
 */
export function cssFrame(frame: PhotoFrame | null | undefined): { objectPosition?: string; transform?: string; transformOrigin?: string } {
  if (isDefaultFrame(frame)) return {};
  const f = normalizeFrame(frame);
  const pos = `${round(f.x * 100)}% ${round(f.y * 100)}%`;
  return { objectPosition: pos, transform: f.zoom === 1 ? undefined : `scale(${f.zoom})`, transformOrigin: pos };
}

/** Сколько пикселей снимка «лишнего» по каждой оси внутри места: на столько его можно двигать. */
export function panRange(box: { w: number; h: number }, img: { width: number; height: number }, zoom: number) {
  const s = Math.max(box.w / img.width, box.h / img.height) * zoom;
  return { x: Math.max(0, img.width * s - box.w), y: Math.max(0, img.height * s - box.h) };
}

/** Перетаскивание: палец сдвинулся на (dx, dy) пикселей — снимок едет вместе с ним. */
export function panFrame(frame: PhotoFrame, box: { w: number; h: number }, img: { width: number; height: number }, dx: number, dy: number): PhotoFrame {
  const f = normalizeFrame(frame);
  const r = panRange(box, img, f.zoom);
  return normalizeFrame({ zoom: f.zoom, x: r.x > 0.5 ? f.x - dx / r.x : f.x, y: r.y > 0.5 ? f.y - dy / r.y : f.y });
}

export function zoomFrame(frame: PhotoFrame, zoom: number): PhotoFrame {
  return normalizeFrame({ ...normalizeFrame(frame), zoom });
}
