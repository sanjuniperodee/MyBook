import type { CoverTemplate } from "../types";
import { n, rng } from "../svg-kit";
import { vGradient } from "./kit";

// ─── Созвездие: звёзды, сложенные в сердце ───────────────────────────────────

export const constellation: CoverTemplate = {
  id: "constellation",
  mood: "romance",
  texture: { kind: "grain", opacity: 0.1 },
  swatch: "radial-gradient(circle at 50% 38%,#f1e6c8 0 2%,transparent 3%),radial-gradient(circle at 36% 30%,#f1e6c8 0 1.5%,transparent 2.5%),linear-gradient(170deg,#0e1630,#1f2a58)",
  art: (g, { uid }) => {
    const rand = rng(77);
    const f = g.front;
    let out = vGradient(g, `${uid}bg`, [
      [0, "#0B1229"],
      [0.6, "#18214A"],
      [1, "#2A2F63"],
    ]);
    const count = Math.round((g.width * g.height) / 70);
    for (let i = 0; i < count; i++) {
      const r = 0.1 + Math.pow(rand(), 4) * 0.5;
      out += `<circle cx="${n(rand() * g.width)}" cy="${n(rand() * g.height)}" r="${n(r)}" fill="#F3E8CC" fill-opacity="${n(0.2 + rand() * 0.6)}"/>`;
    }
    // Сердце из звёзд
    const cx = f.x + f.w / 2;
    const cy = f.y + f.h * 0.33;
    const s = f.w * 0.019;
    const pts: { x: number; y: number }[] = [];
    const N = 13;
    for (let i = 0; i < N; i++) {
      const t = (i / N) * Math.PI * 2;
      const x = 16 * Math.pow(Math.sin(t), 3);
      const y = -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t));
      pts.push({ x: cx + x * s + (rand() - 0.5) * s * 1.6, y: cy + y * s + (rand() - 0.5) * s * 1.6 });
    }
    out += `<path d="M${pts.map((p) => `${n(p.x)},${n(p.y)}`).join(" L")}Z" fill="none" stroke="#E9DDB8" stroke-width="0.22" stroke-opacity="0.75"/>`;
    for (const [i, p] of pts.entries()) {
      const big = i % 3 === 0;
      out += `<circle cx="${n(p.x)}" cy="${n(p.y)}" r="${big ? 1.9 : 1.3}" fill="#F6ECCF" fill-opacity="0.14"/><circle cx="${n(p.x)}" cy="${n(p.y)}" r="${big ? 0.75 : 0.5}" fill="#FFF6DD"/>`;
    }
    return out;
  },
  textArea: { x: 0.12, y: 0.58, w: 0.76, h: 0.3 },
  justify: "center",
  title: { font: "cormorant", size: 0.098, color: "#F3E7C6", weight: 500, italic: true, lineHeight: 1.05 },
  subtitle: { font: "cormorant", size: 0.044, color: "#D9CCA6", italic: true },
  names: { font: "montserrat", size: 0.025, color: "#CDBF96", weight: 500, upper: true, tracking: 0.3 },
  ornament: { kind: "star", color: "#E9DDB8" },
  spine: { color: "#F3E7C6", font: "cormorant" },
  back: { color: "#D9CCA6", font: "cormorant", area: { x: 0.14, y: 0.3, w: 0.72, h: 0.4 } },
};
