import type { InteriorDesign } from "../types";

/** Море: слои волн у края полосы, чайки и бирюзовые заголовки. */
export const sea: InteriorDesign = {
  id: "sea",
  mood: "bright",
  type: { heading: "cormorant", headingWeight: 500, headingItalic: true, body: "ptserif", bodySize: 10.5, lineHeight: 1.5 },
  display: { font: "cormorant", weight: 500, italic: true },
  label: { font: "montserrat", weight: 500, upper: true, tracking: 0.3, size: 6.4 },
  palette: { ink: "#172A33", muted: "#5E7480", accent: "#1F5F7A", rule: "#C9DCE3", ornament: "#3E86A0" },
  ornament: "wave",
  opener: { align: "center", number: "label", titleSize: 29, top: 0.26, art: "waves" },
  heading: { align: "left", size: 1.6, accent: true },
  divider: "glyph",
  leadIn: true,
  folio: { align: "center" },
  runningHead: "none",
  frame: "none",
  photos: { frame: "hairline", caption: "italic" },
  pairsWith: ["ocean", "lemons", "surf"],
};
