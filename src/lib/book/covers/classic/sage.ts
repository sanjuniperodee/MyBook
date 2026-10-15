import type { CoverTemplate } from "../types";
import { bg, n, petalPath, rng } from "../svg-kit";

export const sage: CoverTemplate = {
  id: "sage",
  mood: "tender",
  texture: { kind: "grain", opacity: 0.12 },
  swatch: "linear-gradient(160deg,#b8c0a8,#9fab8f)",
  art: (g) => {
    const rand = rng(5);
    let branches = "";
    const spacing = 24;
    for (let x0 = -10; x0 < g.width + 10; x0 += spacing * (0.7 + rand() * 0.6)) {
      const h = g.height * (0.35 + rand() * 0.3);
      const bend = (rand() - 0.5) * 30;
      const y0 = g.height + 2;
      const cx = x0 + bend;
      const x1 = x0 + bend * 0.6;
      const y1 = y0 - h;
      branches += `<path d="M${n(x0)},${n(y0)} Q${n(cx)},${n(y0 - h * 0.55)} ${n(x1)},${n(y1)}" fill="none" stroke="#EEF1E6" stroke-width="0.45" stroke-opacity="0.8"/>`;
      const leaves = 6 + Math.floor(rand() * 5);
      for (let i = 1; i <= leaves; i++) {
        const t = i / (leaves + 1);
        // точка на квадратичной кривой
        const px = (1 - t) * (1 - t) * x0 + 2 * (1 - t) * t * cx + t * t * x1;
        const py = (1 - t) * (1 - t) * y0 + 2 * (1 - t) * t * (y0 - h * 0.55) + t * t * y1;
        const side = i % 2 ? 1 : -1;
        const len = (7 + rand() * 4) * (1 - t * 0.45);
        const ang = -90 + side * (38 + rand() * 18);
        branches += `<path d="${petalPath(len, 0.32)}" fill="none" stroke="#EEF1E6" stroke-width="0.4" stroke-opacity="0.8" transform="translate(${n(px)},${n(py)}) rotate(${n(ang)})"/>`;
      }
    }
    return `${bg(g, "#AEB89D")}${branches}`;
  },
  textArea: { x: 0.1, y: 0.1, w: 0.8, h: 0.34 },
  justify: "center",
  title: { font: "cormorant", size: 0.105, color: "#2E3A28", weight: 600, lineHeight: 1.02 },
  subtitle: { font: "cormorant", size: 0.045, color: "#3F4D37", italic: true },
  names: { font: "cormorant", size: 0.045, color: "#3F4D37", italic: true },
  ornament: { kind: "dots", color: "#3F4D37" },
  spine: { color: "#2E3A28", font: "cormorant" },
  back: { color: "#2E3A28", font: "cormorant", area: { x: 0.12, y: 0.1, w: 0.76, h: 0.36 } },
};
