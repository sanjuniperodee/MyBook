import type { CoverTemplate } from "../types";
import { bg, n, shadowFilter } from "../svg-kit";
import { HEART } from "../../motifs";

export const hearts: CoverTemplate = {
  id: "hearts",
  mood: "romance",
  texture: { kind: "grain", opacity: 0.12 },
  swatch: "radial-gradient(ellipse at 50% 50%,#f6e9e1 0 30%,transparent 31%),#8b1e2d",
  art: (g, { uid }) => {
    const s = 7;
    const step = 13;
    let out = `<defs><path id="${uid}h" d="${HEART}"/>${shadowFilter(`${uid}s`)}</defs>${bg(g, "#8B1E2D")}<g fill="none" stroke="#B53B4C">`;
    let row = 0;
    for (let y = -step; y < g.height + step; y += step * 0.9, row++) {
      for (let x = -step + (row % 2 ? step / 2 : 0); x < g.width + step; x += step) {
        out += `<use href="#${uid}h" transform="translate(${n(x)},${n(y)}) scale(${s})" stroke-width="${n(0.35 / s)}"/>`;
      }
    }
    out += `</g>`;
    const f = g.front;
    const cx = f.x + f.w / 2;
    const cy = f.y + f.h * 0.48;
    const rx = f.w * 0.33;
    const ry = Math.min(f.h * 0.23, f.w * 0.3);
    out += `<ellipse cx="${n(cx + 0.4)}" cy="${n(cy + 0.9)}" rx="${n(rx)}" ry="${n(ry)}" fill="#000" opacity="0.3" filter="url(#${uid}s)"/><ellipse cx="${n(cx)}" cy="${n(cy)}" rx="${n(rx)}" ry="${n(ry)}" fill="#F7EBE3"/><ellipse cx="${n(cx)}" cy="${n(cy)}" rx="${n(rx - 2.2)}" ry="${n(ry - 2.2)}" fill="none" stroke="#C98A8F" stroke-width="0.3"/>`;
    return out;
  },
  textArea: { x: 0.24, y: 0.33, w: 0.52, h: 0.3 },
  justify: "center",
  title: { font: "cormorant", size: 0.078, color: "#7A1B28", weight: 600, lineHeight: 1.05 },
  subtitle: { font: "cormorant", size: 0.04, color: "#9A4550", italic: true },
  names: { font: "cormorant", size: 0.04, color: "#9A4550", italic: true },
  ornament: { kind: "heart", color: "#B53B4C" },
  spine: { color: "#F7EBE3", font: "cormorant" },
  back: { color: "#F7EBE3", font: "cormorant", mirror: true },
};
