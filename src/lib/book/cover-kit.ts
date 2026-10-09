/**
 * Инструменты для рисования обложек в SVG (единицы — миллиметры развёртки).
 * Правила для скорости растрирования в 300 dpi (librsvg): без per-element opacity (только fill/stroke-opacity),
 * без feTurbulence в самой графике (фактура накладывается отдельно), разумное число элементов.
 */
import type { CoverGeometry, Rect } from "./formats";


export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const n = (v: number) => Math.round(v * 100) / 100;

export function frontRect(g: CoverGeometry, fx: number, fy: number, fw: number, fh: number): Rect {
  return { x: g.front.x + fx * g.front.w, y: g.front.y + fy * g.front.h, w: fw * g.front.w, h: fh * g.front.h };
}

export function grainFilter(id: string, freq = 1.1) {
  return `<filter id="${id}" x="0" y="0" width="100%" height="100%" filterUnits="userSpaceOnUse"><feTurbulence type="fractalNoise" baseFrequency="${freq}" numOctaves="3" seed="7" stitchTiles="stitch"/><feColorMatrix values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0.85 0"/></filter>`;
}

export function linenFilter(id: string) {
  return `<filter id="${id}" x="0" y="0" width="100%" height="100%" filterUnits="userSpaceOnUse"><feTurbulence type="fractalNoise" baseFrequency="1.6 0.07" numOctaves="2" seed="2" result="h"/><feTurbulence type="fractalNoise" baseFrequency="0.07 1.6" numOctaves="2" seed="5" result="v"/><feBlend in="h" in2="v" mode="multiply"/><feColorMatrix values="0 0 0 0 0.3  0 0 0 0 0.25  0 0 0 0 0.18  0 0 0 0.9 0"/></filter>`;
}

export function shadowFilter(id: string) {
  return `<filter id="${id}" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="1.4"/></filter>`;
}

export function bg(g: CoverGeometry, fill: string) {
  return `<rect x="0" y="0" width="${n(g.width)}" height="${n(g.height)}" fill="${fill}"/>`;
}


export function label(r: Rect, fill: string, opts: { stroke?: string; shadowId?: string; rx?: number; inset?: number } = {}) {
  const rx = opts.rx ?? 0.6;
  let out = "";
  if (opts.shadowId)
    out += `<rect x="${n(r.x + 0.4)}" y="${n(r.y + 0.9)}" width="${n(r.w)}" height="${n(r.h)}" rx="${rx}" fill="#000" opacity="0.28" filter="url(#${opts.shadowId})"/>`;
  out += `<rect x="${n(r.x)}" y="${n(r.y)}" width="${n(r.w)}" height="${n(r.h)}" rx="${rx}" fill="${fill}"/>`;
  if (opts.stroke) {
    const i = opts.inset ?? 2.2;
    out += `<rect x="${n(r.x + i)}" y="${n(r.y + i)}" width="${n(r.w - i * 2)}" height="${n(r.h - i * 2)}" rx="${Math.max(0, rx - 0.3)}" fill="none" stroke="${opts.stroke}" stroke-width="0.3"/>`;
  }
  return out;
}

export function petalPath(r: number, width = 0.42) {
  return `M0,0 C${n(r * 0.35)},${n(-r * width)} ${n(r * 0.95)},${n(-r * width * 0.8)} ${n(r)},0 C${n(r * 0.95)},${n(r * width * 0.8)} ${n(r * 0.35)},${n(r * width)} 0,0Z`;
}

// ─── фото ───────────────────────────────────────────────────────────────────

export interface ArtContext {
  uid: string;
  /** Фото клиента по местам шаблона (data-URL или адрес). Пустое место — пейзаж-заглушка. */
  photos?: (string | undefined)[];
  /** Снимок самого шаблона (обложки на готовых снимках): data-URL для растрирования, иначе — адрес /api/cover-photos. */
  imageHref?: string;
  /** "decor" — только плашка и рамка: так оборот повторяет композицию лица, не рисуя снимок второй раз. */
  layer?: "decor";
}

/** Снимок, заполняющий прямоугольник целиком: лишнее обрезается по центру, как object-fit: cover. */
export function photoImage(href: string, r: Rect) {
  return `<image href="${href.replace(/&/g, "&amp;")}" x="${n(r.x)}" y="${n(r.y)}" width="${n(r.w)}" height="${n(r.h)}" preserveAspectRatio="xMidYMid slice"/>`;
}

const SCENES = [
  { sky: ["#F8DFCF", "#F0B9A9", "#CFA0B6"], sun: "#FFF5E8", hills: ["#DDA6A6", "#B47F95", "#7C5975"], bird: "#7C5975" },
  { sky: ["#E6F0F2", "#C7DCE3", "#A2BFCD"], sun: "#FFFFFF", hills: ["#AFC5B8", "#83A292", "#577A6C"], bird: "#4F6E62" },
  { sky: ["#FCEDD6", "#F6D0A6", "#EAA97F"], sun: "#FFF9EE", hills: ["#E0AB7E", "#C2805B", "#88543E"], bird: "#7A4A36" },
  { sky: ["#EEE7F3", "#D6C9E5", "#AC9DCA"], sun: "#FFF9FF", hills: ["#A193C2", "#7A6D9E", "#574C75"], bird: "#4E4469" },
];

/** Плавный холм через случайные вершины: кубические кривые (одинаково рисуют браузер и librsvg). */
function hill(r: Rect, base: number, amp: number, color: string, rand: () => number) {
  const k = 4;
  const pts = Array.from({ length: k + 1 }, (_, i) => ({ x: r.x + (r.w * i) / k, y: base - rand() * amp }));
  let d = `M${n(r.x)},${n(r.y + r.h)} L${n(pts[0].x)},${n(pts[0].y)}`;
  for (let i = 0; i < k; i++) {
    const mx = (pts[i].x + pts[i + 1].x) / 2;
    d += ` C${n(mx)},${n(pts[i].y)} ${n(mx)},${n(pts[i + 1].y)} ${n(pts[i + 1].x)},${n(pts[i + 1].y)}`;
  }
  return `<path d="${d} L${n(r.x + r.w)},${n(r.y + r.h)}Z" fill="${color}"/>`;
}

/**
 * Заглушка вместо фото: нежный пейзаж — небо, солнце, холмы, птицы. Видна в каталоге и в редакторе,
 * пока клиент не выбрал снимок; в печать не попадает (без фото заказ не оформить).
 */
export function samplePhoto(r: Rect, scene: number, uid: string) {
  const s = SCENES[((scene % SCENES.length) + SCENES.length) % SCENES.length];
  const rand = rng(scene * 31 + 7);
  const id = `${uid}sky`;
  const m = Math.min(r.w, r.h);
  let out = `<defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${s.sky[0]}"/><stop offset="0.55" stop-color="${s.sky[1]}"/><stop offset="1" stop-color="${s.sky[2]}"/></linearGradient></defs>`;
  out += `<rect x="${n(r.x)}" y="${n(r.y)}" width="${n(r.w)}" height="${n(r.h)}" fill="url(#${id})"/>`;
  const sx = r.x + r.w * (0.32 + rand() * 0.36);
  const sy = r.y + r.h * 0.44;
  out += `<circle cx="${n(sx)}" cy="${n(sy)}" r="${n(m * 0.17)}" fill="${s.sun}" fill-opacity="0.35"/><circle cx="${n(sx)}" cy="${n(sy)}" r="${n(m * 0.105)}" fill="${s.sun}" fill-opacity="0.95"/>`;
  s.hills.forEach((c, i) => (out += hill(r, r.y + r.h * (0.6 + i * 0.12), r.h * (0.1 - i * 0.02), c, rand)));
  const b = m * 0.022;
  for (let i = 0; i < 3; i++) {
    const x = r.x + r.w * (0.18 + i * 0.07 + rand() * 0.03);
    const y = r.y + r.h * (0.24 + rand() * 0.08);
    out += `<path d="M${n(x - b)},${n(y)} q${n(b / 2)},${n(-b * 0.6)} ${n(b)},0 q${n(b / 2)},${n(-b * 0.6)} ${n(b)},0" fill="none" stroke="${s.bird}" stroke-width="${n(Math.max(0.2, b * 0.18))}" stroke-opacity="0.7"/>`;
  }
  return out;
}

/**
 * Место под фото в шаблоне: снимок клиента или пейзаж-заглушка. clip — контур формы (арка, сердце,
 * овал) в тех же миллиметрах; прямоугольник обрезает сам снимок (preserveAspectRatio slice).
 */
export function photoSlot(ctx: ArtContext, i: number, r: Rect, opts: { clip?: string; clipTransform?: string; scene?: number } = {}) {
  const href = ctx.photos?.[i];
  const body = href ? photoImage(href, r) : samplePhoto(r, opts.scene ?? i, `${ctx.uid}p${i}`);
  if (!opts.clip) return body;
  const id = `${ctx.uid}k${i}`;
  return `<clipPath id="${id}"><path d="${opts.clip}"${opts.clipTransform ? ` transform="${opts.clipTransform}"` : ""}/></clipPath><g clip-path="url(#${id})">${body}</g>`;
}

/** Точки на «дрожащей» сетке, покрывающей весь холст (с выходом за край). */
export function jitterGrid(g: CoverGeometry, cell: number, rand: () => number) {
  const pts: { x: number; y: number }[] = [];
  for (let y = -cell / 2; y < g.height + cell; y += cell * 0.86) {
    const row = Math.round(y / cell);
    for (let x = -cell / 2 + (row % 2 ? cell / 2 : 0); x < g.width + cell; x += cell) {
      pts.push({ x: x + (rand() - 0.5) * cell * 0.7, y: y + (rand() - 0.5) * cell * 0.6 });
    }
  }
  return pts;
}

/** Пейзаж-заглушка отдельной картинкой (data-URL) — для превью страниц, пока своих фото нет. ratio — ширина к высоте. */
export function samplePhotoUrl(scene: number, ratio = 4 / 3) {
  const w = Math.round(100 * ratio);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} 100" preserveAspectRatio="xMidYMid slice">${samplePhoto({ x: 0, y: 0, w, h: 100 }, scene, "s")}</svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}
