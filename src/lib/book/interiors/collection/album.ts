import type { InteriorDesign } from "../types";

/** Альбом: цветной скотч на начальных полосах и заголовки «синей ручкой». */
export const album: InteriorDesign = {
  id: "album",
  mood: "tender",
  type: { heading: "caveat", headingWeight: 500, headingItalic: false, body: "lora", bodySize: 10, lineHeight: 1.55 },
  display: { font: "caveat", weight: 500 },
  label: { font: "montserrat", weight: 500, upper: true, tracking: 0.3, size: 6.4 },
  palette: { ink: "#2B2622", muted: "#7A6F66", accent: "#2F5D8C", rule: "#DDD3C6", ornament: "#2F5D8C" },
  ornament: "scribble",
  opener: { align: "center", number: "label", titleSize: 38, top: 0.32, art: "tape" },
  heading: { align: "left", size: 2, accent: true },
  divider: "glyph",
  leadIn: false,
  folio: { align: "center" },
  runningHead: "none",
  frame: "none",
  photos: { frame: "polaroid", caption: "hand" },
  pairsWith: ["photo", "herbarium", "letter", "lemons", "polaroid", "collage", "stack"],
};
