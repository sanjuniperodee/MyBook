import type { InteriorDesign } from "../types";

export const stars: InteriorDesign = {
  id: "stars",
  mood: "romance",
  type: { heading: "cormorant", headingWeight: 500, headingItalic: false, body: "ptserif", bodySize: 10.5, lineHeight: 1.5 },
  display: { font: "cormorant", weight: 500, italic: true },
  label: { font: "montserrat", weight: 500, upper: true, tracking: 0.36, size: 6.6 },
  palette: { ink: "#1C2033", muted: "#6B6E86", accent: "#2D3C6E", rule: "#CBC3AE", ornament: "#B8975A" },
  ornament: "sparkle",
  opener: {
    align: "center",
    number: "digits",
    numeral: { font: "cormorant", weight: 500, italic: true, size: 64 },
    titleSize: 28,
    top: 0.24,
    art: "stars",
    fill: { paper: "#18203F", ink: "#F2E6C4", muted: "#C9BC97", accent: "#E2C887", rule: "#5D6590", ornament: "#D8BD80" },
  },
  heading: { align: "left", size: 1.55, accent: true },
  divider: "glyph",
  leadIn: false,
  folio: { align: "center" },
  runningHead: "none",
  frame: "none",
  photos: { frame: "hairline", caption: "label" },
  pairsWith: ["midnight", "constellation", "milkyway", "lights", "alatau"],
};
