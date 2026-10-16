import type { InteriorDesign } from "../types";

/** Луна: глава открывается круглым снимком с кольцом, шалфейные тона и спокойная типографика. */
export const luna: InteriorDesign = {
  id: "luna",
  mood: "tender",
  type: { heading: "cormorant", headingWeight: 500, headingItalic: false, body: "lora", bodySize: 10, lineHeight: 1.55 },
  display: { font: "cormorant", weight: 500 },
  label: { font: "montserrat", weight: 500, upper: true, tracking: 0.34, size: 6.4 },
  palette: { ink: "#27301F", muted: "#6E7764", accent: "#4D5E3E", rule: "#D9DDCC", ornament: "#8C9A78" },
  ornament: "dot",
  opener: {
    align: "center",
    number: "digits",
    numeral: { font: "cormorant", weight: 500, size: 40 },
    titleSize: 27,
    top: 0.3,
    photo: "circle",
  },
  heading: { align: "left", size: 1.55, accent: true },
  divider: "glyph",
  leadIn: false,
  folio: { align: "center" },
  runningHead: "none",
  frame: "none",
  photos: { frame: "hairline", caption: "italic" },
  pairsWith: ["circle", "minimal", "grid", "strips", "diptych", "lavender", "mint"],
};
