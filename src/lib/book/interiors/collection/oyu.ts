import type { InteriorDesign } from "../types";

export const oyu: InteriorDesign = {
  id: "oyu",
  mood: "classic",
  type: { heading: "cormorant", headingWeight: 600, headingItalic: false, body: "ptserif", bodySize: 10.5, lineHeight: 1.5 },
  display: { font: "cormorant", weight: 500 },
  label: { font: "montserrat", weight: 500, upper: true, tracking: 0.32, size: 6.6 },
  palette: { ink: "#1B2422", muted: "#5E6D68", accent: "#0F5246", rule: "#D3C29C", ornament: "#B08D4A" },
  ornament: "ram",
  opener: {
    align: "center",
    number: "label",
    titleSize: 27,
    top: 0.42,
    art: "oyu",
    fill: { paper: "#0E3B33", ink: "#EED6A0", muted: "#C9B583", accent: "#DDBE7C", rule: "#5F8C7E", ornament: "#C9A45C" },
  },
  heading: { align: "left", size: 1.55, accent: true },
  divider: "glyph",
  leadIn: true,
  folio: { align: "center", dashes: true },
  runningHead: "none",
  frame: "double",
  photos: { frame: "double", caption: "label" },
  pairsWith: ["oyu"],
};
