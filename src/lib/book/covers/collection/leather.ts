import type { CoverTemplate } from "../types";
import { n } from "../svg-kit";
import { frame } from "./kit";
import { FLEURON, HEART } from "../../motifs";

// ─── Классика: кожаный переплёт с золотым тиснением ─────────────────────────

export const leather: CoverTemplate = {
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
  back: { color: "#D2B173", font: "cormorant", mirror: true },
};
