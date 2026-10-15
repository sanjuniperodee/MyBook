import type { CoverTemplate } from "../types";
import { bg, n } from "../svg-kit";

export const noir: CoverTemplate = {
  id: "noir",
  mood: "classic",
  texture: { kind: "grain", opacity: 0.18 },
  swatch: "linear-gradient(160deg,#1a1a1a,#0d0d0d)",
  art: (g) => {
    const f = g.front;
    const i = 11;
    const c = { x: f.x + f.w / 2, y: f.y + i };
    return `${bg(g, "#131313")}<rect x="${n(f.x + i)}" y="${n(f.y + i)}" width="${n(f.w - i * 2)}" height="${n(f.h - i * 2)}" fill="none" stroke="#B8975A" stroke-width="0.3"/><rect x="${n(c.x - 1.6)}" y="${n(c.y - 1.6)}" width="3.2" height="3.2" fill="#131313" stroke="#B8975A" stroke-width="0.3" transform="rotate(45 ${n(c.x)} ${n(c.y)})"/><rect x="${n(c.x - 1.6)}" y="${n(f.y + f.h - i - 1.6)}" width="3.2" height="3.2" fill="#131313" stroke="#B8975A" stroke-width="0.3" transform="rotate(45 ${n(c.x)} ${n(f.y + f.h - i)})"/>`;
  },
  textArea: { x: 0.15, y: 0.2, w: 0.7, h: 0.6 },
  justify: "center",
  title: { font: "playfair", size: 0.105, color: "#E8D2A2", weight: 400, italic: true, lineHeight: 1.08 },
  subtitle: { font: "playfair", size: 0.04, color: "#CDB27A", italic: true },
  names: { font: "montserrat", size: 0.025, color: "#B8975A", weight: 500, upper: true, tracking: 0.32 },
  ornament: { kind: "line", color: "#B8975A" },
  spine: { color: "#E8D2A2", font: "playfair" },
  back: { color: "#CDB27A", font: "playfair", mirror: true },
};
