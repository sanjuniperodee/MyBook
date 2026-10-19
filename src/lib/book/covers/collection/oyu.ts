import type { CoverTemplate } from "../types";
import { n } from "../svg-kit";
import { frame, ram, rosette } from "./kit";

export const oyu: CoverTemplate = {
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
  back: { color: "#D8BC80", font: "cormorant", mirror: true },
};
