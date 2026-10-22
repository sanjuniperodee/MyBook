import type { InteriorDesign } from "../types";

/**
 * Роман: классическая книжная типографика — EB Garamond, красная строка без отбивок между абзацами, буквица на три
 * строки, римские номера глав капителью, астеризм между сценами и тихие колонтитулы.
 */
export const novel: InteriorDesign = {
  id: "novel",
  mood: "classic",
  direction: "literature",
  type: { heading: "ebgaramond", headingWeight: 500, headingItalic: true, body: "ebgaramond", bodySize: 11, lineHeight: 1.45 },
  display: { font: "ebgaramond", weight: 400 },
  label: { font: "cormorantsc", weight: 600, tracking: 0.16, size: 8 },
  palette: { ink: "#1E1A17", muted: "#6F655C", accent: "#7A1F2B", rule: "#C9BBAA", ornament: "#7A1F2B" },
  ornament: "diamond",
  opener: { align: "center", number: "roman", numeral: { font: "cormorantsc", weight: 400, size: 34 }, titleSize: 24, top: 0.3 },
  heading: { align: "center", size: 1.22, face: { font: "ebgaramond", weight: 500, italic: true } },
  divider: "asterism",
  leadIn: false,
  folio: { align: "center" },
  runningHead: "plain",
  frame: "none",
  photos: { frame: "hairline", caption: "italic" },
  text: { align: "justify", indent: 1.4, paraGap: 0 },
  quote: { face: { font: "ebgaramond", weight: 400, italic: true }, style: "center" },
  dropCap: { style: "drop", lines: 3, face: { font: "ebgaramond", weight: 400 }, color: "accent" },
  titlePage: { layout: "center", size: 30 },
  pairsWith: ["linen", "leather", "flax", "saddle", "marble", "postcards"],
};
