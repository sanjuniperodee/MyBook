import type { CoverTemplate } from "../types";
import { bg, liftShadow, n, photoSlot } from "../svg-kit";
import { BACK_AREA } from "./kit";

// ─── Ленты: снимок сквозь вертикальные прорези разной высоты ──────────────────

export const strips: CoverTemplate = {
  id: "strips",
  mood: "photo",
  requiresPhoto: true,
  samples: ["family"],
  texture: { kind: "grain", opacity: 0.08 },
  swatch: "linear-gradient(90deg,#9cb0c0 0 22%,transparent 22% 26%,#9cb0c0 26% 48%,transparent 48% 52%,#9cb0c0 52% 74%,transparent 74% 78%,#9cb0c0 78%) 50% 20%/84% 50% no-repeat,#f2eee8",
  art: (g, ctx) => {
    const f = g.front;
    const { uid } = ctx;
    const R = { x: f.x + f.w * 0.08, y: f.y + f.h * 0.07, w: f.w * 0.84, h: f.h * 0.58 };
    const k = 4;
    const gap = 2.4;
    const sw = (R.w - gap * (k - 1)) / k;
    const tops = [0.07, 0, 0.11, 0.03];
    const bottoms = [0.04, 0.1, 0, 0.07];
    const rects = Array.from({ length: k }, (_, i) => ({ x: R.x + i * (sw + gap), y: R.y + R.h * tops[i], w: sw, h: R.h * (1 - tops[i] - bottoms[i]) }));
    let out = bg(g, "#F2EEE8");
    out += `<defs><clipPath id="${uid}sl">${rects.map((r) => `<rect x="${n(r.x)}" y="${n(r.y)}" width="${n(r.w)}" height="${n(r.h)}"/>`).join("")}</clipPath></defs>`;
    for (const [i, r] of rects.entries()) out += liftShadow(r, `${uid}s${i}`, { strength: 0.5 });
    out += `<g clip-path="url(#${uid}sl)">${photoSlot(ctx, 0, R, { scene: 1 })}</g>`;
    return out;
  },
  textArea: { x: 0.08, y: 0.68, w: 0.84, h: 0.27 },
  justify: "center",
  title: { font: "playfair", size: 0.08, color: "#22272E", weight: 400, lineHeight: 1.05 },
  subtitle: { font: "playfair", size: 0.038, color: "#5B636D", italic: true },
  names: { font: "montserrat", size: 0.021, color: "#6E7782", weight: 600, upper: true, tracking: 0.34 },
  ornament: { kind: "line", color: "#9AA6B2" },
  spine: { color: "#22272E", font: "playfair" },
  back: { color: "#22272E", font: "playfair", area: BACK_AREA },
};
