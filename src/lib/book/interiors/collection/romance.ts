import type { InteriorDesign } from "../types";

export const romance: InteriorDesign = {
  id: "romance",
  mood: "romance",
  type: { heading: "cormorant", headingWeight: 500, headingItalic: true, body: "lora", bodySize: 10, lineHeight: 1.55 },
  display: { font: "cormorant", weight: 500, italic: true },
  label: { font: "cormorant", weight: 600, upper: true, tracking: 0.26, size: 8 },
  palette: { ink: "#2B1F22", muted: "#85666B", accent: "#9E3A4A", rule: "#DCC3C6", ornament: "#B5525F" },
  ornament: "heart",
  opener: { align: "center", number: "label", titleSize: 30, top: 0.32 },
  heading: { align: "center", size: 1.7, accent: true },
  divider: "glyph",
  leadIn: true,
  folio: { align: "center" },
  runningHead: "none",
  frame: "corners",
  photos: { frame: "hairline", caption: "italic" },
  pairsWith: ["blossom", "hearts", "script", "tulips", "peony", "roses", "velvet", "bouquet", "tenderness", "dusk", "heart", "medallion"],
};
