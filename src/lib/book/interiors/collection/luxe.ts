import type { InteriorDesign } from "../types";

/**
 * Люкс: премиальное издание — чёрные начальные полосы с золотом, прописные Forum с широкой разрядкой, капитель
 * Cormorant SC, двойная рамка парадных полос, римские цифры, Spectral с красной строкой и буквица на две строки.
 */
export const luxe: InteriorDesign = {
  id: "luxe",
  mood: "classic",
  direction: "luxury",
  type: { heading: "cormorantsc", headingWeight: 600, headingItalic: false, body: "spectral", bodySize: 10, lineHeight: 1.55 },
  display: { font: "forum", weight: 400, upper: true, tracking: 0.22 },
  label: { font: "cormorantsc", weight: 600, upper: true, tracking: 0.3, size: 7.2 },
  palette: { ink: "#151311", muted: "#6E665B", accent: "#A8874B", rule: "#D8CBB0", ornament: "#A8874B" },
  ornament: "sparkle",
  opener: {
    align: "center",
    number: "roman",
    numeral: { font: "forum", weight: 400, size: 40 },
    titleSize: 22,
    top: 0.32,
    fill: { paper: "#141414", ink: "#F3EBDD", muted: "#BFB39E", accent: "#C9A86A", rule: "#5A5246", ornament: "#C9A86A" },
  },
  heading: { align: "center", size: 1.3, face: { font: "cormorantsc", weight: 600, tracking: 0.08 } },
  divider: "glyph",
  leadIn: false,
  folio: { align: "center", font: "label" },
  runningHead: "plain",
  frame: "double",
  photos: { frame: "mat", caption: "label" },
  text: { align: "justify", indent: 1.2, paraGap: 0.1 },
  quote: { face: { font: "spectral", weight: 400, italic: true }, style: "center" },
  dropCap: { style: "drop", lines: 2, face: { font: "forum", weight: 400 }, color: "accent" },
  titlePage: { layout: "center", size: 28 },
  pairsWith: ["velvet", "deco", "leather", "midnight", "glow", "dusk"],
};
