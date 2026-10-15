import type { CoverTemplate } from "../types";
import { n, rng } from "../svg-kit";

export const midnight: CoverTemplate = {
  id: "midnight",
  mood: "romance",
  texture: { kind: "grain", opacity: 0.1 },
  swatch: "radial-gradient(circle at 20% 30%,#e8d9b0 0 2%,transparent 3%),radial-gradient(circle at 70% 60%,#e8d9b0 0 1.5%,transparent 2.5%),linear-gradient(160deg,#141b33,#243258)",
  art: (g, { uid }) => {
    const rand = rng(23);
    let stars = "";
    const count = Math.round((g.width * g.height) / 55);
    for (let i = 0; i < count; i++) {
      const x = rand() * g.width;
      const y = rand() * g.height;
      const r = 0.12 + Math.pow(rand(), 3) * 0.55;
      stars += `<circle cx="${n(x)}" cy="${n(y)}" r="${n(r)}" fill="#EFE2BF" fill-opacity="${n(0.25 + rand() * 0.7)}"/>`;
    }
    const f = g.front;
    const frame = (i: number, w: number) =>
      `<rect x="${n(f.x + i)}" y="${n(f.y + i)}" width="${n(f.w - i * 2)}" height="${n(f.h - i * 2)}" fill="none" stroke="#C9A96E" stroke-width="${w}"/>`;
    return `<defs><linearGradient id="${uid}bg" x1="0" y1="0" x2="0.3" y2="1"><stop offset="0" stop-color="#121932"/><stop offset="1" stop-color="#26345C"/></linearGradient></defs><rect width="${n(g.width)}" height="${n(g.height)}" fill="url(#${uid}bg)"/>${stars}${frame(9, 0.45)}${frame(10.6, 0.2)}`;
  },
  textArea: { x: 0.14, y: 0.24, w: 0.72, h: 0.5 },
  justify: "center",
  title: { font: "cormorant", size: 0.1, color: "#E9D5A6", weight: 500, italic: true, lineHeight: 1.05 },
  subtitle: { font: "cormorant", size: 0.045, color: "#D8C08E", italic: true },
  names: { font: "montserrat", size: 0.026, color: "#C9A96E", weight: 500, upper: true, tracking: 0.28 },
  ornament: { kind: "star", color: "#C9A96E" },
  spine: { color: "#E9D5A6", font: "cormorant" },
  back: { color: "#D8C08E", font: "cormorant", mirror: true },
};
