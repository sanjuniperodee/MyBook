import type { InteriorDesign } from "../types";

/** Воспоминания: глава открывается полароидом на скотче на тёплой бумаге, подписи к фото — от руки. */
export const memories: InteriorDesign = {
  id: "memories",
  mood: "tender",
  type: { heading: "cormorant", headingWeight: 500, headingItalic: true, body: "ptserif", bodySize: 10.5, lineHeight: 1.5 },
  display: { font: "cormorant", weight: 500, italic: true },
  label: { font: "montserrat", weight: 500, upper: true, tracking: 0.3, size: 6.4 },
  palette: { ink: "#2E2622", muted: "#857266", accent: "#A0533F", rule: "#E2D3C3", ornament: "#C08A6A" },
  ornament: "heart",
  opener: {
    align: "center",
    number: "label",
    kicker: { font: "caveat", weight: 500, size: 18 },
    titleSize: 29,
    top: 0.32,
    photo: "polaroid",
    fill: { paper: "#F5EEE3", ink: "#2E2622", muted: "#857266", accent: "#A0533F", rule: "#DCCBB8", ornament: "#C08A6A" },
  },
  heading: { align: "left", size: 1.6, accent: true },
  divider: "glyph",
  leadIn: false,
  folio: { align: "center" },
  runningHead: "none",
  frame: "none",
  photos: { frame: "polaroid", caption: "hand" },
  pairsWith: ["polaroid", "arch", "heart", "passepartout", "medallion", "stack", "stamp", "retro"],
};
