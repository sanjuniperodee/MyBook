import type { InteriorDesign } from "../types";

export const deco: InteriorDesign = {
  id: "deco",
  mood: "classic",
  type: { heading: "playfair", headingWeight: 400, headingItalic: false, body: "ptserif", bodySize: 10.5, lineHeight: 1.5 },
  display: { font: "playfair", weight: 400, upper: true, tracking: 0.1 },
  label: { font: "montserrat", weight: 500, upper: true, tracking: 0.4, size: 6.4 },
  palette: { ink: "#171614", muted: "#6E675A", accent: "#9A7838", rule: "#CDBA8E", ornament: "#A8884A" },
  ornament: "fan",
  opener: {
    align: "center",
    number: "roman",
    numeral: { font: "playfair", weight: 400, size: 30 },
    titleSize: 19,
    top: 0.4,
    art: "sunburst",
  },
  heading: { align: "center", size: 1.45 },
  divider: "rule",
  leadIn: true,
  folio: { align: "center", dashes: true },
  runningHead: "none",
  frame: "deco",
  photos: { frame: "double", caption: "label" },
  pairsWith: ["deco", "noir", "leather"],
};
