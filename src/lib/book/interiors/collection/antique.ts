import type { InteriorDesign } from "../types";

/**
 * Летопись: старинное издание — Old Standard на кремовой бумаге, названия глав прописными с разрядкой, служебные
 * надписи капителью Cormorant SC, буквица на три строки, астеризм, плющ, рамка с флеронами и колонцифры с тире.
 */
export const antique: InteriorDesign = {
  id: "antique",
  mood: "classic",
  direction: "vintage",
  type: { heading: "oldstandard", headingWeight: 400, headingItalic: true, body: "oldstandard", bodySize: 10.3, lineHeight: 1.5 },
  display: { font: "oldstandard", weight: 700, upper: true, tracking: 0.12 },
  label: { font: "cormorantsc", weight: 600, tracking: 0.18, size: 8.2 },
  palette: { ink: "#3A2A1C", muted: "#7D6650", accent: "#8A3B22", rule: "#D2BF9F", ornament: "#7B5A34" },
  ornament: "hedera",
  opener: { align: "center", number: "roman", numeral: { font: "oldstandard", weight: 400, italic: true, size: 30 }, titleSize: 19, top: 0.34 },
  heading: { align: "center", size: 1.25, face: { font: "oldstandard", weight: 400, italic: true } },
  divider: "asterism",
  leadIn: false,
  folio: { align: "center", dashes: true },
  runningHead: "plain",
  frame: "vintage",
  photos: { frame: "corners", caption: "italic" },
  paper: "#FBF5E9",
  text: { align: "justify", indent: 1.5, paraGap: 0 },
  quote: { face: { font: "oldstandard", weight: 400, italic: true }, style: "center" },
  dropCap: { style: "drop", lines: 3, face: { font: "oldstandard", weight: 700 }, color: "accent" },
  titlePage: { layout: "center", size: 26 },
  pairsWith: ["leather", "medallion", "postcards", "saddle", "retro", "herbarium"],
};
