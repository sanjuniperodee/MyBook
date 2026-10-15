import type { InteriorDesign } from "../types";

export const airmail: InteriorDesign = {
  id: "airmail",
  mood: "romance",
  type: { heading: "playfair", headingWeight: 400, headingItalic: true, body: "ptserif", bodySize: 10.5, lineHeight: 1.5 },
  display: { font: "playfair", weight: 400, italic: true },
  label: { font: "montserrat", weight: 500, upper: true, tracking: 0.3, size: 6.4 },
  palette: { ink: "#2A231C", muted: "#7A6A5A", accent: "#B7323F", rule: "#D8CBB8", ornament: "#2F5D8C" },
  ornament: "heart",
  opener: { align: "center", number: "label", kicker: { font: "caveat", weight: 500, size: 19 }, titleSize: 26, top: 0.32 },
  heading: { align: "left", size: 1.5 },
  divider: "stars",
  leadIn: false,
  folio: { align: "center" },
  runningHead: "none",
  frame: "airmail",
  photos: { frame: "polaroid", caption: "hand" },
  pairsWith: ["letter", "script", "hearts", "stamp"],
};
