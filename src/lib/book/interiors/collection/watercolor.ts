import type { InteriorDesign } from "../types";

export const watercolor: InteriorDesign = {
  id: "watercolor",
  mood: "tender",
  type: { heading: "cormorant", headingWeight: 500, headingItalic: true, body: "ptserif", bodySize: 10.5, lineHeight: 1.5 },
  display: { font: "cormorant", weight: 500, italic: true },
  label: { font: "montserrat", weight: 500, upper: true, tracking: 0.32, size: 6.4 },
  palette: { ink: "#2E2430", muted: "#86717F", accent: "#7A4A68", rule: "#E4D3DB", ornament: "#C98B93" },
  ornament: "dot",
  opener: {
    align: "center",
    number: "digits",
    numeral: { font: "cormorant", weight: 500, italic: true, size: 70 },
    titleSize: 28,
    top: 0.26,
    art: "watercolor",
  },
  heading: { align: "left", size: 1.6, accent: true },
  divider: "glyph",
  leadIn: false,
  folio: { align: "center" },
  runningHead: "none",
  frame: "none",
  photos: { frame: "hairline", caption: "italic" },
  pairsWith: ["sunrise", "tulips", "blossom", "mountains", "clouds", "lavender", "sakura", "arch"],
};
