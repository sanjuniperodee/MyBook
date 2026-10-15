import type { InteriorDesign } from "../types";

export const herbarium: InteriorDesign = {
  id: "herbarium",
  mood: "tender",
  type: { heading: "lora", headingWeight: 400, headingItalic: true, body: "lora", bodySize: 10, lineHeight: 1.55 },
  display: { font: "lora", weight: 400, italic: true },
  label: { font: "lora", weight: 400, upper: true, tracking: 0.28, size: 7 },
  palette: { ink: "#26291F", muted: "#6E6C57", accent: "#4F5D3F", rule: "#CFCBB6", ornament: "#7D8B66" },
  ornament: "sprig",
  opener: { align: "center", number: "label", titleSize: 25, top: 0.4, art: "herbarium" },
  heading: { align: "left", size: 1.5, accent: true },
  divider: "glyph",
  leadIn: false,
  folio: { align: "center" },
  runningHead: "plain",
  frame: "none",
  photos: { frame: "tape", caption: "hand", tape: "#E3D7B4" },
  pairsWith: ["herbarium", "sage", "lemons", "eucalyptus", "dried", "meadow", "mint", "tenderness"],
};
