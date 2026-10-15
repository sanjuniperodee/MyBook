import type { CoverTemplate } from "../types";
import { n, petalPath, photoSlot, rng } from "../svg-kit";
import { BACK_AREA, ellipsePath, foil, rectFrame, sparkle } from "./kit";

// ─── Медальон: овальный портрет в золотой раме с лавровым венком ─────────────

export const medallion: CoverTemplate = {
  id: "medallion",
  mood: "photo",
  requiresPhoto: true,
  samples: ["weddingstairs"],
  texture: { kind: "grain", opacity: 0.14 },
  swatch: "radial-gradient(ellipse 24% 22% at 50% 38%,#b9a27e 0 92%,#cdae70 93% 100%,transparent 101%),radial-gradient(circle at 50% 42%,#5e2230,#2c0d15)",
  art: (g, ctx) => {
    const f = g.front;
    const { uid } = ctx;
    const gold = `url(#${uid}au)`;
    const cx = f.x + f.w / 2;
    const cy = f.y + f.h * 0.37;
    const ry = Math.min(f.h * 0.235, f.w * 0.3);
    const rx = ry * 0.8;
    let out = `<defs>${foil(`${uid}au`, f)}<radialGradient id="${uid}bg" gradientUnits="userSpaceOnUse" cx="${n(cx)}" cy="${n(f.y + f.h * 0.4)}" r="${n(Math.max(f.w, f.h) * 0.75)}"><stop offset="0" stop-color="#6A2736"/><stop offset="0.6" stop-color="#43141F"/><stop offset="1" stop-color="#260A11"/></radialGradient></defs><rect width="${n(g.width)}" height="${n(g.height)}" fill="url(#${uid}bg)"/>`;
    out += rectFrame(f, 7, "#CDAE70", 0.5) + rectFrame(f, 8.6, "#CDAE70", 0.18);
    // Ромбики на углах внутренней рамки
    for (const [x, y] of [
      [f.x + 7, f.y + 7],
      [f.x + f.w - 7, f.y + 7],
      [f.x + 7, f.y + f.h - 7],
      [f.x + f.w - 7, f.y + f.h - 7],
    ])
      out += `<path d="M${n(x)},${n(y - 2.2)} L${n(x + 2.2)},${n(y)} L${n(x)},${n(y + 2.2)} L${n(x - 2.2)},${n(y)}Z" fill="#CDAE70"/>`;
    out += `<path d="${ellipsePath(cx, cy + 1.6, rx + 2, ry + 2)}" fill="#000" fill-opacity="0.35"/>`;
    out += photoSlot(ctx, 0, { x: cx - rx, y: cy - ry, w: rx * 2, h: ry * 2 }, { clip: ellipsePath(cx, cy, rx, ry), scene: 3 });
    out += `<path d="${ellipsePath(cx, cy, rx + 1.3, ry + 1.3)}" fill="none" stroke="${gold}" stroke-width="1.6"/><path d="${ellipsePath(cx, cy, rx + 3.2, ry + 3.2)}" fill="none" stroke="${gold}" stroke-width="0.25"/>`;
    // Жемчужная нить вокруг рамы
    const beads = 64;
    for (let i = 0; i < beads; i++) {
      const t = (i / beads) * Math.PI * 2;
      out += `<circle cx="${n(cx + (rx + 4.6) * Math.cos(t))}" cy="${n(cy + (ry + 4.6) * Math.sin(t))}" r="0.42" fill="${gold}"/>`;
    }
    // Лавровый венок по нижней половине рамы
    const R = { x: rx + 8.5, y: ry + 8.5 };
    const rand = rng(61);
    const branch = (side: 1 | -1) => {
      const deg = (k: number) => ((90 + side * k) * Math.PI) / 180;
      const p = (t: number) => ({ x: cx + R.x * Math.cos(t), y: cy + R.y * Math.sin(t) });
      const a = p(deg(6));
      const b = p(deg(128));
      let s = `<path d="M${n(a.x)},${n(a.y)} A${n(R.x)},${n(R.y)} 0 0 ${side > 0 ? 1 : 0} ${n(b.x)},${n(b.y)}" fill="none" stroke="${gold}" stroke-width="0.45" stroke-linecap="round"/>`;
      const steps = 10;
      for (let i = 0; i < steps; i++) {
        const t = deg(12 + i * 11.5);
        const q = p(t);
        // Направление роста ветки — по касательной к эллипсу
        const dir = (Math.atan2(R.y * Math.cos(t) * side, -R.x * Math.sin(t) * side) * 180) / Math.PI;
        const len = 6.4 * (1 - (i / steps) * 0.42);
        for (const off of [-38, 38]) s += `<path d="${petalPath(len, 0.36)}" fill="${gold}" transform="translate(${n(q.x)},${n(q.y)}) rotate(${n(dir + off + (rand() - 0.5) * 8)})"/>`;
        if (i % 3 === 1) s += `<circle cx="${n(q.x + Math.cos(((dir + 90) * Math.PI) / 180) * 2.4)}" cy="${n(q.y + Math.sin(((dir + 90) * Math.PI) / 180) * 2.4)}" r="0.7" fill="${gold}"/>`;
      }
      return s;
    };
    out += branch(1) + branch(-1);
    const bottom = cy + R.y;
    out += `<path d="M${n(cx)},${n(bottom - 1.8)} L${n(cx + 1.8)},${n(bottom)} L${n(cx)},${n(bottom + 1.8)} L${n(cx - 1.8)},${n(bottom)}Z" fill="${gold}"/>`;
    out += sparkle(cx, cy - ry - 8.5, 4.2, gold);
    return out;
  },
  textArea: { x: 0.12, y: 0.655, w: 0.76, h: 0.29 },
  justify: "center",
  title: { font: "cormorant", size: 0.084, color: "#E9CD91", weight: 600, lineHeight: 1.05 },
  subtitle: { font: "cormorant", size: 0.04, color: "#D8BA80", italic: true },
  names: { font: "montserrat", size: 0.022, color: "#CDAE70", weight: 500, upper: true, tracking: 0.3 },
  ornament: { kind: "star", color: "#CDAE70" },
  spine: { color: "#E9CD91", font: "cormorant" },
  back: { color: "#D8BA80", font: "cormorant", area: BACK_AREA },
};
