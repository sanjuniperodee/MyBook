import type { CoverTemplate } from "../types";
import { bg, n, photoSlot } from "../svg-kit";
import { archPath, BACK_AREA, sparkle } from "./kit";

export const arch: CoverTemplate = {
  id: "arch",
  mood: "photo",
  requiresPhoto: true,
  samples: ["weddingbeach"],
  texture: { kind: "grain", opacity: 0.1 },
  swatch: "radial-gradient(ellipse 30% 29% at 50% 40%,#c99a7e 0 98%,transparent 100%),#efe5d8",
  art: (g, ctx) => {
    const f = g.front;
    const w = Math.min(f.w * 0.6, f.h * 0.42);
    const h = Math.min(f.h * 0.55, w * 1.45);
    const x = f.x + (f.w - w) / 2;
    const y = f.y + f.h * 0.09;
    const line = "#A8724F";
    let out = bg(g, "#EFE5D8");
    // Арка-тень цвета обожжённой глины — сдвинута вправо и вниз, как цветной блок на постере.
    out += `<path d="${archPath(x + w * 0.13, y + w * 0.1, w, h - w * 0.1)}" fill="#D9AC8C"/>`;
    out += photoSlot(ctx, 0, { x, y, w, h }, { clip: archPath(x, y, w, h), scene: 0 });
    const o = 3.4;
    out += `<path d="${archPath(x - o, y - o, w + o * 2, h + o)}" fill="none" stroke="${line}" stroke-width="0.3"/>`;
    const base = y + h + 0.01;
    out += `<line x1="${n(x - o - 9)}" y1="${n(base)}" x2="${n(x + w + o + 9)}" y2="${n(base)}" stroke="${line}" stroke-width="0.3"/>`;
    for (const cx of [x - o - 10.5, x + w + o + 10.5]) out += `<circle cx="${n(cx)}" cy="${n(base)}" r="0.7" fill="${line}"/>`;
    out += sparkle(x - o - 5, y + w * 0.12, 4.4, line) + sparkle(x - o - 9.5, y + w * 0.3, 2.2, line);
    return out;
  },
  textArea: { x: 0.1, y: 0.675, w: 0.8, h: 0.28 },
  justify: "center",
  title: { font: "cormorant", size: 0.084, color: "#4A3426", weight: 500, italic: true, lineHeight: 1.05 },
  subtitle: { font: "cormorant", size: 0.04, color: "#7A5A45", italic: true },
  names: { font: "montserrat", size: 0.022, color: "#8A6A55", weight: 500, upper: true, tracking: 0.28 },
  ornament: { kind: "line", color: "#A8724F" },
  spine: { color: "#4A3426", font: "cormorant" },
  back: { color: "#4A3426", font: "cormorant", area: BACK_AREA },
};
