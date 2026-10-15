import type { CoverTemplate } from "../types";
import { bg, frontRect, label, n, rng, shadowFilter } from "../svg-kit";

export const terrazzo: CoverTemplate = {
  id: "terrazzo",
  mood: "bright",
  texture: { kind: "grain", opacity: 0.1 },
  swatch: "radial-gradient(circle at 20% 30%,#d9a48f 0 6%,transparent 7%),radial-gradient(circle at 70% 70%,#9db4a8 0 7%,transparent 8%),radial-gradient(circle at 80% 20%,#e4c590 0 5%,transparent 6%),#f1ece4",
  art: (g, { uid }) => {
    const rand = rng(31);
    const colors = ["#D9A48F", "#E4C590", "#9DB4A8", "#C77C6B", "#6D8A96", "#E8D5C4", "#2F3E46"];
    let chips = "";
    const count = Math.round((g.width * g.height) / 38);
    for (let i = 0; i < count; i++) {
      const cx = rand() * g.width;
      const cy = rand() * g.height;
      const r = 0.8 + Math.pow(rand(), 2) * 3.8;
      const k = 4 + Math.floor(rand() * 3);
      let d = "";
      for (let j = 0; j < k; j++) {
        const a = (j / k) * Math.PI * 2 + rand() * 0.8;
        const rr = r * (0.6 + rand() * 0.5);
        d += `${j ? "L" : "M"}${n(cx + Math.cos(a) * rr)},${n(cy + Math.sin(a) * rr)}`;
      }
      chips += `<path d="${d}Z" fill="${colors[Math.floor(rand() * colors.length)]}"/>`;
    }
    const r = frontRect(g, 0.14, 0.34, 0.72, 0.3);
    return `<defs>${shadowFilter(`${uid}s`)}</defs>${bg(g, "#F1ECE4")}${chips}${label(r, "#FAF7F2", { shadowId: `${uid}s`, rx: 0.3 })}`;
  },
  textArea: { x: 0.17, y: 0.36, w: 0.66, h: 0.26 },
  justify: "center",
  title: { font: "montserrat", size: 0.058, color: "#2E2A26", weight: 600, upper: true, tracking: 0.12, lineHeight: 1.15 },
  subtitle: { font: "montserrat", size: 0.03, color: "#6B635B", weight: 400 },
  names: { font: "montserrat", size: 0.026, color: "#6B635B", weight: 500, upper: true, tracking: 0.2 },
  ornament: { kind: "dots", color: "#C77C6B" },
  spine: { color: "#2E2A26", font: "montserrat" },
  back: { color: "#2E2A26", font: "montserrat", mirror: true },
};
