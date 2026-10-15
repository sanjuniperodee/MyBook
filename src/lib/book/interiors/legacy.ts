/**
 * «classic», «modern» и «minimal» — прежние стили вёрстки. Заказанные с ними книги должны
 * печататься так, как клиент видел их в макете, поэтому облик этих дизайнов не меняем.
 */
import type { Typography } from "../fonts";
import type { InteriorDesign, InteriorId, InteriorMood, InteriorPalette } from "./types";

export const legacyPalette: InteriorPalette = { ink: "#1F1A17", muted: "#7A7068", accent: "#7A7068", rule: "#B4A99E", ornament: "#B4A99E" };

export const legacy = (
  id: InteriorId,
  mood: InteriorMood,
  type: Typography,
  pairsWith: string[],
): InteriorDesign => ({
  id,
  mood,
  type,
  display: { font: type.heading, weight: type.headingWeight >= 500 ? 500 : 400 },
  label: { font: type.body, weight: 400, upper: true, tracking: 2.2 / 7.5, size: 7.5 },
  palette: legacyPalette,
  ornament: "diamond",
  opener: { align: "center", number: "label", titleSize: 26, top: 0.3 },
  heading: { align: "left", size: 1.55 },
  divider: "stars",
  leadIn: false,
  folio: { align: "center" },
  runningHead: "none",
  frame: "none",
  photos: { frame: "none", caption: "italic" },
  pairsWith,
});

export const classic = legacy(
  "classic",
  "classic",
  { heading: "cormorant", headingWeight: 500, headingItalic: false, body: "ptserif", bodySize: 10.5, lineHeight: 1.5 },
  ["linen", "leather", "photo", "marble", "flax"],
);

export const modern = legacy(
  "modern",
  "modern",
  { heading: "playfair", headingWeight: 400, headingItalic: true, body: "lora", bodySize: 10, lineHeight: 1.55 },
  ["noir", "ocean"],
);

export const minimal = legacy(
  "minimal",
  "modern",
  { heading: "montserrat", headingWeight: 500, headingItalic: false, body: "montserrat", bodySize: 9.5, lineHeight: 1.6 },
  ["terrazzo", "photo"],
);
