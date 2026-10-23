import type { InteriorDesign } from "../types";

/**
 * Арт-бук: художественная асимметрия — глава начинается низко у левого края с крупной цифры Yeseva One под акварелью,
 * узкая колонка Alegreya влево, бирюза с охрой, снимки с тенью, название книги на титуле — влево.
 */
export const artbook: InteriorDesign = {
  id: "artbook",
  mood: "tender",
  direction: "art",
  type: { heading: "yeseva", headingWeight: 400, headingItalic: false, body: "alegreya", bodySize: 10.4, lineHeight: 1.55 },
  display: { font: "yeseva", weight: 400 },
  label: { font: "raleway", weight: 600, upper: true, tracking: 0.26, size: 6.2 },
  palette: { ink: "#22302E", muted: "#6E7B76", accent: "#B5532C", rule: "#D6CDBF", ornament: "#3E7C78" },
  ornament: "wave",
  opener: {
    align: "left",
    number: "digits",
    numeral: { font: "yeseva", weight: 400, size: 90 },
    titleSize: 30,
    top: 0.42,
    art: "watercolor",
  },
  heading: { align: "left", size: 1.5, accent: true, face: { font: "yeseva", weight: 400 } },
  divider: "glyph",
  leadIn: false,
  folio: { align: "outer" },
  runningHead: "none",
  frame: "none",
  photos: { frame: "shadow", caption: "italic" },
  text: { align: "left", indent: 0, paraGap: 0.6, measure: 0.82 },
  quote: { face: { font: "alegreya", weight: 400, italic: true }, style: "rule" },
  dropCap: { style: "raised", lines: 2, face: { font: "yeseva", weight: 400 }, color: "accent" },
  titlePage: { layout: "left", size: 38 },
  pairsWith: ["sakura", "lavender", "dried", "meadow", "lemons", "sunrise"],
};
