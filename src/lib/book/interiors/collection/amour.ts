import type { InteriorDesign } from "../types";

/**
 * История любви: романтика — названия глав сказочным Alice, «Глава» от руки (Bad Script), курсивные заголовки
 * Cormorant цвета розы, сердечки, уголки на парадных полосах, буквица на три строки и подписи к фото от руки.
 */
export const amour: InteriorDesign = {
  id: "amour",
  mood: "romance",
  direction: "romantic",
  type: { heading: "cormorant", headingWeight: 500, headingItalic: true, body: "lora", bodySize: 10, lineHeight: 1.6 },
  display: { font: "alice", weight: 400 },
  label: { font: "montserrat", weight: 500, upper: true, tracking: 0.3, size: 6.2 },
  palette: { ink: "#2B1F22", muted: "#8A6F74", accent: "#B4485F", rule: "#E8CDD3", ornament: "#C9798A" },
  ornament: "heart",
  opener: { align: "center", number: "label", kicker: { font: "badscript", weight: 400, size: 17 }, titleSize: 27, top: 0.3 },
  heading: { align: "center", size: 1.55, accent: true, face: { font: "cormorant", weight: 500, italic: true } },
  divider: "glyph",
  leadIn: false,
  folio: { align: "center" },
  runningHead: "none",
  frame: "corners",
  photos: { frame: "polaroid", caption: "hand" },
  text: { align: "justify", indent: 1, paraGap: 0.2 },
  quote: { face: { font: "cormorant", weight: 500, italic: true }, style: "center" },
  dropCap: { style: "drop", lines: 3, face: { font: "alice", weight: 400 }, color: "accent" },
  titlePage: { layout: "center", size: 32 },
  pairsWith: ["peony", "roses", "heart", "tenderness", "bouquet", "letter"],
};
