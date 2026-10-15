import type { CoverTemplate } from "../types";
import { bg, frontRect, jitterGrid, label, n, petalPath, rng, shadowFilter } from "../svg-kit";

export const blossom: CoverTemplate = {
  id: "blossom",
  mood: "romance",
  texture: { kind: "grain", opacity: 0.12 },
  swatch: "radial-gradient(circle at 30% 30%,#e8b4b8 0 18%,transparent 19%),radial-gradient(circle at 70% 65%,#b5545c 0 20%,transparent 21%),#2a1a1f",
  art: (g, { uid }) => {
    const rand = rng(11);
    const palettes = [
      ["#F4DCD6", "#E8B4B8", "#D38C95", "#A94E5B"],
      ["#F3E3D8", "#E6C2B4", "#CD8F85", "#8E3B45"],
      ["#E9A6AE", "#D2717F", "#A8414F", "#6E1F2B"],
      ["#F6EBE3", "#EAD1C6", "#D7A9A0", "#B06A6C"],
    ];
    let leaves = "";
    let flowers = "";
    for (const p of jitterGrid(g, 30, rand)) {
      const R = 9 + rand() * 8;
      const rot = rand() * 360;
      for (let i = 0; i < 3; i++) {
        const a = rot + i * 120 + rand() * 40;
        const lr = R * (1.35 + rand() * 0.4);
        const c = rand() > 0.5 ? "#3F4A36" : "#56624A";
        leaves += `<path d="${petalPath(lr, 0.3)}" fill="${c}" transform="translate(${n(p.x)},${n(p.y)}) rotate(${n(a)})"/>`;
      }
      const pal = palettes[Math.floor(rand() * palettes.length)];
      let fl = "";
      const layers = 4;
      for (let l = 0; l < layers; l++) {
        const lr = R * (1 - l * 0.22);
        const count = 7 - l;
        const off = rand() * 360;
        for (let k = 0; k < count; k++) {
          fl += `<path d="${petalPath(lr, 0.55)}" fill="${pal[l]}" fill-opacity="0.96" transform="rotate(${n(off + (k * 360) / count)})"/>`;
        }
      }
      fl += `<circle r="${n(R * 0.13)}" fill="${pal[3]}"/>`;
      flowers += `<g transform="translate(${n(p.x)},${n(p.y)})">${fl}</g>`;
    }
    const r = frontRect(g, 0.22, 0.32, 0.56, 0.34);
    return `<defs>${shadowFilter(`${uid}s`)}</defs>${bg(g, "#2A1A1F")}${leaves}${flowers}${label(r, "#EFE9DF", { stroke: "#CFC3B0", shadowId: `${uid}s` })}`;
  },
  textArea: { x: 0.25, y: 0.34, w: 0.5, h: 0.3 },
  justify: "center",
  title: { font: "cormorant", size: 0.075, color: "#3B2A2C", weight: 500, lineHeight: 1.1 },
  subtitle: { font: "cormorant", size: 0.04, color: "#6E5456", italic: true },
  names: { font: "cormorant", size: 0.038, color: "#6E5456", italic: true },
  ornament: { kind: "heart", color: "#A94E5B" },
  spine: { color: "#EFE9DF", font: "cormorant" },
  back: { color: "#EFE9DF", font: "cormorant", mirror: true },
};
