import type { CoverTemplate } from "../types";
import { bg, n, shadowFilter } from "../svg-kit";
import { HEART } from "../../motifs";

// ─── Письмо: крафт, авиапочта, марка и сургуч ───────────────────────────────

export const letter: CoverTemplate = {
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
  back: { color: "#3B2A1E", font: "playfair", mirror: true },
};
