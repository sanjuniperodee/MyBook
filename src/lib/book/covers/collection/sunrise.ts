import type { CoverTemplate } from "../types";
import { bg, n, rng } from "../svg-kit";
import { wash } from "./kit";

export const sunrise: CoverTemplate = {
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
  back: { color: "#4B2B3E", font: "cormorant", area: { x: 0.16, y: 0.3, w: 0.68, h: 0.38 } },
};
