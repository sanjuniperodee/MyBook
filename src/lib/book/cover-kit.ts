/**
 * Инструменты для рисования обложек в SVG (единицы — миллиметры развёртки).
 * Правила для скорости растрирования в 300 dpi (librsvg): без per-element opacity (только fill/stroke-opacity),
 * без feTurbulence в самой графике (фактура накладывается отдельно), разумное число элементов.
 */
import type { CoverGeometry, Rect } from "./formats";
import { framedImageRect, isDefaultFrame, type PhotoFrame } from "./photo-frame";


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

/**
 * Фото на обложке: адрес (data-URL) или адрес с размерами и кадром. Кадр (масштаб и положение) нужен
 * размерам снимка: без них фото просто заполняет место по центру.
 */
export interface PhotoSpec {
  href: string;
  width?: number;
  height?: number;
  frame?: PhotoFrame;
}
export type PhotoRef = string | PhotoSpec;

export const photoHref = (p: PhotoRef | null | undefined) => (typeof p === "string" ? p : p?.href);

/** Место под фото, которое рисует шаблон: нужно редактору, чтобы наложить на него управление кадром. */
export interface SlotInfo {
  slot: number;
  rect: Rect;
  /** Есть ли на месте снимок клиента (а не пейзаж-заглушка). */
  filled: boolean;
  /** Карточка повёрнута: угол в градусах и центр поворота, мм холста. */
  rotate?: { deg: number; cx: number; cy: number };
}

export interface ArtContext {
  uid: string;
  /** Фото клиента по местам шаблона (data-URL или адрес, при желании с кадром). Пустое место — пейзаж-заглушка. */
  photos?: (PhotoRef | undefined)[];
  /** Вызывается для каждого места под фото в порядке рисования — так редактор узнаёт их положение. */
  onSlot?: (info: SlotInfo) => void;
  /** Снимок самого шаблона (обложки на готовых снимках): data-URL для растрирования, иначе — адрес /api/cover-photos. */
  imageHref?: string;
  /** "decor" — только плашка и рамка: так оборот повторяет композицию лица, не рисуя снимок второй раз. */
  layer?: "decor";
  /**
   * Адрес снимка-примера из коллекции (assets/cover-photos) по ключу: им заполняются пустые места, пока клиент
   * не выбрал фото. Без него — рисованный пейзаж (там, где внешний снимок не загрузится: картинка-SVG, 3D-книга).
   */
  sampleHref?: (key: string) => string;
  /** Снимки-примеры по местам — renderCoverSvg заполняет из CoverTemplate.samples через sampleHref. */
  samples?: string[];
}

/**
 * Снимок, заполняющий прямоугольник целиком: лишнее обрезается по центру, как object-fit: cover. С кадром и размерами
 * снимок увеличен и сдвинут (src/lib/book/photo-frame.ts): рисуется во вложенном <svg>, который обрезает его по месту.
 */
export function photoImage(ref: PhotoRef, r: Rect) {
  const href = (photoHref(ref) ?? "").replace(/&/g, "&amp;");
  if (typeof ref !== "string" && ref.frame && !isDefaultFrame(ref.frame) && ref.width && ref.height) {
    const d = framedImageRect({ x: 0, y: 0, w: r.w, h: r.h }, { width: ref.width, height: ref.height }, ref.frame);
    return `<svg x="${n(r.x)}" y="${n(r.y)}" width="${n(r.w)}" height="${n(r.h)}" viewBox="0 0 ${n(r.w)} ${n(r.h)}" overflow="hidden"><image href="${href}" x="${n(d.x)}" y="${n(d.y)}" width="${n(d.w)}" height="${n(d.h)}" preserveAspectRatio="none"/></svg>`;
  }
  return `<image href="${href}" x="${n(r.x)}" y="${n(r.y)}" width="${n(r.w)}" height="${n(r.h)}" preserveAspectRatio="xMidYMid slice"/>`;
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
export function photoSlot(
  ctx: ArtContext,
  i: number,
  r: Rect,
  opts: { clip?: string; clipTransform?: string; scene?: number; filter?: string; rotate?: SlotInfo["rotate"] } = {},
) {
  const ref = ctx.photos?.[i];
  const filled = !!photoHref(ref);
  ctx.onSlot?.({ slot: i, rect: r, filled, ...(opts.rotate ? { rotate: opts.rotate } : {}) });
  const sample = ctx.samples?.length ? ctx.samples[i % ctx.samples.length] : undefined;
  let body = ref && filled ? photoImage(ref, r) : sample ? photoImage(sample, r) : samplePhoto(r, opts.scene ?? i, `${ctx.uid}p${i}`);
  if (opts.filter) body = `<g filter="url(#${opts.filter})">${body}</g>`;
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


// ─── детали для обложек с фото клиента ──────────────────────────────────────

/** Тонирование фото: чёрно-белое, сепия, тёплая плёнка, выцветшее (приподнятый чёрный). */
export type PhotoTone = "mono" | "sepia" | "warm" | "fade";

const TONES: Record<PhotoTone, { matrix: string; slope: number; intercept: number }> = {
  mono: { matrix: "0.3 0.59 0.11 0 0 0.3 0.59 0.11 0 0 0.3 0.59 0.11 0 0 0 0 0 1 0", slope: 1.14, intercept: -0.06 },
  sepia: { matrix: "0.36 0.66 0.16 0 0.03 0.31 0.6 0.14 0 0.02 0.24 0.47 0.11 0 0.01 0 0 0 1 0", slope: 1.04, intercept: 0.02 },
  warm: { matrix: "1.04 0.06 0 0 0.02 0.02 0.98 0.02 0 0.015 0 0.06 0.84 0 0.02 0 0 0 1 0", slope: 0.96, intercept: 0.03 },
  fade: { matrix: "0.82 0.13 0.05 0 0 0.07 0.85 0.08 0 0 0.05 0.12 0.83 0 0 0 0 0 1 0", slope: 0.84, intercept: 0.09 },
};

export function toneFilter(id: string, tone: PhotoTone) {
  const t = TONES[tone];
  const f = (c: string) => `<feFunc${c} type="linear" slope="${t.slope}" intercept="${t.intercept}"/>`;
  return `<filter id="${id}" x="0" y="0" width="1" height="1" color-interpolation-filters="sRGB"><feColorMatrix type="matrix" values="${t.matrix}"/><feComponentTransfer>${f("R")}${f("G")}${f("B")}</feComponentTransfer></filter>`;
}

/**
 * Тень приподнятой карточки: широкая мягкая и плотная контактная — так карточка «лежит» на бумаге,
 * а не висит над ней. path — контур карточки (по умолчанию прямоугольник r).
 */
export function liftShadow(r: Rect, uid: string, opts: { transform?: string; strength?: number; path?: string } = {}) {
  const k = opts.strength ?? 1;
  const tr = opts.transform ? ` transform="${opts.transform}"` : "";
  const shape = (dx: number, dy: number, attrs: string) =>
    opts.path
      ? `<path d="${opts.path}" ${attrs} transform="translate(${n(dx)} ${n(dy)})${opts.transform ? ` ${opts.transform}` : ""}"/>`
      : `<rect x="${n(r.x + dx)}" y="${n(r.y + dy)}" width="${n(r.w)}" height="${n(r.h)}" ${attrs}${tr}/>`;
  return (
    `<defs><filter id="${uid}w" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="2.6"/></filter><filter id="${uid}c" x="-10%" y="-10%" width="120%" height="120%"><feGaussianBlur stdDeviation="0.5"/></filter></defs>` +
    shape(0.6, 2.2, `fill="#000" fill-opacity="${n(0.22 * k)}" filter="url(#${uid}w)"`) +
    shape(0.15, 0.45, `fill="#000" fill-opacity="${n(0.2 * k)}" filter="url(#${uid}c)"`)
  );
}

/** Полоска скотча с зубчатыми торцами и бликом. cx, cy — центр, deg — поворот. */
export function tape(cx: number, cy: number, w: number, h: number, deg: number, color: string, opacity = 0.82) {
  const teeth = 5;
  const a = h * 0.09;
  let d = `M${n(-w / 2)},${n(-h / 2)} L${n(w / 2)},${n(-h / 2)}`;
  for (let i = 1; i <= teeth; i++) d += ` L${n(w / 2 + (i % 2 ? a : 0))},${n(-h / 2 + (h * i) / teeth)}`;
  d += ` L${n(-w / 2)},${n(h / 2)}`;
  for (let i = teeth - 1; i >= 0; i--) d += ` L${n(-w / 2 - (i % 2 ? a : 0))},${n(-h / 2 + (h * i) / teeth)}`;
  const tr = `translate(${n(cx)},${n(cy)}) rotate(${n(deg)})`;
  return `<g transform="${tr}"><path d="${d}Z" fill="${color}" fill-opacity="${opacity}"/><rect x="${n(-w / 2)}" y="${n(-h / 2 + h * 0.12)}" width="${n(w)}" height="${n(h * 0.22)}" fill="#FFFFFF" fill-opacity="0.22"/></g>`;
}

/** Фигурный край старой фотографии: мелкие полукруглые «зубчики» по всему периметру. */
export function scallopPath(r: Rect, step: number) {
  const nx = Math.max(4, Math.round(r.w / step));
  const ny = Math.max(4, Math.round(r.h / step));
  const sx = r.w / nx;
  const sy = r.h / ny;
  const ax = sx / 2;
  const ay = sy / 2;
  let d = `M${n(r.x)},${n(r.y)}`;
  for (let i = 1; i <= nx; i++) d += ` A${n(ax)},${n(ax * 0.8)} 0 0 1 ${n(r.x + sx * i)},${n(r.y)}`;
  for (let i = 1; i <= ny; i++) d += ` A${n(ay * 0.8)},${n(ay)} 0 0 1 ${n(r.x + r.w)},${n(r.y + sy * i)}`;
  for (let i = nx - 1; i >= 0; i--) d += ` A${n(ax)},${n(ax * 0.8)} 0 0 1 ${n(r.x + sx * i)},${n(r.y + r.h)}`;
  for (let i = ny - 1; i >= 0; i--) d += ` A${n(ay * 0.8)},${n(ay)} 0 0 1 ${n(r.x)},${n(r.y + sy * i)}`;
  return `${d}Z`;
}

/** Рваный край бумаги по горизонтали: ломаная от x0 до x1 вокруг y; down — бумага снизу от края. */
export function tornEdgePath(x0: number, x1: number, y: number, amp: number, seed: number, bottom: number) {
  const rand = rng(seed);
  let d = `M${n(x0)},${n(bottom)} L${n(x0)},${n(y)}`;
  for (let x = x0; x < x1; ) {
    x = Math.min(x1, x + 0.8 + rand() * 2.2);
    d += ` L${n(x)},${n(y + (rand() - 0.5) * amp * 2 + Math.sin(x * 0.07) * amp * 1.4)}`;
  }
  return `${d} L${n(x1)},${n(bottom)}Z`;
}

/** Почтовый штемпель: двойное кольцо и волнистые линии гашения. */
export function postmark(cx: number, cy: number, r: number, color: string, opacity = 0.55) {
  const s = `fill="none" stroke="${color}" stroke-opacity="${opacity}"`;
  let out = `<circle cx="${n(cx)}" cy="${n(cy)}" r="${n(r)}" ${s} stroke-width="0.45"/><circle cx="${n(cx)}" cy="${n(cy)}" r="${n(r * 0.78)}" ${s} stroke-width="0.25"/>`;
  for (let i = 0; i < 4; i++) {
    const y = cy - r * 0.45 + i * r * 0.3;
    let d = `M${n(cx + r * 1.1)},${n(y)}`;
    for (let k = 0; k < 6; k++) d += ` q${n(r * 0.3)},${n(k % 2 ? r * 0.16 : -r * 0.16)} ${n(r * 0.6)},0`;
    out += `<path d="${d}" ${s} stroke-width="0.35"/>`;
  }
  return out;
}
