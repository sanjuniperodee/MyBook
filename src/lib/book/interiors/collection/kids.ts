import type { InteriorDesign } from "../types";

/**
 * Детская: дружелюбная и удобная для чтения — круглый Comfortaa в названиях и заголовках, крупный Nunito влево
 * с отбивками, конфетти на начальных полосах, крупные цифры глав, буквица на две строки и подписи Pangolin.
 */
export const kids: InteriorDesign = {
  id: "kids",
  mood: "bright",
  direction: "kids",
  type: { heading: "comfortaa", headingWeight: 700, headingItalic: false, body: "nunito", bodySize: 11.5, lineHeight: 1.65 },
  display: { font: "comfortaa", weight: 700 },
  label: { font: "nunito", weight: 700, upper: true, tracking: 0.16, size: 7 },
  palette: { ink: "#2A2D3A", muted: "#6F7387", accent: "#F06C4F", rule: "#F3D8CF", ornament: "#3BA7C9" },
  ornament: "confetti",
  opener: { align: "center", number: "digits", numeral: { font: "comfortaa", weight: 700, size: 72 }, titleSize: 26, top: 0.24, art: "confetti" },
  heading: { align: "left", size: 1.4, accent: true, face: { font: "comfortaa", weight: 700 } },
  divider: "glyph",
  leadIn: false,
  folio: { align: "center" },
  runningHead: "none",
  frame: "none",
  photos: { frame: "polaroid", caption: "italic", captionFace: { font: "pangolin", weight: 400 } },
  text: { align: "left", indent: 0, paraGap: 0.7 },
  quote: { face: { font: "comfortaa", weight: 400 }, style: "center" },
  dropCap: { style: "drop", lines: 2, face: { font: "comfortaa", weight: 700 }, color: "accent" },
  titlePage: { layout: "center", size: 34 },
  pairsWith: ["party", "lemons", "mint", "sunrise", "circle", "collage"],
};
