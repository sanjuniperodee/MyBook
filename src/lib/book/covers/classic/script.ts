import type { CoverTemplate } from "../types";
import { bg, n } from "../svg-kit";

export const script: CoverTemplate = {
  id: "script",
  mood: "romance",
  texture: { kind: "grain", opacity: 0.1 },
  swatch: "linear-gradient(160deg,#f5e6df,#ecd3ca)",
  art: (g) => {
    const f = g.front;
    const i = 7;
    return `${bg(g, "#F2E0D9")}<rect x="${n(f.x + i)}" y="${n(f.y + i)}" width="${n(f.w - i * 2)}" height="${n(f.h - i * 2)}" fill="none" stroke="#C99A95" stroke-width="0.3"/>`;
  },
  textArea: { x: 0.12, y: 0.22, w: 0.76, h: 0.5 },
  justify: "center",
  title: { font: "badscript", size: 0.12, color: "#7A2E3A", lineHeight: 1.15 },
  subtitle: { font: "cormorant", size: 0.045, color: "#9A5A60", italic: true },
  names: { font: "cormorant", size: 0.045, color: "#9A5A60", italic: true },
  ornament: { kind: "heart", color: "#C99A95" },
  spine: { color: "#7A2E3A", font: "cormorant" },
  back: { color: "#7A2E3A", font: "cormorant", mirror: true },
};
