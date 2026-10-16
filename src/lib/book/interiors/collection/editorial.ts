import type { InteriorDesign } from "../types";

export const editorial: InteriorDesign = {
  id: "editorial",
  mood: "modern",
  type: { heading: "playfair", headingWeight: 400, headingItalic: false, body: "lora", bodySize: 10, lineHeight: 1.55 },
  display: { font: "playfair", weight: 400 },
  label: { font: "montserrat", weight: 600, upper: true, tracking: 0.22, size: 6.4 },
  palette: { ink: "#201B18", muted: "#7A6B62", accent: "#B4532F", rule: "#DCCFC5", ornament: "#B4532F" },
  ornament: "bar",
  opener: {
    align: "left",
    number: "padded",
    numeral: { font: "playfair", weight: 400, size: 76 },
    titleSize: 26,
    top: 0.2,
  },
  heading: { align: "left", size: 1.5, bar: true },
  divider: "rule",
  leadIn: true,
  folio: { align: "outer", font: "label" },
  runningHead: "ruled",
  frame: "none",
  photos: { frame: "none", caption: "label" },
  pairsWith: ["terracotta", "mountains", "ocean", "terrazzo", "steppe", "autumn", "magazine", "film"],
};
