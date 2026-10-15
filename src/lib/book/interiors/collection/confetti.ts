import type { InteriorDesign } from "../types";

/** Конфетти: праздник для книги другу — яркие конфетти, крупные цифры, розовый акцент. */
export const confetti: InteriorDesign = {
  id: "confetti",
  mood: "bright",
  type: { heading: "onest", headingWeight: 600, headingItalic: false, body: "lora", bodySize: 10, lineHeight: 1.55 },
  display: { font: "onest", weight: 600 },
  label: { font: "onest", weight: 600, upper: true, tracking: 0.18, size: 6.6 },
  palette: { ink: "#1E1B2E", muted: "#6B6880", accent: "#D9466E", rule: "#E6E1EC", ornament: "#F2A93B" },
  ornament: "confetti",
  opener: {
    align: "center",
    number: "digits",
    numeral: { font: "onest", weight: 700, size: 72 },
    titleSize: 25,
    top: 0.3,
    art: "confetti",
  },
  heading: { align: "left", size: 1.45 },
  divider: "glyph",
  leadIn: true,
  folio: { align: "center", font: "label" },
  runningHead: "none",
  frame: "none",
  photos: { frame: "polaroid", caption: "hand" },
  pairsWith: ["terracotta", "terrazzo", "lemons", "party"],
};
