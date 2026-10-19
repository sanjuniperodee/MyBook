import type { CoverTemplate } from "../types";
import { bg, n, photoSlot } from "../svg-kit";
import { BACK_AREA, glow } from "./kit";

// ─── Плёнка: три кадра на киноленте, пересекающей обложку ────────────────────

export const film: CoverTemplate = {
  id: "film",
  mood: "photo",
  requiresPhoto: true,
  photoSlots: 3,
  samples: ["friends", "laughter", "sunsetwalk"],
  texture: { kind: "grain", opacity: 0.16 },
  swatch: "linear-gradient(-5deg,transparent 0 22%,#141110 22% 49%,transparent 49%),#3a3230",
  art: (g, ctx) => {
    const f = g.front;
    const { uid } = ctx;
    const bgColor = "#2E2725";
    const sh = Math.min(f.h * 0.27, f.w * 0.38);
    const cx = f.x + f.w / 2;
    const cy = f.y + f.h * 0.63;
    const hb = sh * 0.16;
    const fh = sh - hb * 2 - 1.2;
    const gap = 3.2;
    const fw = Math.min(fh * 1.32, (f.w * 0.92 - gap * 2) / 3);
    const x0 = f.x - 30;
    const x1 = g.width + 30;
    const top = cy - sh / 2;
    const faceRect = { x: f.x, y: 0, w: g.width - f.x, h: g.height };
    let out = bg(g, bgColor);
    // Тёплые засветы плёнки — сверху слева и мягче справа внизу
    out += glow(`${uid}g1`, f.x + f.w * 0.12, f.y + f.h * 0.1, f.w * 0.85, "#D9834A", 0.5, faceRect);
    out += glow(`${uid}g2`, f.x + f.w * 0.95, f.y + f.h * 0.98, f.w * 0.6, "#B4475A", 0.35, faceRect);
    out += `<defs><clipPath id="${uid}fc"><rect x="${n(f.x)}" y="0" width="${n(g.width - f.x)}" height="${n(g.height)}"/></clipPath><filter id="${uid}ss" x="-10%" y="-40%" width="120%" height="180%"><feGaussianBlur stdDeviation="2.2"/></filter></defs>`;
    let strip = `<rect x="${n(x0)}" y="${n(top + 2.2)}" width="${n(x1 - x0)}" height="${n(sh)}" fill="#000" fill-opacity="0.45" filter="url(#${uid}ss)"/>`;
    strip += `<rect x="${n(x0)}" y="${n(top)}" width="${n(x1 - x0)}" height="${n(sh)}" fill="#14110F"/>`;
    // Перфорация — сквозь неё виден фон
    for (let x = x0; x < x1; x += 4.6)
      for (const y of [top + hb * 0.25, top + sh - hb * 0.75]) strip += `<rect x="${n(x)}" y="${n(y)}" width="2.4" height="${n(hb * 0.5)}" rx="0.5" fill="#3A302D"/>`;
    const fx0 = cx - (fw * 3 + gap * 2) / 2;
    const deg = -5;
    for (let i = 0; i < 3; i++) {
      const fx = fx0 + i * (fw + gap);
      strip += photoSlot(ctx, i, { x: fx, y: cy - fh / 2, w: fw, h: fh }, { scene: i + 1, rotate: { deg, cx, cy } });
      // Оранжевые метки кадров на кромке
      strip += `<path d="M${n(fx + fw / 2 - 1)},${n(top + sh - hb * 0.08)} l1,-1.2 l1,1.2Z" fill="#D88A3D"/>`;
    }
    out += `<g clip-path="url(#${uid}fc)"><g transform="rotate(${deg} ${n(cx)} ${n(cy)})">${strip}</g></g>`;
    return out;
  },
  textArea: { x: 0.1, y: 0.09, w: 0.8, h: 0.33 },
  justify: "start",
  title: { font: "cormorant", size: 0.1, color: "#F3E9DB", weight: 500, italic: true, lineHeight: 1.04 },
  subtitle: { font: "cormorant", size: 0.042, color: "#D9CCB9", italic: true },
  names: { font: "montserrat", size: 0.022, color: "#CDBFA9", weight: 500, upper: true, tracking: 0.32 },
  ornament: { kind: "line", color: "#CDBFA9" },
  spine: { color: "#F3E9DB", font: "cormorant" },
  back: { color: "#E2D6C3", font: "cormorant", area: BACK_AREA },
};
