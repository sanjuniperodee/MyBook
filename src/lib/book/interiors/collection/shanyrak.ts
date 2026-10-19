import type { InteriorDesign } from "../types";

/** Шаңырақ — венец юрты, символ дома и рода: над каждой главой, терракота и охра. */
export const shanyrak: InteriorDesign = {
  id: "shanyrak",
  mood: "classic",
  type: { heading: "cormorant", headingWeight: 600, headingItalic: false, body: "ptserif", bodySize: 10.5, lineHeight: 1.5 },
  display: { font: "cormorant", weight: 500 },
  label: { font: "montserrat", weight: 500, upper: true, tracking: 0.32, size: 6.6 },
  palette: { ink: "#2A1F1A", muted: "#7A6656", accent: "#A4452C", rule: "#DCC7B5", ornament: "#B07A3A" },
  ornament: "shanyrak",
  opener: { align: "center", number: "label", titleSize: 27, top: 0.44, art: "shanyrak" },
  heading: { align: "left", size: 1.55, accent: true },
  divider: "glyph",
  leadIn: true,
  folio: { align: "center" },
  runningHead: "none",
  frame: "none",
  photos: { frame: "double", caption: "italic" },
  pairsWith: ["oyu", "terracotta", "leather"],
};
