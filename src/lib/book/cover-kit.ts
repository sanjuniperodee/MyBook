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

export const HEART = "M0.5,0.92 C0.2,0.72 0,0.52 0,0.3 C0,0.12 0.14,0 0.3,0 C0.4,0 0.47,0.06 0.5,0.15 C0.53,0.06 0.6,0 0.7,0 C0.86,0 1,0.12 1,0.3 C1,0.52 0.8,0.72 0.5,0.92Z";

