import type { InteriorDesign } from "../types";

/**
 * Объектив: фото в центре — глава открывается снимком во всю ширину под обрез, название ниже плотным Geologica
 * прописными влево, номер главы мелкими цифрами, текст Inter Tight влево, подписи прописными, название книги внизу титула.
 */
export const lens: InteriorDesign = {
  id: "lens",
  mood: "modern",
  direction: "photo",
  type: { heading: "geologica", headingWeight: 700, headingItalic: false, body: "intertight", bodySize: 9.6, lineHeight: 1.6 },
  display: { font: "geologica", weight: 800, upper: true, tracking: 0.04 },
  label: { font: "geologica", weight: 400, upper: true, tracking: 0.3, size: 6 },
  palette: { ink: "#1A1C1E", muted: "#727780", accent: "#1F6F78", rule: "#D9DDE1", ornament: "#1F6F78" },
  ornament: "bar",
  opener: {
    align: "left",
    number: "padded",
    numeral: { font: "geologica", weight: 400, size: 22 },
    titleSize: 24,
    top: 0.3,
    photo: "bleed",
    vignette: false,
  },
  heading: { align: "left", size: 1.35, face: { font: "geologica", weight: 700 } },
  divider: "rule",
  leadIn: false,
  folio: { align: "outer", font: "label" },
  runningHead: "none",
  frame: "none",
  photos: { frame: "hairline", caption: "label" },
  text: { align: "left", indent: 0, paraGap: 0.7 },
  quote: { face: { font: "geologica", weight: 400 }, style: "rule" },
  titlePage: { layout: "bottom", size: 30 },
  pairsWith: ["fade", "split", "duotone", "indigo", "grid", "photo"],
};
