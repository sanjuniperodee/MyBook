import type { CoverTemplate } from "../types";
import { n, rng } from "../svg-kit";

export const ocean: CoverTemplate = {
  id: "ocean",
  mood: "bright",
  texture: { kind: "grain", opacity: 0.1 },
  swatch: "linear-gradient(180deg,#1f4e6b,#6fa3b5)",
  art: (g, { uid }) => {
    const rand = rng(8);
    let waves = "";
    const lines = Math.round(g.height / 4.5);
    for (let i = 0; i < lines; i++) {
      const y = g.height * 0.38 + (i / lines) * g.height * 0.7;
      const amp = 1.5 + rand() * 3;
      const len = 26 + rand() * 20;
      const phase = rand() * len;
      let d = `M${n(-phase)},${n(y)}`;
      for (let x = -phase; x < g.width + len; x += len) {
        d += ` q${n(len / 4)},${n(-amp)} ${n(len / 2)},0 t${n(len / 2)},0`;
      }
      waves += `<path d="${d}" fill="none" stroke="#FFFFFF" stroke-width="${n(0.25 + rand() * 0.35)}" stroke-opacity="${n(0.12 + rand() * 0.28)}"/>`;
    }
    return `<defs><linearGradient id="${uid}bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#17405A"/><stop offset="0.55" stop-color="#2D6A86"/><stop offset="1" stop-color="#7FB2C1"/></linearGradient></defs><rect width="${n(g.width)}" height="${n(g.height)}" fill="url(#${uid}bg)"/>${waves}`;
  },
  textArea: { x: 0.1, y: 0.1, w: 0.8, h: 0.3 },
  justify: "center",
  title: { font: "cormorant", size: 0.105, color: "#FFFFFF", weight: 500, italic: true, lineHeight: 1.05 },
  subtitle: { font: "cormorant", size: 0.045, color: "#E3F0F4", italic: true },
  names: { font: "montserrat", size: 0.026, color: "#E3F0F4", weight: 500, upper: true, tracking: 0.25 },
  spine: { color: "#FFFFFF", font: "cormorant" },
  back: { color: "#FFFFFF", font: "cormorant", area: { x: 0.12, y: 0.1, w: 0.76, h: 0.3 } },
};
