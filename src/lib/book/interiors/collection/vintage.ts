import type { InteriorDesign } from "../types";

/** Фолиант: старинная книга — сепия, флероны в углах, римские цифры, колонтитулы. */
export const vintage: InteriorDesign = {
  id: "vintage",
  mood: "classic",
  type: { heading: "cormorant", headingWeight: 600, headingItalic: false, body: "ptserif", bodySize: 10.5, lineHeight: 1.5 },
  display: { font: "cormorant", weight: 600, upper: true, tracking: 0.08 },
  label: { font: "cormorant", weight: 600, upper: true, tracking: 0.24, size: 8 },
  palette: { ink: "#2E2118", muted: "#7A6450", accent: "#7A2E1F", rule: "#D3C3AE", ornament: "#8C6A3F" },
  ornament: "hedera",
  opener: {
    align: "center",
    number: "roman",
    numeral: { font: "cormorant", weight: 500, size: 36 },
    titleSize: 21,
    top: 0.34,
  },
  heading: { align: "center", size: 1.4 },
  divider: "glyph",
  leadIn: true,
  folio: { align: "center", dashes: true },
  runningHead: "plain",
  frame: "vintage",
  photos: { frame: "corners", caption: "italic" },
  pairsWith: ["leather", "linen", "noir", "postcards", "saddle", "medallion", "passepartout", "retro"],
};
