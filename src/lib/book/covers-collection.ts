/**
 * Вторая коллекция обложек. Все рисуются в SVG в миллиметрах развёртки: одна функция
 * даёт и превью на сайте, и файл для типографии. Правила скорости — в cover-kit.ts.
 */
import type { CoverTemplate } from "./covers";
import type { CoverGeometry, Rect } from "./formats";
import { bg, frontRect, jitterGrid, n, petalPath, rng, shadowFilter } from "./cover-kit";
import { FLEURON, HEART, RAM } from "./motifs";

/** Прямоугольная рамка с отступом от краёв лицевой стороны. */
function frame(f: Rect, inset: number, stroke: string, width: number, rx = 0) {
  return `<rect x="${n(f.x + inset)}" y="${n(f.y + inset)}" width="${n(f.w - inset * 2)}" height="${n(f.h - inset * 2)}" rx="${rx}" fill="none" stroke="${stroke}" stroke-width="${width}"/>`;
}

/** Вертикальный градиент на весь холст. */
function vGradient(g: CoverGeometry, id: string, stops: [number, string][]) {
  const s = stops.map(([o, c]) => `<stop offset="${o}" stop-color="${c}"/>`).join("");
  return `<defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1">${s}</linearGradient></defs><rect width="${n(g.width)}" height="${n(g.height)}" fill="url(#${id})"/>`;
}

// ─── Ою: казахский орнамент «кошкар-муйиз» золотом по изумруду ────────────────

function ram(x: number, y: number, s: number, color: string, w: number, rot = 0) {
  return `<path d="${RAM}" fill="none" stroke="${color}" stroke-width="${n(w / s)}" stroke-linecap="round" stroke-linejoin="round" transform="translate(${n(x)},${n(y)}) rotate(${rot}) scale(${n(s)}) translate(-0.5,-0.5)"/>`;
}

/** Розетка из четырёх рогов, обращённых наружу, — медальон казахского орнамента. */
function rosette(x: number, y: number, s: number, color: string, w: number) {
  let out = "";
  for (const rot of [0, 90, 180, 270]) out += ram(x, y, s, color, w, rot).replace("translate(-0.5,-0.5)", "translate(-0.5,-0.95)");
  const d = s * 0.09;
  out += `<path d="M${n(x)},${n(y - d)} L${n(x + d)},${n(y)} L${n(x)},${n(y + d)} L${n(x - d)},${n(y)}Z" fill="${color}"/>`;
  return out;
}

const oyu: CoverTemplate = {
  id: "oyu",
  mood: "classic",
  texture: { kind: "grain", opacity: 0.14 },
  swatch: "radial-gradient(circle at 50% 50%,transparent 0 30%,#c9a45c 31% 33%,transparent 34%),linear-gradient(160deg,#0f3b34,#0a2a25)",
  art: (g, { uid }) => {
    const f = g.front;
    const gold = "#C9A45C";
    let out = `<defs><radialGradient id="${uid}bg" cx="0.5" cy="0.45" r="0.8"><stop offset="0" stop-color="#14493F"/><stop offset="1" stop-color="#0A2823"/></radialGradient></defs><rect width="${n(g.width)}" height="${n(g.height)}" fill="url(#${uid}bg)"/>`;
    // Тихий фоновый узор по всему холсту
    const step = 22;
    let row = 0;
    for (let y = -step / 2; y < g.height + step; y += step * 0.9, row++) {
      for (let x = (row % 2 ? step / 2 : 0) - step / 2; x < g.width + step; x += step) out += ram(x, y, 11, "#1B574C", 0.4, row % 2 ? 180 : 0);
    }
    // Рамка и фриз из рогов сверху и снизу
    out += frame(f, 8, gold, 0.5) + frame(f, 9.4, gold, 0.2);
    const band = 13.5;
    const cnt = Math.max(5, Math.round((f.w - 24) / 12));
    for (let i = 0; i < cnt; i++) {
      const x = f.x + 12 + ((f.w - 24) * (i + 0.5)) / cnt;
      // Фриз: рога чередуются вверх-вниз, как в тесьме
      out += ram(x, f.y + band, 9, gold, 0.45, i % 2 ? 180 : 0) + ram(x, f.y + f.h - band, 9, gold, 0.45, i % 2 ? 0 : 180);
    }
    out += `<line x1="${n(f.x + 12)}" y1="${n(f.y + band + 5)}" x2="${n(f.x + f.w - 12)}" y2="${n(f.y + band + 5)}" stroke="${gold}" stroke-width="0.25"/><line x1="${n(f.x + 12)}" y1="${n(f.y + f.h - band - 5)}" x2="${n(f.x + f.w - 12)}" y2="${n(f.y + f.h - band - 5)}" stroke="${gold}" stroke-width="0.25"/>`;
    // Медальон-розетка над названием
    out += `<circle cx="${n(f.x + f.w / 2)}" cy="${n(f.y + f.h * 0.3)}" r="${n(f.w * 0.19)}" fill="none" stroke="${gold}" stroke-width="0.3"/>`;
    out += rosette(f.x + f.w / 2, f.y + f.h * 0.3, f.w * 0.15, gold, 0.6);
    if (g.back) out += rosette(g.back.x + g.back.w / 2, g.back.y + g.back.h * 0.8, g.back.w * 0.09, gold, 0.5);
    return out;
  },
  textArea: { x: 0.14, y: 0.52, w: 0.72, h: 0.3 },
  justify: "center",
  title: { font: "cormorant", size: 0.098, color: "#E9CF93", weight: 500, lineHeight: 1.05 },
  subtitle: { font: "cormorant", size: 0.045, color: "#D8BC80", italic: true },
  names: { font: "montserrat", size: 0.025, color: "#C9A45C", weight: 500, upper: true, tracking: 0.28 },
  ornament: { kind: "star", color: "#C9A45C" },
  spine: { color: "#E9CF93", font: "cormorant" },
  back: { color: "#D8BC80", font: "cormorant" },
};

// ─── Рассвет: акварельные пятна ─────────────────────────────────────────────

/** Акварельное пятно: несколько смещённых полупрозрачных кругов дают «мокрый» край. */
function wash(x: number, y: number, r: number, color: string, rand: () => number, layers = 5) {
  let out = "";
  for (let i = 0; i < layers; i++) {
    const rr = r * (0.7 + rand() * 0.45);
    out += `<ellipse cx="${n(x + (rand() - 0.5) * r * 0.5)}" cy="${n(y + (rand() - 0.5) * r * 0.5)}" rx="${n(rr)}" ry="${n(rr * (0.8 + rand() * 0.3))}" fill="${color}" fill-opacity="${n(0.12 + rand() * 0.1)}"/>`;
  }
  return out;
}

const sunrise: CoverTemplate = {
  id: "sunrise",
  mood: "tender",
  texture: { kind: "grain", opacity: 0.08 },
  swatch: "radial-gradient(circle at 70% 70%,#f6c2a0 0 22%,transparent 40%),radial-gradient(circle at 30% 35%,#c9b3d9 0 18%,transparent 36%),#fbf3ea",
  art: (g) => {
    const rand = rng(41);
    const f = g.front;
    let out = bg(g, "#FBF4EC");
    const blobs: [number, number, number, string][] = [
      [0.78, 0.78, 0.42, "#F4B08E"],
      [0.5, 0.92, 0.38, "#EFA2A6"],
      [0.12, 0.2, 0.34, "#C8B2DA"],
      [0.92, 0.46, 0.22, "#F6D79A"],
      [0.25, 0.7, 0.2, "#F3C5B5"],
      [0.62, 0.62, 0.16, "#E98D7F"],
    ];
    for (const [fx, fy, fr, c] of blobs) out += wash(f.x + fx * f.w, f.y + fy * f.h, fr * f.w, c, rand, 6);
    if (g.back) for (const [fx, fy, fr, c] of blobs.slice(0, 3)) out += wash(g.back.x + (1 - fx) * g.back.w, g.back.y + fy * g.back.h, fr * g.back.w * 0.8, c, rand, 4);
    // Солнце
    out += `<circle cx="${n(f.x + f.w * 0.64)}" cy="${n(f.y + f.h * 0.62)}" r="${n(f.w * 0.1)}" fill="#EE8B6A" fill-opacity="0.85"/>`;
    return out;
  },
  textArea: { x: 0.1, y: 0.1, w: 0.8, h: 0.34 },
  justify: "center",
  title: { font: "cormorant", size: 0.108, color: "#4B2B3E", weight: 500, italic: true, lineHeight: 1.02 },
  subtitle: { font: "cormorant", size: 0.046, color: "#7A5468", italic: true },
  names: { font: "montserrat", size: 0.025, color: "#7A5468", weight: 500, upper: true, tracking: 0.26 },
  ornament: { kind: "line", color: "#C98B93" },
  spine: { color: "#4B2B3E", font: "cormorant" },
  back: { color: "#4B2B3E", font: "cormorant" },
};

// ─── Гербарий: засушенная веточка на бумаге, приклеенная скотчем ─────────────

function sprig(x: number, y: number, h: number, rand: () => number, lean = 0) {
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

function tape(x: number, y: number, w: number, h: number, rot: number) {
  return `<rect x="${n(-w / 2)}" y="${n(-h / 2)}" width="${n(w)}" height="${n(h)}" fill="#E9D7B8" fill-opacity="0.85" transform="translate(${n(x)},${n(y)}) rotate(${rot})"/>`;
}

const herbarium: CoverTemplate = {
  id: "herbarium",
  mood: "tender",
  texture: { kind: "linen", opacity: 0.22 },
  swatch: "linear-gradient(160deg,#f4efe4,#e9e1cf)",
  art: (g) => {
    const rand = rng(17);
    const f = g.front;
    let out = bg(g, "#F3EEE2");
    const baseX = f.x + f.w * 0.47;
    const baseY = f.y + f.h * 0.6;
    out += sprig(baseX, baseY, f.h * 0.44, rand, f.w * 0.06);
    out += sprig(baseX + f.w * 0.07, baseY + 2, f.h * 0.3, rand, f.w * 0.16);
    out += tape(baseX + 1.5, baseY - 2, f.w * 0.16, 5.5, -8);
    out += tape(baseX + f.w * 0.08, f.y + f.h * 0.2, f.w * 0.12, 5, 12);
    // Карандашная подпись-этикетка
    out += `<line x1="${n(f.x + f.w * 0.3)}" y1="${n(f.y + f.h * 0.9)}" x2="${n(f.x + f.w * 0.7)}" y2="${n(f.y + f.h * 0.9)}" stroke="#A89C84" stroke-width="0.2"/>`;
    if (g.back) out += sprig(g.back.x + g.back.w * 0.5, g.back.y + g.back.h * 0.55, g.back.h * 0.3, rand, -g.back.w * 0.05) + tape(g.back.x + g.back.w * 0.5, g.back.y + g.back.h * 0.53, g.back.w * 0.14, 5, 6);
    return out;
  },
  textArea: { x: 0.12, y: 0.64, w: 0.76, h: 0.25 },
  justify: "center",
  title: { font: "lora", size: 0.068, color: "#3E4431", weight: 400, italic: true, lineHeight: 1.12 },
  subtitle: { font: "lora", size: 0.036, color: "#6B6A55", italic: true },
  names: { font: "caveat", size: 0.058, color: "#6D5B3F", weight: 500 },
  spine: { color: "#3E4431", font: "lora" },
  back: { color: "#3E4431", font: "lora" },
};

// ─── Созвездие: звёзды, сложенные в сердце ───────────────────────────────────

const constellation: CoverTemplate = {
  id: "constellation",
  mood: "romance",
  texture: { kind: "grain", opacity: 0.1 },
  swatch: "radial-gradient(circle at 50% 38%,#f1e6c8 0 2%,transparent 3%),radial-gradient(circle at 36% 30%,#f1e6c8 0 1.5%,transparent 2.5%),linear-gradient(170deg,#0e1630,#1f2a58)",
  art: (g, { uid }) => {
    const rand = rng(77);
    const f = g.front;
    let out = vGradient(g, `${uid}bg`, [
      [0, "#0B1229"],
      [0.6, "#18214A"],
      [1, "#2A2F63"],
    ]);
    const count = Math.round((g.width * g.height) / 70);
    for (let i = 0; i < count; i++) {
      const r = 0.1 + Math.pow(rand(), 4) * 0.5;
      out += `<circle cx="${n(rand() * g.width)}" cy="${n(rand() * g.height)}" r="${n(r)}" fill="#F3E8CC" fill-opacity="${n(0.2 + rand() * 0.6)}"/>`;
    }
    // Сердце из звёзд
    const cx = f.x + f.w / 2;
    const cy = f.y + f.h * 0.33;
    const s = f.w * 0.019;
    const pts: { x: number; y: number }[] = [];
    const N = 13;
    for (let i = 0; i < N; i++) {
      const t = (i / N) * Math.PI * 2;
      const x = 16 * Math.pow(Math.sin(t), 3);
      const y = -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t));
      pts.push({ x: cx + x * s + (rand() - 0.5) * s * 1.6, y: cy + y * s + (rand() - 0.5) * s * 1.6 });
    }
    out += `<path d="M${pts.map((p) => `${n(p.x)},${n(p.y)}`).join(" L")}Z" fill="none" stroke="#E9DDB8" stroke-width="0.22" stroke-opacity="0.75"/>`;
    for (const [i, p] of pts.entries()) {
      const big = i % 3 === 0;
      out += `<circle cx="${n(p.x)}" cy="${n(p.y)}" r="${big ? 1.9 : 1.3}" fill="#F6ECCF" fill-opacity="0.14"/><circle cx="${n(p.x)}" cy="${n(p.y)}" r="${big ? 0.75 : 0.5}" fill="#FFF6DD"/>`;
    }
    return out;
  },
  textArea: { x: 0.12, y: 0.58, w: 0.76, h: 0.3 },
  justify: "center",
  title: { font: "cormorant", size: 0.098, color: "#F3E7C6", weight: 500, italic: true, lineHeight: 1.05 },
  subtitle: { font: "cormorant", size: 0.044, color: "#D9CCA6", italic: true },
  names: { font: "montserrat", size: 0.025, color: "#CDBF96", weight: 500, upper: true, tracking: 0.3 },
  ornament: { kind: "star", color: "#E9DDB8" },
  spine: { color: "#F3E7C6", font: "cormorant" },
  back: { color: "#D9CCA6", font: "cormorant" },
};

// ─── Гэтсби: ар-деко, золото по чёрному ─────────────────────────────────────

const deco: CoverTemplate = {
  id: "deco",
  mood: "classic",
  texture: { kind: "grain", opacity: 0.14 },
  swatch: "repeating-conic-gradient(from 270deg at 50% 38%,#c8a55f 0 2deg,transparent 2deg 10deg),#141414",
  art: (g) => {
    const f = g.front;
    const gold = "#C8A55F";
    let out = bg(g, "#131313");
    out += frame(f, 7, gold, 0.5) + frame(f, 8.6, gold, 0.18);
    // Ступенчатые углы
    const c = 8.6;
    for (const [sx, sy] of [
      [1, 1],
      [-1, 1],
      [1, -1],
      [-1, -1],
    ]) {
      const x0 = sx > 0 ? f.x + c : f.x + f.w - c;
      const y0 = sy > 0 ? f.y + c : f.y + f.h - c;
      out += `<path d="M${n(x0)},${n(y0 + sy * 9)} h${n(sx * 3)} v${n(-sy * 3)} h${n(sx * 3)} v${n(-sy * 3)} h${n(sx * 3)}" fill="none" stroke="${gold}" stroke-width="0.3"/>`;
    }
    // Веер-солнце
    const cx = f.x + f.w / 2;
    const cy = f.y + f.h * 0.4;
    const R = f.w * 0.3;
    for (let k = 0; k <= 18; k++) {
      const a = Math.PI + (k / 18) * Math.PI;
      out += `<line x1="${n(cx + Math.cos(a) * R * 0.28)}" y1="${n(cy + Math.sin(a) * R * 0.28)}" x2="${n(cx + Math.cos(a) * R)}" y2="${n(cy + Math.sin(a) * R)}" stroke="${gold}" stroke-width="${k % 2 ? 0.2 : 0.4}"/>`;
    }
    for (const rr of [R, R * 0.28, R * 0.2]) out += `<path d="M${n(cx - rr)},${n(cy)} A${n(rr)},${n(rr)} 0 0 1 ${n(cx + rr)},${n(cy)}" fill="none" stroke="${gold}" stroke-width="0.4"/>`;
    out += `<line x1="${n(cx - R * 1.1)}" y1="${n(cy)}" x2="${n(cx + R * 1.1)}" y2="${n(cy)}" stroke="${gold}" stroke-width="0.4"/>`;
    // Шевроны внизу
    for (let i = 0; i < 3; i++) {
      const y = f.y + f.h * 0.86 + i * 2.2;
      out += `<path d="M${n(cx - 8 + i * 2)},${n(y)} L${n(cx)},${n(y + 3)} L${n(cx + 8 - i * 2)},${n(y)}" fill="none" stroke="${gold}" stroke-width="0.3"/>`;
    }
    return out;
  },
  textArea: { x: 0.14, y: 0.46, w: 0.72, h: 0.34 },
  justify: "center",
  title: { font: "playfair", size: 0.074, color: "#E6CB8F", weight: 400, upper: true, tracking: 0.08, lineHeight: 1.15 },
  subtitle: { font: "playfair", size: 0.038, color: "#CFB176", italic: true },
  names: { font: "montserrat", size: 0.024, color: "#C8A55F", weight: 500, upper: true, tracking: 0.32 },
  ornament: { kind: "line", color: "#C8A55F" },
  spine: { color: "#E6CB8F", font: "playfair" },
  back: { color: "#CFB176", font: "playfair" },
};

// ─── Лимоны: средиземноморское лето ─────────────────────────────────────────

const lemons: CoverTemplate = {
  id: "lemons",
  mood: "bright",
  texture: { kind: "grain", opacity: 0.1 },
  swatch: "radial-gradient(ellipse at 30% 30%,#f2c94c 0 12%,transparent 13%),radial-gradient(ellipse at 70% 70%,#f2c94c 0 12%,transparent 13%),radial-gradient(ellipse at 70% 25%,#4f7a3e 0 7%,transparent 8%),#f6f1e4",
  art: (g, { uid }) => {
    const rand = rng(29);
    let leaves = "";
    let fruits = "";
    for (const p of jitterGrid(g, 34, rand)) {
      const rot = rand() * 360;
      for (let i = 0; i < 2; i++) {
        const a = rot + 150 + i * 60 + rand() * 20;
        leaves += `<path d="${petalPath(10 + rand() * 4, 0.36)}" fill="${rand() > 0.5 ? "#4F7A3E" : "#628F4B"}" transform="translate(${n(p.x)},${n(p.y)}) rotate(${n(a)})"/>`;
      }
      const rx = 6.5 + rand() * 1.5;
      const ry = rx * 0.74;
      fruits += `<g transform="translate(${n(p.x)},${n(p.y)}) rotate(${n(rot)})"><ellipse rx="${n(rx)}" ry="${n(ry)}" fill="#F2C94C"/><path d="M${n(rx - 0.4)},${n(-1)} q2,1 0,2" fill="#E0A92E"/><path d="M${n(-rx + 0.4)},${n(-1)} q-1.6,1 0,2" fill="#E0A92E"/><ellipse cx="${n(-rx * 0.3)}" cy="${n(-ry * 0.4)}" rx="${n(rx * 0.32)}" ry="${n(ry * 0.18)}" fill="#FFF3B8" fill-opacity="0.8"/></g>`;
    }
    const r = frontRect(g, 0.16, 0.32, 0.68, 0.36);
    const label = `<rect x="${n(r.x + 0.4)}" y="${n(r.y + 0.9)}" width="${n(r.w)}" height="${n(r.h)}" rx="3" fill="#000" fill-opacity="0.25" filter="url(#${uid}s)"/><rect x="${n(r.x)}" y="${n(r.y)}" width="${n(r.w)}" height="${n(r.h)}" rx="3" fill="#FFFDF7"/><rect x="${n(r.x + 2)}" y="${n(r.y + 2)}" width="${n(r.w - 4)}" height="${n(r.h - 4)}" rx="2" fill="none" stroke="#2F5D8C" stroke-width="0.45"/><rect x="${n(r.x + 3)}" y="${n(r.y + 3)}" width="${n(r.w - 6)}" height="${n(r.h - 6)}" rx="1.5" fill="none" stroke="#2F5D8C" stroke-width="0.2"/>`;
    return `<defs>${shadowFilter(`${uid}s`)}</defs>${bg(g, "#F6F1E4")}${leaves}${fruits}${label}`;
  },
  textArea: { x: 0.19, y: 0.35, w: 0.62, h: 0.3 },
  justify: "center",
  title: { font: "playfair", size: 0.074, color: "#2F5D8C", weight: 400, italic: true, lineHeight: 1.1 },
  subtitle: { font: "playfair", size: 0.036, color: "#4E77A1", italic: true },
  names: { font: "montserrat", size: 0.023, color: "#4E77A1", weight: 500, upper: true, tracking: 0.24 },
  ornament: { kind: "dots", color: "#E0A92E" },
  spine: { color: "#2F5D8C", font: "playfair" },
  back: { color: "#2F5D8C", font: "playfair" },
};

// ─── Тюльпаны: минимализм в духе ризографии ─────────────────────────────────

function tulip(x: number, baseY: number, h: number, color: string, dark: string, rand: () => number) {
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

const tulips: CoverTemplate = {
  id: "tulips",
  mood: "tender",
  texture: { kind: "grain", opacity: 0.16 },
  swatch: "radial-gradient(ellipse at 30% 62%,#d9534f 0 7%,transparent 8%),radial-gradient(ellipse at 55% 55%,#e88aa0 0 7%,transparent 8%),radial-gradient(ellipse at 75% 66%,#f2b35e 0 7%,transparent 8%),#f3e7da",
  art: (g) => {
    const rand = rng(53);
    const f = g.front;
    const colors: [string, string][] = [
      ["#D9534F", "#8E2B2A"],
      ["#E88AA0", "#A64A60"],
      ["#F2B35E", "#B06E1F"],
      ["#B8354A", "#6E1624"],
      ["#F4C7C3", "#B97A76"],
    ];
    let out = bg(g, "#F3E7DA");
    const drawRow = (x0: number, w: number, count: number, maxH: number) => {
      for (let i = 0; i < count; i++) {
        const x = x0 + (w * (i + 0.5)) / count + (rand() - 0.5) * (w / count) * 0.5;
        const [c, d] = colors[Math.floor(rand() * colors.length)];
        out += tulip(x, g.height + 1, maxH * (0.6 + rand() * 0.4), c, d, rand);
      }
    };
    drawRow(f.x, f.w, 6, f.h * 0.52);
    if (g.back) drawRow(g.back.x, g.back.w, 4, g.back.h * 0.36);
    return out;
  },
  textArea: { x: 0.1, y: 0.1, w: 0.8, h: 0.3 },
  justify: "center",
  title: { font: "cormorant", size: 0.11, color: "#5A2A2E", weight: 600, lineHeight: 1.0 },
  subtitle: { font: "cormorant", size: 0.046, color: "#7E4A4E", italic: true },
  names: { font: "cormorant", size: 0.046, color: "#7E4A4E", italic: true },
  ornament: { kind: "heart", color: "#D9534F" },
  spine: { color: "#5A2A2E", font: "cormorant" },
  back: { color: "#5A2A2E", font: "cormorant" },
};

// ─── Горы: закат над хребтами ───────────────────────────────────────────────

function ridge(g: CoverGeometry, baseY: number, amp: number, step: number, color: string, rand: () => number) {
  let d = `M0,${n(g.height)} L0,${n(baseY)}`;
  for (let x = 0; x <= g.width + step; x += step * (0.6 + rand() * 0.8)) {
    d += ` L${n(x)},${n(baseY - rand() * amp)}`;
  }
  return `<path d="${d} L${n(g.width)},${n(g.height)}Z" fill="${color}"/>`;
}

const mountains: CoverTemplate = {
  id: "mountains",
  mood: "bright",
  texture: { kind: "grain", opacity: 0.1 },
  swatch: "linear-gradient(180deg,#f7d4b6 0 35%,#9c7ca5 36% 55%,#4a3a57 56% 75%,#2e2640 76%)",
  art: (g, { uid }) => {
    const rand = rng(19);
    const f = g.front;
    let out = vGradient(g, `${uid}bg`, [
      [0, "#F8DCC2"],
      [0.45, "#F1B9A4"],
      [0.75, "#C98FA3"],
      [1, "#8C6B9A"],
    ]);
    out += `<circle cx="${n(f.x + f.w * 0.68)}" cy="${n(f.y + f.h * 0.52)}" r="${n(f.w * 0.13)}" fill="#FFEBD2"/>`;
    out += ridge(g, g.height * 0.6, g.height * 0.14, 16, "#B78EA5", rand);
    out += ridge(g, g.height * 0.7, g.height * 0.12, 13, "#8E6C8D", rand);
    out += ridge(g, g.height * 0.8, g.height * 0.1, 11, "#5E4A6E", rand);
    out += ridge(g, g.height * 0.9, g.height * 0.07, 9, "#3A2E4A", rand);
    // Снежные шапки на дальнем хребте — лёгкие блики
    for (let i = 0; i < 5; i++) {
      const x = rand() * g.width;
      const y = g.height * 0.52 + rand() * g.height * 0.05;
      out += `<path d="M${n(x - 2)},${n(y + 2)} L${n(x)},${n(y)} L${n(x + 2.2)},${n(y + 2.2)}" fill="none" stroke="#FFF6EE" stroke-width="0.35" stroke-opacity="0.7"/>`;
    }
    // Птицы
    for (let i = 0; i < 3; i++) {
      const x = f.x + f.w * (0.2 + i * 0.09);
      const y = f.y + f.h * (0.46 - i * 0.02);
      out += `<path d="M${n(x - 1.6)},${n(y)} q0.8,-0.9 1.6,0 q0.8,-0.9 1.6,0" fill="none" stroke="#5E4A6E" stroke-width="0.3"/>`;
    }
    return out;
  },
  textArea: { x: 0.1, y: 0.09, w: 0.8, h: 0.3 },
  justify: "center",
  title: { font: "cormorant", size: 0.105, color: "#3F2A45", weight: 600, lineHeight: 1.02 },
  subtitle: { font: "cormorant", size: 0.046, color: "#6A4A6F", italic: true },
  names: { font: "montserrat", size: 0.025, color: "#6A4A6F", weight: 500, upper: true, tracking: 0.26 },
  spine: { color: "#FFF1E4", font: "cormorant" },
  back: { color: "#FFF1E4", font: "cormorant" },
};

// ─── Классика: кожаный переплёт с золотым тиснением ─────────────────────────

const leather: CoverTemplate = {
  id: "leather",
  mood: "classic",
  texture: { kind: "grain", opacity: 0.26 },
  swatch: "radial-gradient(ellipse at 50% 45%,#7a5237,#4a2e1f)",
  art: (g, { uid }) => {
    const f = g.front;
    const gold = "#CFAE6E";
    let out = `<defs><radialGradient id="${uid}bg" cx="0.5" cy="0.45" r="0.75"><stop offset="0" stop-color="#6F4A31"/><stop offset="1" stop-color="#3E2619"/></radialGradient></defs><rect width="${n(g.width)}" height="${n(g.height)}" fill="url(#${uid}bg)"/>`;
    out += frame(f, 7, gold, 0.6) + frame(f, 8.8, gold, 0.22) + frame(f, 11.5, "#2E1B11", 0.4);
    const s = 9;
    for (const [x, y, sx, sy] of [
      [f.x + 8.8, f.y + 8.8, 1, 1],
      [f.x + f.w - 8.8, f.y + 8.8, -1, 1],
      [f.x + 8.8, f.y + f.h - 8.8, 1, -1],
      [f.x + f.w - 8.8, f.y + f.h - 8.8, -1, -1],
    ]) {
      out += `<path d="${FLEURON}" fill="${gold}" transform="translate(${n(x)},${n(y)}) scale(${sx * s},${sy * s})"/>`;
    }
    // Гербовая виньетка над названием
    const cx = f.x + f.w / 2;
    const cy = f.y + f.h * 0.28;
    out += `<circle cx="${n(cx)}" cy="${n(cy)}" r="7" fill="none" stroke="${gold}" stroke-width="0.4"/><circle cx="${n(cx)}" cy="${n(cy)}" r="5.8" fill="none" stroke="${gold}" stroke-width="0.18"/>`;
    out += `<path d="${HEART}" fill="${gold}" transform="translate(${n(cx - 2.6)},${n(cy - 2.3)}) scale(5.2)"/>`;
    out += `<path d="M${n(cx - 20)},${n(cy)} h11 M${n(cx + 9)},${n(cy)} h11" stroke="${gold}" stroke-width="0.3"/>`;
    return out;
  },
  textArea: { x: 0.14, y: 0.38, w: 0.72, h: 0.4 },
  justify: "center",
  title: { font: "cormorant", size: 0.1, color: "#E2C387", weight: 600, lineHeight: 1.04 },
  subtitle: { font: "cormorant", size: 0.046, color: "#D2B173", italic: true },
  names: { font: "cormorant", size: 0.046, color: "#D2B173", italic: true },
  ornament: { kind: "line", color: "#CFAE6E" },
  spine: { color: "#E2C387", font: "cormorant" },
  back: { color: "#D2B173", font: "cormorant" },
};

// ─── Письмо: крафт, авиапочта, марка и сургуч ───────────────────────────────

const letter: CoverTemplate = {
  id: "letter",
  mood: "romance",
  texture: { kind: "grain", opacity: 0.22 },
  swatch: "repeating-linear-gradient(45deg,#b7323f 0 6%,#f4ead8 6% 12%,#2f5d8c 12% 18%,#f4ead8 18% 24%),#c9a77c",
  art: (g, { uid }) => {
    const f = g.front;
    let out = `<defs><pattern id="${uid}air" width="12" height="12" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="12" height="12" fill="#F4EAD8"/><rect width="3" height="12" fill="#B7323F"/><rect x="6" width="3" height="12" fill="#2F5D8C"/></pattern></defs>`;
    out += bg(g, "#C8A67B");
    // Авиапочтовая кайма по краю лицевой стороны
    const b = 5.5;
    out += `<path d="M${n(f.x)},${n(f.y)} h${n(f.w)} v${n(f.h)} h${n(-f.w)}Z M${n(f.x + b)},${n(f.y + b)} v${n(f.h - b * 2)} h${n(f.w - b * 2)} v${n(-(f.h - b * 2))}Z" fill="url(#${uid}air)" fill-rule="evenodd"/>`;
    // Марка с зубчиками
    const sw = f.w * 0.2;
    const sh = sw * 1.2;
    const sx = f.x + f.w - b - 7 - sw;
    const sy = f.y + b + 7;
    let perf = "";
    const r = 0.7;
    for (let x = sx; x <= sx + sw + 0.1; x += 2.2) perf += `<circle cx="${n(x)}" cy="${n(sy)}" r="${r}" fill="#C8A67B"/><circle cx="${n(x)}" cy="${n(sy + sh)}" r="${r}" fill="#C8A67B"/>`;
    for (let y = sy; y <= sy + sh + 0.1; y += 2.2) perf += `<circle cx="${n(sx)}" cy="${n(y)}" r="${r}" fill="#C8A67B"/><circle cx="${n(sx + sw)}" cy="${n(y)}" r="${r}" fill="#C8A67B"/>`;
    out += `<rect x="${n(sx)}" y="${n(sy)}" width="${n(sw)}" height="${n(sh)}" fill="#FBF6EC"/>${perf}<rect x="${n(sx + 2)}" y="${n(sy + 2)}" width="${n(sw - 4)}" height="${n(sh - 4)}" fill="#E6B8A8"/>`;
    out += `<path d="${HEART}" fill="#B7323F" transform="translate(${n(sx + sw / 2 - 4)},${n(sy + sh / 2 - 4)}) scale(8)"/>`;
    // Почтовый штемпель
    const px = sx - 6;
    const py = sy + sh * 0.7;
    out += `<circle cx="${n(px)}" cy="${n(py)}" r="8" fill="none" stroke="#5B4636" stroke-width="0.35" stroke-opacity="0.7"/><circle cx="${n(px)}" cy="${n(py)}" r="6" fill="none" stroke="#5B4636" stroke-width="0.25" stroke-opacity="0.7"/>`;
    for (let i = 0; i < 4; i++) out += `<path d="M${n(px + 9)},${n(py - 3 + i * 2)} q4,-1.2 8,0 t8,0" fill="none" stroke="#5B4636" stroke-width="0.3" stroke-opacity="0.6"/>`;
    // Сургучная печать
    const cx = f.x + f.w / 2;
    const cy = f.y + f.h * 0.8;
    out += `<defs>${shadowFilter(`${uid}s`)}</defs><circle cx="${n(cx + 0.5)}" cy="${n(cy + 1)}" r="9" fill="#000" fill-opacity="0.3" filter="url(#${uid}s)"/>`;
    let blob = "";
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      const rr = 9 + (i % 2 ? 0.8 : -0.4);
      blob += `${i ? "L" : "M"}${n(cx + Math.cos(a) * rr)},${n(cy + Math.sin(a) * rr)}`;
    }
    out += `<path d="${blob}Z" fill="#8B1E2D"/><circle cx="${n(cx)}" cy="${n(cy)}" r="6.4" fill="none" stroke="#6E1522" stroke-width="0.6"/><path d="${HEART}" fill="#6E1522" transform="translate(${n(cx - 3)},${n(cy - 2.8)}) scale(6)"/>`;
    return out;
  },
  textArea: { x: 0.14, y: 0.3, w: 0.72, h: 0.36 },
  justify: "center",
  title: { font: "playfair", size: 0.084, color: "#3B2A1E", weight: 400, italic: true, lineHeight: 1.08 },
  subtitle: { font: "playfair", size: 0.038, color: "#5B4636", italic: true },
  names: { font: "caveat", size: 0.062, color: "#5B4636", weight: 500 },
  spine: { color: "#3B2A1E", font: "playfair" },
  back: { color: "#3B2A1E", font: "playfair" },
};

export const collectionTemplates: CoverTemplate[] = [oyu, constellation, sunrise, herbarium, tulips, deco, leather, letter, lemons, mountains];
