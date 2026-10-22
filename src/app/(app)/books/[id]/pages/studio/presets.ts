/**
 * Готовые пары шрифтов и палитры студии оформления: быстрый старт, дальше любую роль и цвет можно поменять отдельно.
 * Насыщенность — из начертаний, которые у шрифта есть (fonts.ts).
 */
import type { FontPick, InteriorPalette, InteriorStyle } from "@/lib/book/interiors";

export interface FontPair {
  id: string;
  fonts: NonNullable<InteriorStyle["fonts"]>;
  /** Прописные и разрядка крупных надписей — часть характера пары. */
  display?: Pick<NonNullable<InteriorStyle["display"]>, "upper" | "tracking">;
}

const f = (font: FontPick["font"], weight?: number, italic?: boolean): FontPick => ({ font, ...(weight ? { weight } : {}), ...(italic ? { italic } : {}) });

export const fontPairs: FontPair[] = [
  { id: "garamond", fonts: { display: f("ebgaramond", 500), heading: f("ebgaramond", 500, true), body: f("ebgaramond"), label: f("cormorantsc", 600), numeral: f("cormorantsc", 600) }, display: { upper: false, tracking: 0 } },
  { id: "playfair", fonts: { display: f("playfair"), heading: f("playfair", 600), body: f("lora"), label: f("montserrat", 500), numeral: f("playfair") }, display: { upper: false, tracking: 0 } },
  { id: "prata", fonts: { display: f("prata"), heading: f("prata"), body: f("spectral"), label: f("cormorantsc", 600), numeral: f("prata") }, display: { upper: false, tracking: 0 } },
  { id: "literata", fonts: { display: f("notodisplay", 600), heading: f("notodisplay", 600), body: f("literata"), label: f("intertight", 600), numeral: f("notodisplay") }, display: { upper: false, tracking: 0 } },
  { id: "forum", fonts: { display: f("forum"), heading: f("cormorantsc", 600), body: f("spectral"), label: f("cormorantsc", 600), numeral: f("forum") }, display: { upper: true, tracking: 0.2 } },
  { id: "vintage", fonts: { display: f("oldstandard", 700), heading: f("oldstandard", 400, true), body: f("oldstandard"), label: f("cormorantsc", 600), numeral: f("oldstandard", 700) }, display: { upper: true, tracking: 0.1 } },
  { id: "romance", fonts: { display: f("alice"), heading: f("cormorant", 500, true), body: f("lora"), label: f("cormorantsc", 600), numeral: f("cormorant", 500, true) }, display: { upper: false, tracking: 0 } },
  { id: "yeseva", fonts: { display: f("yeseva"), heading: f("yeseva"), body: f("alegreya"), label: f("alegreya", 700), numeral: f("yeseva") }, display: { upper: false, tracking: 0 } },
  { id: "geologica", fonts: { display: f("geologica", 800), heading: f("geologica", 700), body: f("intertight"), label: f("geologica"), numeral: f("geologica", 800) }, display: { upper: true, tracking: 0.03 } },
  { id: "raleway", fonts: { display: f("raleway", 300), heading: f("raleway", 600), body: f("raleway"), label: f("raleway", 600), numeral: f("raleway", 300) }, display: { upper: true, tracking: 0.25 } },
  { id: "oswald", fonts: { display: f("oswald", 600), heading: f("oswald", 600), body: f("spectral"), label: f("oswald"), numeral: f("oswald", 600) }, display: { upper: true, tracking: 0.02 } },
  { id: "kids", fonts: { display: f("comfortaa", 700), heading: f("comfortaa", 700), body: f("nunito"), label: f("nunito", 700), numeral: f("comfortaa", 700) }, display: { upper: false, tracking: 0 } },
  { id: "hand", fonts: { display: f("caveat"), heading: f("pangolin"), body: f("nunito"), label: f("pangolin"), numeral: f("caveat") }, display: { upper: false, tracking: 0 } },
];

export interface Palette {
  id: "classic" | "wine" | "emerald" | "night" | "terracotta" | "sage" | "sepia" | "mono" | "rose" | "ocean" | "gold" | "berry";
  colors: InteriorPalette;
}

const p = (ink: string, muted: string, accent: string, rule: string, ornament: string): InteriorPalette => ({ ink, muted, accent, rule, ornament });

export const palettes: Palette[] = [
  { id: "classic", colors: p("#1F1A17", "#7A7068", "#7A7068", "#B4A99E", "#B4A99E") },
  { id: "wine", colors: p("#1F1A17", "#7A6A64", "#7A1F2B", "#D8C6C0", "#9A3A45") },
  { id: "emerald", colors: p("#16231E", "#5F6E66", "#1F5C4A", "#C9D6CF", "#B08D57") },
  { id: "night", colors: p("#151A2E", "#646A80", "#2E3A6E", "#CBD0DF", "#B8925A") },
  { id: "terracotta", colors: p("#2A1E18", "#85695C", "#B4532F", "#E2CDBF", "#B4532F") },
  { id: "sage", colors: p("#1E231C", "#6C7566", "#5E7350", "#CFD8C8", "#7D8B6A") },
  { id: "sepia", colors: p("#3B2A1E", "#7D6652", "#8A5A2B", "#D9C7AE", "#8A5A2B") },
  { id: "mono", colors: p("#111111", "#6B6B6B", "#111111", "#CCCCCC", "#444444") },
  { id: "rose", colors: p("#2B1E22", "#8A7077", "#B05A6E", "#EAD3D8", "#C98A98") },
  { id: "ocean", colors: p("#14262E", "#5E7680", "#1F6F78", "#C6DADD", "#3B8E95") },
  { id: "gold", colors: p("#151311", "#6E665B", "#A8874B", "#D8CBB0", "#A8874B") },
  { id: "berry", colors: p("#24141E", "#7A6270", "#8E2C5E", "#E0C8D4", "#8E2C5E") },
];

/** Тона бумаги: белая (как по умолчанию), слоновая кость, кремовая, тёплая, серая. */
export const papers = ["#FFFFFF", "#FFFDF7", "#FBF5E9", "#F7EFE2", "#F4F2EE"];

/** Цвета начальных полос глав. */
export const openerFills = ["#141414", "#1D2A44", "#1F3B33", "#5C1520", "#3B2A1E", "#F3EDE3", "#E9D8CF", "#DCE5DA"];
