import type { InteriorDesign } from "../types";

/**
 * Геометрия: актуальная типографика — Montserrat Alternates в названиях, плотный Geologica в заголовках с плашкой,
 * гигантский номер главы кобальтом у левого края, Onest влево, поднятая буквица и крупный набор на титуле.
 */
export const contemporary: InteriorDesign = {
  id: "contemporary",
  mood: "modern",
  direction: "contemporary",
  type: { heading: "geologica", headingWeight: 800, headingItalic: false, body: "onest", bodySize: 9.8, lineHeight: 1.6 },
  display: { font: "montalt", weight: 600 },
  label: { font: "montalt", weight: 600, upper: true, tracking: 0.18, size: 6.2 },
  palette: { ink: "#14161F", muted: "#6A6F82", accent: "#2F5BEA", rule: "#DCE0EA", ornament: "#2F5BEA" },
  ornament: "bar",
  opener: {
    align: "left",
    number: "padded",
    numeral: { font: "geologica", weight: 800, size: 120 },
    titleSize: 28,
    top: 0.1,
    vignette: false,
  },
  heading: { align: "left", size: 1.5, bar: true, face: { font: "geologica", weight: 800 } },
  divider: "rule",
  leadIn: false,
  folio: { align: "outer", font: "label" },
  runningHead: "none",
  frame: "none",
  photos: { frame: "none", caption: "label" },
  text: { align: "left", indent: 0, paraGap: 0.65 },
  quote: { face: { font: "montalt", weight: 600 }, style: "rule" },
  dropCap: { style: "raised", lines: 2, face: { font: "geologica", weight: 800 }, color: "accent" },
  titlePage: { layout: "stack", size: 46 },
  pairsWith: ["minimal", "split", "glow", "indigo", "mosaic", "surf"],
};
