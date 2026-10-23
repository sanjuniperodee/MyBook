import type { InteriorDesign } from "../types";

/**
 * Воздух: минимализм — тонкие прописные Raleway с широкой разрядкой, узкая колонка Inter Tight влево с крупными
 * отбивками, без виньеток и колонтитулов; между историями — только пустая строка, название книги внизу титула.
 */
export const airy: InteriorDesign = {
  id: "airy",
  mood: "modern",
  direction: "minimal",
  type: { heading: "intertight", headingWeight: 600, headingItalic: false, body: "intertight", bodySize: 9.3, lineHeight: 1.7 },
  display: { font: "raleway", weight: 300, upper: true, tracking: 0.28 },
  label: { font: "intertight", weight: 400, upper: true, tracking: 0.32, size: 5.8 },
  palette: { ink: "#262626", muted: "#8A8A8A", accent: "#5E7C74", rule: "#E2E2E2", ornament: "#BDBDBD" },
  ornament: "dot",
  opener: {
    align: "left",
    number: "padded",
    numeral: { font: "raleway", weight: 300, size: 20 },
    titleSize: 20,
    top: 0.42,
    vignette: false,
  },
  heading: { align: "left", size: 1.18, face: { font: "intertight", weight: 600, upper: true, tracking: 0.12 } },
  divider: "space",
  leadIn: false,
  folio: { align: "outer", font: "label" },
  runningHead: "none",
  frame: "none",
  photos: { frame: "none", caption: "label" },
  text: { align: "left", indent: 0, paraGap: 0.9, measure: 0.86 },
  quote: { face: { font: "raleway", weight: 400, italic: true }, style: "rule" },
  titlePage: { layout: "bottom", size: 26 },
  pairsWith: ["minimal", "mist", "clouds", "fade", "mono", "marble"],
};
