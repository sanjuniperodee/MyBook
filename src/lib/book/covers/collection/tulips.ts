import type { CoverTemplate } from "../types";
import { bg, rng } from "../svg-kit";
import { tulip } from "./kit";

export const tulips: CoverTemplate = {
  id: "tulips",
  mood: "tender",
  texture: { kind: "grain", opacity: 0.16 },
  swatch: "radial-gradient(ellipse at 30% 62%,#d9534f 0 7%,transparent 8%),radial-gradient(ellipse at 55% 55%,#e88aa0 0 7%,transparent 8%),radial-gradient(ellipse at 75% 66%,#f2b35e 0 7%,transparent 8%),#f3e7da",
  art: (g) => {
    const rand = rng(53);
    const f = g.front;
    const colors: [string, string][] = [
      ["#D9534F", "#8E2B2A"],
      ["#E88AA0", "#A64A60"],
      ["#F2B35E", "#B06E1F"],
      ["#B8354A", "#6E1624"],
      ["#F4C7C3", "#B97A76"],
    ];
    let out = bg(g, "#F3E7DA");
    const drawRow = (x0: number, w: number, count: number, maxH: number) => {
      for (let i = 0; i < count; i++) {
        const x = x0 + (w * (i + 0.5)) / count + (rand() - 0.5) * (w / count) * 0.5;
        const [c, d] = colors[Math.floor(rand() * colors.length)];
        out += tulip(x, g.height + 1, maxH * (0.6 + rand() * 0.4), c, d, rand);
      }
    };
    drawRow(f.x, f.w, 6, f.h * 0.52);
    if (g.back) drawRow(g.back.x, g.back.w, 4, g.back.h * 0.36);
    return out;
  },
  textArea: { x: 0.1, y: 0.1, w: 0.8, h: 0.3 },
  justify: "center",
  title: { font: "cormorant", size: 0.11, color: "#5A2A2E", weight: 600, lineHeight: 1.0 },
  subtitle: { font: "cormorant", size: 0.046, color: "#7E4A4E", italic: true },
  names: { font: "cormorant", size: 0.046, color: "#7E4A4E", italic: true },
  ornament: { kind: "heart", color: "#D9534F" },
  spine: { color: "#5A2A2E", font: "cormorant" },
  back: { color: "#5A2A2E", font: "cormorant", area: { x: 0.12, y: 0.12, w: 0.76, h: 0.4 } },
};
