import type { CoverTemplate } from "../types";
import { bg, frontRect, jitterGrid, n, petalPath, rng, shadowFilter } from "../svg-kit";

// ─── Лимоны: средиземноморское лето ─────────────────────────────────────────

export const lemons: CoverTemplate = {
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
  back: { color: "#2F5D8C", font: "playfair", mirror: true },
};
