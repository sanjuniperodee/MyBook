import type { CoverTemplate } from "../types";
import { bg, n } from "../svg-kit";
import { frame } from "./kit";

// ─── Гэтсби: ар-деко, золото по чёрному ─────────────────────────────────────

export const deco: CoverTemplate = {
  id: "deco",
  mood: "classic",
  texture: { kind: "grain", opacity: 0.14 },
  swatch: "repeating-conic-gradient(from 270deg at 50% 38%,#c8a55f 0 2deg,transparent 2deg 10deg),#141414",
  art: (g) => {
    const f = g.front;
    const gold = "#C8A55F";
    let out = bg(g, "#131313");
    out += frame(f, 7, gold, 0.5) + frame(f, 8.6, gold, 0.18);
    // Ступенчатые углы
    const c = 8.6;
    for (const [sx, sy] of [
      [1, 1],
      [-1, 1],
      [1, -1],
      [-1, -1],
    ]) {
      const x0 = sx > 0 ? f.x + c : f.x + f.w - c;
      const y0 = sy > 0 ? f.y + c : f.y + f.h - c;
      out += `<path d="M${n(x0)},${n(y0 + sy * 9)} h${n(sx * 3)} v${n(-sy * 3)} h${n(sx * 3)} v${n(-sy * 3)} h${n(sx * 3)}" fill="none" stroke="${gold}" stroke-width="0.3"/>`;
    }
    // Веер-солнце
    const cx = f.x + f.w / 2;
    const cy = f.y + f.h * 0.4;
    const R = f.w * 0.3;
    for (let k = 0; k <= 18; k++) {
      const a = Math.PI + (k / 18) * Math.PI;
      out += `<line x1="${n(cx + Math.cos(a) * R * 0.28)}" y1="${n(cy + Math.sin(a) * R * 0.28)}" x2="${n(cx + Math.cos(a) * R)}" y2="${n(cy + Math.sin(a) * R)}" stroke="${gold}" stroke-width="${k % 2 ? 0.2 : 0.4}"/>`;
    }
    for (const rr of [R, R * 0.28, R * 0.2]) out += `<path d="M${n(cx - rr)},${n(cy)} A${n(rr)},${n(rr)} 0 0 1 ${n(cx + rr)},${n(cy)}" fill="none" stroke="${gold}" stroke-width="0.4"/>`;
    out += `<line x1="${n(cx - R * 1.1)}" y1="${n(cy)}" x2="${n(cx + R * 1.1)}" y2="${n(cy)}" stroke="${gold}" stroke-width="0.4"/>`;
    // Шевроны внизу
    for (let i = 0; i < 3; i++) {
      const y = f.y + f.h * 0.86 + i * 2.2;
      out += `<path d="M${n(cx - 8 + i * 2)},${n(y)} L${n(cx)},${n(y + 3)} L${n(cx + 8 - i * 2)},${n(y)}" fill="none" stroke="${gold}" stroke-width="0.3"/>`;
    }
    return out;
  },
  textArea: { x: 0.14, y: 0.46, w: 0.72, h: 0.34 },
  justify: "center",
  title: { font: "playfair", size: 0.074, color: "#E6CB8F", weight: 400, upper: true, tracking: 0.08, lineHeight: 1.15 },
  subtitle: { font: "playfair", size: 0.038, color: "#CFB176", italic: true },
  names: { font: "montserrat", size: 0.024, color: "#C8A55F", weight: 500, upper: true, tracking: 0.32 },
  ornament: { kind: "line", color: "#C8A55F" },
  spine: { color: "#E6CB8F", font: "playfair" },
  back: { color: "#CFB176", font: "playfair", mirror: true },
};
