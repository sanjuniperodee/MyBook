import type { CoverTemplate } from "../types";
import { bg, frontRect, label, shadowFilter } from "../svg-kit";

export const linen: CoverTemplate = {
  id: "linen",
  mood: "classic",
  texture: { kind: "linen", opacity: 0.35 },
  swatch: "linear-gradient(135deg,#ece4d6,#ddd2bf)",
  art: (g, { uid }) => {
    const r = frontRect(g, 0.2, 0.3, 0.6, 0.36);
    return `<defs>${shadowFilter(`${uid}s`)}</defs>${bg(g, "#E6DDCD")}${label(r, "#F7F3EC", { stroke: "#CDBFA8", shadowId: `${uid}s` })}`;
  },
  textArea: { x: 0.23, y: 0.32, w: 0.54, h: 0.32 },
  justify: "center",
  title: { font: "cormorant", size: 0.078, color: "#3A2F26", weight: 500, lineHeight: 1.1 },
  subtitle: { font: "cormorant", size: 0.042, color: "#6B5B4B", italic: true },
  names: { font: "cormorant", size: 0.04, color: "#6B5B4B", italic: true },
  ornament: { kind: "line", color: "#B9A88E" },
  spine: { color: "#3A2F26", font: "cormorant" },
  back: { color: "#6B5B4B", font: "cormorant", mirror: true },
};
