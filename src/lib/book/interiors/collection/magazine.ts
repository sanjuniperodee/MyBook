import type { InteriorDesign } from "../types";

/**
 * Глянец: динамичная журнальная вёрстка — узкий Oswald прописными в названиях и заголовках, красный акцент,
 * номер главы на полполосы, буквица Oswald на две строки, крупная кавычка, линейка колонтитула и колонцифры снаружи.
 */
export const magazine: InteriorDesign = {
  id: "magazine",
  mood: "bright",
  direction: "magazine",
  type: { heading: "oswald", headingWeight: 600, headingItalic: false, body: "spectral", bodySize: 9.6, lineHeight: 1.5 },
  display: { font: "oswald", weight: 600, upper: true, tracking: 0.02 },
  label: { font: "oswald", weight: 400, upper: true, tracking: 0.2, size: 7 },
  palette: { ink: "#111111", muted: "#5F5F5F", accent: "#E0262F", rule: "#DADADA", ornament: "#E0262F" },
  ornament: "bar",
  opener: {
    align: "left",
    number: "padded",
    numeral: { font: "oswald", weight: 600, size: 110 },
    titleSize: 34,
    top: 0.12,
    vignette: false,
  },
  heading: { align: "left", size: 1.45, accent: true, bar: true, face: { font: "oswald", weight: 600, upper: true, tracking: 0.03 } },
  divider: "rule",
  leadIn: false,
  folio: { align: "outer", font: "label" },
  runningHead: "ruled",
  frame: "none",
  photos: { frame: "none", caption: "label" },
  text: { align: "justify", indent: 0, paraGap: 0.5 },
  quote: { face: { font: "oswald", weight: 400 }, style: "mark" },
  dropCap: { style: "drop", lines: 2, face: { font: "oswald", weight: 600 }, color: "accent" },
  titlePage: { layout: "stack", size: 52 },
  pairsWith: ["magazine", "film", "strips", "duotone", "retro", "autumn"],
};
