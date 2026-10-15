import * as THREE from "three";
import { clamp } from "@/lib/book/book-model";

/** Палитра студии: тёплая слоновая кость в тон бумаге сайта — книга выделяется, но фон не спорит с обложкой. */
export const STUDIO = { zenith: "#cfbe9f", horizon: "#e8dbc3", floorCenter: "#f6eddc", floorEdge: "#d9c9ad" } as const;

function canvasTexture(canvas: HTMLCanvasElement, anisotropy?: number) {
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  if (anisotropy !== undefined) tex.anisotropy = anisotropy;
  return tex;
}

/** Срез страниц: гладкая основа и еле заметные штрихи листов, чтобы вдали не было муара. */
export function stripeTexture(axis: "u" | "v", leavesCount: number, anisotropy: number) {
  const size = 128;
  const canvas = document.createElement("canvas");
  canvas.width = axis === "u" ? size : 8;
  canvas.height = axis === "v" ? size : 8;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#f4eee2";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "rgba(120,100,70,.22)";
  for (let i = 0; i < size; i += 16) {
    if (axis === "u") ctx.fillRect(i, 0, 2, 8);
    else ctx.fillRect(0, i, 8, 2);
  }
  const tex = canvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = anisotropy;
  const count = Math.max(6, Math.round(leavesCount / 2));
  if (axis === "u") tex.repeat.set(count, 1);
  else tex.repeat.set(1, count);
  return tex;
}

/**
 * Лёгкий шум по яркости (±amount из 255): ломает полосы градиента, на глаз незаметен.
 * poles — гасить шум у верха и низа картинки: на куполе эти строки стягиваются в точку, и шум превращается в лучи.
 */
function addGrain(ctx: CanvasRenderingContext2D, w: number, h: number, amount: number, poles = false) {
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  let seed = 91;
  for (let i = 0; i < d.length; i += 4) {
    seed = (seed * 16807) % 2147483647;
    const y = Math.floor(i / 4 / w);
    const weight = poles ? Math.pow(Math.sin((Math.PI * (y + 0.5)) / h), 1.5) : 1;
    const n = ((seed / 2147483647) * 2 - 1) * amount * weight;
    d[i] = clamp(d[i] + n, 0, 255);
    d[i + 1] = clamp(d[i + 1] + n, 0, 255);
    d[i + 2] = clamp(d[i + 2] + n, 0, 255);
  }
  ctx.putImageData(img, 0, 0);
}

/**
 * Купол студии: тёмный тёплый верх, светлый «горизонт» на уровне книги и мягкие пятна света (боке) в глубине.
 * Зерно в градиенте убирает концентрические кольца — 8-битный градиент без него расслаивается на полосы.
 */
export function domeTexture(anisotropy: number) {
  const w = 1024;
  const h = 512;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, STUDIO.zenith);
  g.addColorStop(0.5, STUDIO.horizon);
  g.addColorStop(1, "#dccfb6");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  // Детерминированный «случай»: фон одинаков при каждом открытии.
  let seed = 7;
  const rnd = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  for (let i = 0; i < 70; i++) {
    const x = rnd() * w;
    const y = h * (0.06 + rnd() * 0.46);
    const r = 14 + rnd() * 44;
    const warm = rnd() < 0.3;
    const blob = ctx.createRadialGradient(x, y, 0, x, y, r);
    const rgb = warm ? "246,214,160" : "255,250,238";
    const a = 0.05 + rnd() * 0.1;
    blob.addColorStop(0, `rgba(${rgb},${a})`);
    blob.addColorStop(0.65, `rgba(${rgb},${a * 0.55})`);
    blob.addColorStop(1, `rgba(${rgb},0)`);
    ctx.fillStyle = blob;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  addGrain(ctx, w, h, 3, true);
  return canvasTexture(canvas, anisotropy);
}

/** «Стол»: пятно света под книгой, к краям темнее — как на студийном снимке; туман растворяет его в горизонте. */
export function floorTexture(anisotropy: number) {
  const size = 512;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, STUDIO.floorCenter);
  g.addColorStop(0.18, STUDIO.floorCenter);
  g.addColorStop(1, STUDIO.floorEdge);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  addGrain(ctx, size, size, 2.5);
  return canvasTexture(canvas, anisotropy);
}

/** Пятно контакта книги со столом. */
export function contactTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 128;
  const ctx = canvas.getContext("2d")!;
  const g = ctx.createRadialGradient(64, 64, 4, 64, 64, 64);
  g.addColorStop(0, "rgba(40,28,18,.9)");
  g.addColorStop(0.5, "rgba(40,28,18,.35)");
  g.addColorStop(1, "rgba(40,28,18,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  return canvasTexture(canvas);
}
