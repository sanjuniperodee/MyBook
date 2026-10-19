import type { InteriorDesign } from "../types";

/** Фотокнига: каждая глава открывается снимком во всю ширину, строгая типографика и подписи прописными. */
export const photobook: InteriorDesign = {
  id: "photobook",
  mood: "modern",
  type: { heading: "cormorant", headingWeight: 500, headingItalic: false, body: "lora", bodySize: 10, lineHeight: 1.55 },
  display: { font: "cormorant", weight: 500 },
  label: { font: "montserrat", weight: 500, upper: true, tracking: 0.32, size: 6.4 },
  palette: { ink: "#221E1B", muted: "#79706A", accent: "#8E6448", rule: "#DDD5CC", ornament: "#B08A6E" },
  ornament: "bar",
  opener: { align: "center", number: "label", titleSize: 28, top: 0.3, photo: "bleed" },
  heading: { align: "left", size: 1.5 },
  divider: "rule",
  leadIn: true,
  folio: { align: "outer", font: "label" },
  runningHead: "none",
  frame: "none",
  photos: { frame: "none", caption: "label" },
  pairsWith: ["magazine", "mosaic", "collage", "film", "duotone", "photo", "grid", "split", "diptych"],
};
