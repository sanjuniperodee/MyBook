import type { CoverTemplate } from "../types";
import { bg, n } from "../svg-kit";

export const terracotta: CoverTemplate = {
  id: "terracotta",
  mood: "bright",
  texture: { kind: "grain", opacity: 0.16 },
  swatch: "radial-gradient(circle at 50% 110%,#f3d9b8 0 30%,#e9b48a 31% 40%,#8f3e27 41% 50%,transparent 51%),#c9724f",
  art: (g) => {
    const f = g.front;
    const colors = ["#8F3E27", "#E9B48A", "#F3D9B8", "#B85A3B", "#F7E6D0"];
    const arches = (cx: number, baseY: number, maxR: number, step: number) => {
      let out = "";
      let i = 0;
      for (let r = maxR; r > step * 0.8; r -= step, i++) {
        out += `<path d="M${n(cx - r)},${n(baseY)} A${n(r)},${n(r)} 0 0 1 ${n(cx + r)},${n(baseY)} Z" fill="${colors[i % colors.length]}"/>`;
      }
      return out;
    };
    const baseY = g.height + 0.5;
    let out = `${bg(g, "#C9724F")}`;
    out += `<circle cx="${n(f.x + f.w * 0.76)}" cy="${n(f.y + f.h * 0.5)}" r="${n(f.w * 0.1)}" fill="#F2C48D"/>`;
    out += arches(f.x + f.w * 0.42, baseY, f.w * 0.62, f.w * 0.075);
    if (g.back) out += arches(g.back.x + g.back.w * 0.25, baseY, g.back.w * 0.3, g.back.w * 0.05);
    return out;
  },
  textArea: { x: 0.1, y: 0.09, w: 0.8, h: 0.32 },
  justify: "start",
  title: { font: "playfair", size: 0.098, color: "#FBF1E4", weight: 400, lineHeight: 1.08 },
  subtitle: { font: "playfair", size: 0.042, color: "#FBE7CF", italic: true },
  names: { font: "montserrat", size: 0.027, color: "#FBE7CF", weight: 500, upper: true, tracking: 0.22 },
  spine: { color: "#FBF1E4", font: "playfair" },
  back: { color: "#FBF1E4", font: "playfair", area: { x: 0.12, y: 0.12, w: 0.76, h: 0.4 } },
};
