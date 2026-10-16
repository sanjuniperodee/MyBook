import type { InteriorDesign } from "../types";

/** Горы: сиреневые хребты Алатау со снежными шапками у нижнего края начальной полосы. */
export const mountains: InteriorDesign = {
  id: "mountains",
  mood: "tender",
  type: { heading: "cormorant", headingWeight: 600, headingItalic: false, body: "lora", bodySize: 10, lineHeight: 1.55 },
  display: { font: "cormorant", weight: 600 },
  label: { font: "montserrat", weight: 500, upper: true, tracking: 0.3, size: 6.4 },
  palette: { ink: "#2B2333", muted: "#76687F", accent: "#5B3F66", rule: "#DCD2E0", ornament: "#9C7CA5" },
  ornament: "peak",
  opener: {
    align: "center",
    number: "digits",
    numeral: { font: "cormorant", weight: 500, size: 56 },
    titleSize: 28,
    top: 0.18,
    art: "mountains",
  },
  heading: { align: "left", size: 1.55, accent: true },
  divider: "glyph",
  leadIn: false,
  folio: { align: "center" },
  runningHead: "none",
  frame: "none",
  photos: { frame: "hairline", caption: "label" },
  pairsWith: ["mountains", "sunrise", "alatau", "peaks", "mist"],
};
