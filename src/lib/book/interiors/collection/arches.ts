import type { InteriorDesign } from "../types";

/** Арка: глава открывается снимком в арочном окне на песочной бумаге, терракотовые акценты. */
export const arches: InteriorDesign = {
  id: "arches",
  mood: "tender",
  type: { heading: "cormorant", headingWeight: 500, headingItalic: true, body: "ptserif", bodySize: 10.5, lineHeight: 1.5 },
  display: { font: "cormorant", weight: 500, italic: true },
  label: { font: "montserrat", weight: 500, upper: true, tracking: 0.32, size: 6.4 },
  palette: { ink: "#3A2A20", muted: "#86705F", accent: "#A0583D", rule: "#E2D2C2", ornament: "#B8865F" },
  ornament: "sparkle",
  opener: {
    align: "center",
    number: "label",
    titleSize: 29,
    top: 0.34,
    photo: "arch",
    fill: { paper: "#F3EADF", ink: "#3A2A20", muted: "#86705F", accent: "#A0583D", rule: "#DECBB7", ornament: "#B8865F" },
  },
  heading: { align: "left", size: 1.6, accent: true },
  divider: "glyph",
  leadIn: false,
  folio: { align: "center" },
  runningHead: "none",
  frame: "none",
  photos: { frame: "shadow", caption: "italic" },
  pairsWith: ["arch", "fade", "circle", "diptych", "heart", "torn"],
};
