/** Помощники семьи обложек «collection»: рамки, градиенты, мотивы. */
import { n, petalPath } from "../svg-kit";
import type { CoverGeometry, Rect } from "../../formats";
import { RAM } from "../../motifs";

/** Прямоугольная рамка с отступом от краёв лицевой стороны. */
export function frame(f: Rect, inset: number, stroke: string, width: number, rx = 0) {
  return `<rect x="${n(f.x + inset)}" y="${n(f.y + inset)}" width="${n(f.w - inset * 2)}" height="${n(f.h - inset * 2)}" rx="${rx}" fill="none" stroke="${stroke}" stroke-width="${width}"/>`;
}

/** Вертикальный градиент на весь холст. */
export function vGradient(g: CoverGeometry, id: string, stops: [number, string][]) {
  const s = stops.map(([o, c]) => `<stop offset="${o}" stop-color="${c}"/>`).join("");
  return `<defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1">${s}</linearGradient></defs><rect width="${n(g.width)}" height="${n(g.height)}" fill="url(#${id})"/>`;
}

// ─── Ою: казахский орнамент «кошкар-муйиз» золотом по изумруду ────────────────

export function ram(x: number, y: number, s: number, color: string, w: number, rot = 0) {
  return `<path d="${RAM}" fill="none" stroke="${color}" stroke-width="${n(w / s)}" stroke-linecap="round" stroke-linejoin="round" transform="translate(${n(x)},${n(y)}) rotate(${rot}) scale(${n(s)}) translate(-0.5,-0.5)"/>`;
}

/** Розетка из четырёх рогов, обращённых наружу, — медальон казахского орнамента. */
export function rosette(x: number, y: number, s: number, color: string, w: number) {
  let out = "";
  for (const rot of [0, 90, 180, 270]) out += ram(x, y, s, color, w, rot).replace("translate(-0.5,-0.5)", "translate(-0.5,-0.95)");
  const d = s * 0.09;
  out += `<path d="M${n(x)},${n(y - d)} L${n(x + d)},${n(y)} L${n(x)},${n(y + d)} L${n(x - d)},${n(y)}Z" fill="${color}"/>`;
  return out;
}

// ─── Рассвет: акварельные пятна ─────────────────────────────────────────────

/** Акварельное пятно: несколько смещённых полупрозрачных кругов дают «мокрый» край. */
export function wash(x: number, y: number, r: number, color: string, rand: () => number, layers = 5) {
  let out = "";
  for (let i = 0; i < layers; i++) {
    const rr = r * (0.7 + rand() * 0.45);
    out += `<ellipse cx="${n(x + (rand() - 0.5) * r * 0.5)}" cy="${n(y + (rand() - 0.5) * r * 0.5)}" rx="${n(rr)}" ry="${n(rr * (0.8 + rand() * 0.3))}" fill="${color}" fill-opacity="${n(0.12 + rand() * 0.1)}"/>`;
  }
  return out;
}

// ─── Гербарий: засушенная веточка на бумаге, приклеенная скотчем ─────────────

export function sprig(x: number, y: number, h: number, rand: () => number, lean = 0) {
  const stroke = "#5E6A45";
  const top = { x: x + lean, y: y - h };
  const cx = x + lean * 0.2 + h * 0.08;
  let out = `<path d="M${n(x)},${n(y)} Q${n(cx)},${n(y - h * 0.5)} ${n(top.x)},${n(top.y)}" fill="none" stroke="${stroke}" stroke-width="0.45" stroke-linecap="round"/>`;
  const leaves = 9;
  for (let i = 1; i <= leaves; i++) {
    const t = i / (leaves + 1);
    const px = (1 - t) * (1 - t) * x + 2 * (1 - t) * t * cx + t * t * top.x;
    const py = (1 - t) * (1 - t) * y + 2 * (1 - t) * t * (y - h * 0.5) + t * t * top.y;
    const side = i % 2 ? 1 : -1;
    const len = h * (0.16 - t * 0.07) * (0.85 + rand() * 0.3);
    const ang = -90 + side * (42 + rand() * 16);
    const fill = rand() > 0.5 ? "#9CA67E" : "#B4B98F";
    out += `<path d="${petalPath(len, 0.34)}" fill="${fill}" fill-opacity="0.85" stroke="${stroke}" stroke-width="0.25" transform="translate(${n(px)},${n(py)}) rotate(${n(ang)})"/>`;
    out += `<path d="M0,0 L${n(len * 0.85)},0" stroke="${stroke}" stroke-width="0.15" transform="translate(${n(px)},${n(py)}) rotate(${n(ang)})"/>`;
  }
  // Мелкие цветки у верхушки
  for (let k = 0; k < 3; k++) {
    const fx = top.x + (rand() - 0.5) * h * 0.18;
    const fy = top.y + k * h * 0.07 + rand() * 2;
    const r = h * 0.035;
    let fl = "";
    for (let p = 0; p < 5; p++) fl += `<circle cx="${n(Math.cos((p / 5) * Math.PI * 2) * r)}" cy="${n(Math.sin((p / 5) * Math.PI * 2) * r)}" r="${n(r * 0.75)}" fill="#D9A3A0"/>`;
    out += `<g transform="translate(${n(fx)},${n(fy)})">${fl}<circle r="${n(r * 0.5)}" fill="#C4845F"/></g>`;
  }
  return out;
}

export function tape(x: number, y: number, w: number, h: number, rot: number) {
  return `<rect x="${n(-w / 2)}" y="${n(-h / 2)}" width="${n(w)}" height="${n(h)}" fill="#E9D7B8" fill-opacity="0.85" transform="translate(${n(x)},${n(y)}) rotate(${rot})"/>`;
}

// ─── Тюльпаны: минимализм в духе ризографии ─────────────────────────────────

export function tulip(x: number, baseY: number, h: number, color: string, dark: string, rand: () => number) {
  const bend = (rand() - 0.5) * h * 0.18;
  const topX = x + bend;
  const topY = baseY - h;
  const w = h * 0.13;
  let out = `<path d="M${n(x)},${n(baseY)} Q${n(x + bend * 0.2)},${n(baseY - h * 0.5)} ${n(topX)},${n(topY)}" fill="none" stroke="#6F8B5A" stroke-width="0.9" stroke-linecap="round"/>`;
  const side = rand() > 0.5 ? 1 : -1;
  // Ланцетный лист, отклонённый от стебля
  const tipX = x + side * w * 2.2;
  const tipY = baseY - h * 0.6;
  out += `<path d="M${n(x)},${n(baseY)} C${n(x + side * w * 1.9)},${n(baseY - h * 0.12)} ${n(x + side * w * 2.6)},${n(baseY - h * 0.4)} ${n(tipX)},${n(tipY)} C${n(x + side * w * 1.2)},${n(baseY - h * 0.42)} ${n(x + side * w * 0.3)},${n(baseY - h * 0.2)} ${n(x)},${n(baseY)}Z" fill="#7E9A67"/>`;
  out += `<path d="M${n(x + side * w * 0.2)},${n(baseY - h * 0.03)} Q${n(x + side * w * 1.5)},${n(baseY - h * 0.3)} ${n(tipX)},${n(tipY)}" fill="none" stroke="#5F7A4C" stroke-width="0.3"/>`;
  // Бутон: три лепестка
  out += `<path d="M${n(topX - w)},${n(topY - w * 0.2)} C${n(topX - w * 1.05)},${n(topY - w * 1.6)} ${n(topX - w * 0.4)},${n(topY - w * 2.1)} ${n(topX - w * 0.15)},${n(topY - w * 1.4)} L${n(topX)},${n(topY - w * 2.2)} L${n(topX + w * 0.15)},${n(topY - w * 1.4)} C${n(topX + w * 0.4)},${n(topY - w * 2.1)} ${n(topX + w * 1.05)},${n(topY - w * 1.6)} ${n(topX + w)},${n(topY - w * 0.2)} C${n(topX + w * 0.8)},${n(topY + w * 0.7)} ${n(topX - w * 0.8)},${n(topY + w * 0.7)} ${n(topX - w)},${n(topY - w * 0.2)}Z" fill="${color}"/>`;
  out += `<path d="M${n(topX)},${n(topY - w * 2.2)} C${n(topX + w * 0.5)},${n(topY - w * 1.2)} ${n(topX + w * 0.4)},${n(topY + w * 0.2)} ${n(topX)},${n(topY + w * 0.45)}" fill="none" stroke="${dark}" stroke-width="0.35" stroke-opacity="0.6"/>`;
  return out;
}

// ─── Горы: закат над хребтами ───────────────────────────────────────────────

export function ridge(g: CoverGeometry, baseY: number, amp: number, step: number, color: string, rand: () => number) {
  let d = `M0,${n(g.height)} L0,${n(baseY)}`;
  for (let x = 0; x <= g.width + step; x += step * (0.6 + rand() * 0.8)) {
    d += ` L${n(x)},${n(baseY - rand() * amp)}`;
  }
  return `<path d="${d} L${n(g.width)},${n(g.height)}Z" fill="${color}"/>`;
}
