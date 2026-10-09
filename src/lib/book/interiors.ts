/**
 * Оформление страниц книги (блока) — каталог готовых дизайнов, как у обложек: шрифты, цвета,
 * виньетки, начальные полосы глав, заголовки вопросов, колонтитулы и колонцифры.
 *
 * Дизайн — только данные. Их одинаково читают PDF для типографии (react-pdf) и превью на сайте
 * (HTML), поэтому клиент видит в редакторе ту же книгу, что уедет в печать. Графика — виньетки,
 * рамки и рисунки на начальных полосах — строится по этим данным в interior-art.ts.
 *
 * «classic», «modern» и «minimal» — прежние стили вёрстки. Заказанные с ними книги должны
 * печататься так, как клиент видел их в макете, поэтому облик этих дизайнов не меняем.
 */
import type { FontKey, Typography } from "./fonts";
import type { PhotoCaption, PhotoFrame } from "./photo-pages";

export type InteriorId =
  | "classic"
  | "modern"
  | "minimal"
  | "romance"
  | "stars"
  | "oyu"
  | "herbarium"
  | "deco"
  | "editorial"
  | "airmail"
  | "watercolor"
  | "shanyrak"
  | "mountains"
  | "sea"
  | "vintage"
  | "album"
  | "confetti"
  | "photobook"
  | "memories";

export type InteriorMood = "classic" | "romance" | "tender" | "bright" | "modern";

export const interiorMoods: InteriorMood[] = ["classic", "romance", "tender", "bright", "modern"];

/** Глиф виньетки: между двумя линейками на титуле, в начале глав и в конце книги. */
export type GlyphId = "diamond" | "heart" | "sparkle" | "ram" | "sprig" | "fan" | "dot" | "bar" | "shanyrak" | "peak" | "wave" | "hedera" | "scribble" | "confetti";

/** Рисунок на начальной полосе главы. */
export type OpenerArt = "stars" | "oyu" | "herbarium" | "sunburst" | "watercolor" | "shanyrak" | "mountains" | "waves" | "tape" | "confetti";

/** Рамка «парадных» полос: титул, посвящение, начала глав, финал. */
export type FrameKind = "none" | "double" | "deco" | "corners" | "airmail" | "vintage";

export interface TextFace {
  font: FontKey;
  weight: number;
  italic?: boolean;
  /** Прописными с разрядкой (трекинг — в долях кегля). */
  upper?: boolean;
  tracking?: number;
}

export interface InteriorPalette {
  /** Основной текст и заголовки. */
  ink: string;
  /** Эпиграфы, подписи, колонтитулы и колонцифры. */
  muted: string;
  /** Номер главы, начальные слова главы, акцентные линейки. */
  accent: string;
  /** Тонкие линии: линейки виньеток, отточия в оглавлении, «* * *». */
  rule: string;
  /** Глифы виньеток, рамки и рисунки. */
  ornament: string;
}

export interface InteriorDesign {
  id: InteriorId;
  mood: InteriorMood;
  /** Основной текст и заголовки вопросов (кегль — для A5, на крупных форматах масштабируется). */
  type: Typography;
  /** Крупные надписи: название на титуле, названия глав, «Содержание». */
  display: TextFace;
  /** Служебные надписи прописными: «Глава 1», имя автора, колонтитулы. Кегль — pt. */
  label: TextFace & { size: number };
  palette: InteriorPalette;
  ornament: GlyphId;
  opener: {
    align: "center" | "left";
    /** Номер главы: подписью «Глава 1», цифрой «1», с нулём «01» или римской «I». */
    number: "label" | "digits" | "padded" | "roman";
    /** Начертание и кегль цифры (для number ≠ "label"). По умолчанию — как у названий. */
    numeral?: TextFace & { size: number };
    /** Подпись «Глава 1» другим начертанием (например, рукописным). */
    kicker?: TextFace & { size: number };
    /** Кегль названия главы, pt. */
    titleSize: number;
    /** Где начинается блок с названием: доля высоты полосы набора. */
    top: number;
    art?: OpenerArt;
    /** Цветная начальная полоса: фон под обрез и цвета текста на нём. */
    fill?: InteriorPalette & { paper: string };
    /**
     * Глава открывается снимком из этой главы: bleed — во всю ширину сверху, под обрез; polaroid — карточка
     * на скотче. Глава без фото открывается обычной полосой.
     */
    photo?: "bleed" | "polaroid";
  };
  heading: {
    align: "left" | "center";
    /** Кегль относительно основного текста. */
    size: number;
    /** Цвет акцента вместо основного. */
    accent?: boolean;
    /** Короткая акцентная линейка над заголовком. */
    bar?: boolean;
  };
  /** Между ответами без заголовка: «* * *», глиф виньетки или короткая линейка. */
  divider: "stars" | "glyph" | "rule";
  /** Первые слова главы — капителью (как в романах). */
  leadIn: boolean;
  folio: { align: "center" | "outer"; dashes?: boolean; font?: "body" | "label" };
  /** Колонтитул: на левой полосе — название книги, на правой — глава. */
  runningHead: "none" | "plain" | "ruled";
  frame: FrameKind;
  /** Фотостраницы: рамка снимков, подпись и цвет скотча (для рамки «скотч»). */
  photos: { frame: PhotoFrame; caption: PhotoCaption; tape?: string };
  /** Обложки, с которыми дизайн составляет пару, — подсказка в выборе. */
  pairsWith: string[];
}

// ─── прежние стили вёрстки (не меняются) ────────────────────────────────────

const legacyPalette: InteriorPalette = { ink: "#1F1A17", muted: "#7A7068", accent: "#7A7068", rule: "#B4A99E", ornament: "#B4A99E" };

const legacy = (
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

const classic = legacy(
  "classic",
  "classic",
  { heading: "cormorant", headingWeight: 500, headingItalic: false, body: "ptserif", bodySize: 10.5, lineHeight: 1.5 },
  ["linen", "leather", "photo", "marble", "flax"],
);

const modern = legacy(
  "modern",
  "modern",
  { heading: "playfair", headingWeight: 400, headingItalic: true, body: "lora", bodySize: 10, lineHeight: 1.55 },
  ["noir", "ocean"],
);

const minimal = legacy(
  "minimal",
  "modern",
  { heading: "montserrat", headingWeight: 500, headingItalic: false, body: "montserrat", bodySize: 9.5, lineHeight: 1.6 },
  ["terrazzo", "photo"],
);

// ─── коллекция ──────────────────────────────────────────────────────────────

const romance: InteriorDesign = {
  id: "romance",
  mood: "romance",
  type: { heading: "cormorant", headingWeight: 500, headingItalic: true, body: "lora", bodySize: 10, lineHeight: 1.55 },
  display: { font: "cormorant", weight: 500, italic: true },
  label: { font: "cormorant", weight: 600, upper: true, tracking: 0.26, size: 8 },
  palette: { ink: "#2B1F22", muted: "#85666B", accent: "#9E3A4A", rule: "#DCC3C6", ornament: "#B5525F" },
  ornament: "heart",
  opener: { align: "center", number: "label", titleSize: 30, top: 0.32 },
  heading: { align: "center", size: 1.7, accent: true },
  divider: "glyph",
  leadIn: true,
  folio: { align: "center" },
  runningHead: "none",
  frame: "corners",
  photos: { frame: "hairline", caption: "italic" },
  pairsWith: ["blossom", "hearts", "script", "tulips", "peony", "roses", "velvet", "bouquet", "tenderness", "dusk", "heart", "medallion"],
};

const stars: InteriorDesign = {
  id: "stars",
  mood: "romance",
  type: { heading: "cormorant", headingWeight: 500, headingItalic: false, body: "ptserif", bodySize: 10.5, lineHeight: 1.5 },
  display: { font: "cormorant", weight: 500, italic: true },
  label: { font: "montserrat", weight: 500, upper: true, tracking: 0.36, size: 6.6 },
  palette: { ink: "#1C2033", muted: "#6B6E86", accent: "#2D3C6E", rule: "#CBC3AE", ornament: "#B8975A" },
  ornament: "sparkle",
  opener: {
    align: "center",
    number: "digits",
    numeral: { font: "cormorant", weight: 500, italic: true, size: 64 },
    titleSize: 28,
    top: 0.24,
    art: "stars",
    fill: { paper: "#18203F", ink: "#F2E6C4", muted: "#C9BC97", accent: "#E2C887", rule: "#5D6590", ornament: "#D8BD80" },
  },
  heading: { align: "left", size: 1.55, accent: true },
  divider: "glyph",
  leadIn: false,
  folio: { align: "center" },
  runningHead: "none",
  frame: "none",
  photos: { frame: "hairline", caption: "label" },
  pairsWith: ["midnight", "constellation", "milkyway", "lights", "alatau"],
};

const oyu: InteriorDesign = {
  id: "oyu",
  mood: "classic",
  type: { heading: "cormorant", headingWeight: 600, headingItalic: false, body: "ptserif", bodySize: 10.5, lineHeight: 1.5 },
  display: { font: "cormorant", weight: 500 },
  label: { font: "montserrat", weight: 500, upper: true, tracking: 0.32, size: 6.6 },
  palette: { ink: "#1B2422", muted: "#5E6D68", accent: "#0F5246", rule: "#D3C29C", ornament: "#B08D4A" },
  ornament: "ram",
  opener: {
    align: "center",
    number: "label",
    titleSize: 27,
    top: 0.42,
    art: "oyu",
    fill: { paper: "#0E3B33", ink: "#EED6A0", muted: "#C9B583", accent: "#DDBE7C", rule: "#5F8C7E", ornament: "#C9A45C" },
  },
  heading: { align: "left", size: 1.55, accent: true },
  divider: "glyph",
  leadIn: true,
  folio: { align: "center", dashes: true },
  runningHead: "none",
  frame: "double",
  photos: { frame: "double", caption: "label" },
  pairsWith: ["oyu"],
};

const herbarium: InteriorDesign = {
  id: "herbarium",
  mood: "tender",
  type: { heading: "lora", headingWeight: 400, headingItalic: true, body: "lora", bodySize: 10, lineHeight: 1.55 },
  display: { font: "lora", weight: 400, italic: true },
  label: { font: "lora", weight: 400, upper: true, tracking: 0.28, size: 7 },
  palette: { ink: "#26291F", muted: "#6E6C57", accent: "#4F5D3F", rule: "#CFCBB6", ornament: "#7D8B66" },
  ornament: "sprig",
  opener: { align: "center", number: "label", titleSize: 25, top: 0.4, art: "herbarium" },
  heading: { align: "left", size: 1.5, accent: true },
  divider: "glyph",
  leadIn: false,
  folio: { align: "center" },
  runningHead: "plain",
  frame: "none",
  photos: { frame: "tape", caption: "hand", tape: "#E3D7B4" },
  pairsWith: ["herbarium", "sage", "lemons", "eucalyptus", "dried", "meadow", "mint", "tenderness"],
};

const deco: InteriorDesign = {
  id: "deco",
  mood: "classic",
  type: { heading: "playfair", headingWeight: 400, headingItalic: false, body: "ptserif", bodySize: 10.5, lineHeight: 1.5 },
  display: { font: "playfair", weight: 400, upper: true, tracking: 0.1 },
  label: { font: "montserrat", weight: 500, upper: true, tracking: 0.4, size: 6.4 },
  palette: { ink: "#171614", muted: "#6E675A", accent: "#9A7838", rule: "#CDBA8E", ornament: "#A8884A" },
  ornament: "fan",
  opener: {
    align: "center",
    number: "roman",
    numeral: { font: "playfair", weight: 400, size: 30 },
    titleSize: 19,
    top: 0.4,
    art: "sunburst",
  },
  heading: { align: "center", size: 1.45 },
  divider: "rule",
  leadIn: true,
  folio: { align: "center", dashes: true },
  runningHead: "none",
  frame: "deco",
  photos: { frame: "double", caption: "label" },
  pairsWith: ["deco", "noir", "leather"],
};

const editorial: InteriorDesign = {
  id: "editorial",
  mood: "modern",
  type: { heading: "playfair", headingWeight: 400, headingItalic: false, body: "lora", bodySize: 10, lineHeight: 1.55 },
  display: { font: "playfair", weight: 400 },
  label: { font: "montserrat", weight: 600, upper: true, tracking: 0.22, size: 6.4 },
  palette: { ink: "#201B18", muted: "#7A6B62", accent: "#B4532F", rule: "#DCCFC5", ornament: "#B4532F" },
  ornament: "bar",
  opener: {
    align: "left",
    number: "padded",
    numeral: { font: "playfair", weight: 400, size: 76 },
    titleSize: 26,
    top: 0.2,
  },
  heading: { align: "left", size: 1.5, bar: true },
  divider: "rule",
  leadIn: true,
  folio: { align: "outer", font: "label" },
  runningHead: "ruled",
  frame: "none",
  photos: { frame: "none", caption: "label" },
  pairsWith: ["terracotta", "mountains", "ocean", "terrazzo", "steppe", "autumn", "magazine", "film"],
};

const airmail: InteriorDesign = {
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
  pairsWith: ["letter", "script", "hearts"],
};

const watercolor: InteriorDesign = {
  id: "watercolor",
  mood: "tender",
  type: { heading: "cormorant", headingWeight: 500, headingItalic: true, body: "ptserif", bodySize: 10.5, lineHeight: 1.5 },
  display: { font: "cormorant", weight: 500, italic: true },
  label: { font: "montserrat", weight: 500, upper: true, tracking: 0.32, size: 6.4 },
  palette: { ink: "#2E2430", muted: "#86717F", accent: "#7A4A68", rule: "#E4D3DB", ornament: "#C98B93" },
  ornament: "dot",
  opener: {
    align: "center",
    number: "digits",
    numeral: { font: "cormorant", weight: 500, italic: true, size: 70 },
    titleSize: 28,
    top: 0.26,
    art: "watercolor",
  },
  heading: { align: "left", size: 1.6, accent: true },
  divider: "glyph",
  leadIn: false,
  folio: { align: "center" },
  runningHead: "none",
  frame: "none",
  photos: { frame: "hairline", caption: "italic" },
  pairsWith: ["sunrise", "tulips", "blossom", "mountains", "clouds", "lavender", "sakura", "arch"],
};

/** Шаңырақ — венец юрты, символ дома и рода: над каждой главой, терракота и охра. */
const shanyrak: InteriorDesign = {
  id: "shanyrak",
  mood: "classic",
  type: { heading: "cormorant", headingWeight: 600, headingItalic: false, body: "ptserif", bodySize: 10.5, lineHeight: 1.5 },
  display: { font: "cormorant", weight: 500 },
  label: { font: "montserrat", weight: 500, upper: true, tracking: 0.32, size: 6.6 },
  palette: { ink: "#2A1F1A", muted: "#7A6656", accent: "#A4452C", rule: "#DCC7B5", ornament: "#B07A3A" },
  ornament: "shanyrak",
  opener: { align: "center", number: "label", titleSize: 27, top: 0.44, art: "shanyrak" },
  heading: { align: "left", size: 1.55, accent: true },
  divider: "glyph",
  leadIn: true,
  folio: { align: "center" },
  runningHead: "none",
  frame: "none",
  photos: { frame: "double", caption: "italic" },
  pairsWith: ["oyu", "terracotta", "leather"],
};

/** Горы: сиреневые хребты Алатау со снежными шапками у нижнего края начальной полосы. */
const mountains: InteriorDesign = {
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

/** Море: слои волн у края полосы, чайки и бирюзовые заголовки. */
const sea: InteriorDesign = {
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

/** Фолиант: старинная книга — сепия, флероны в углах, римские цифры, колонтитулы. */
const vintage: InteriorDesign = {
  id: "vintage",
  mood: "classic",
  type: { heading: "cormorant", headingWeight: 600, headingItalic: false, body: "ptserif", bodySize: 10.5, lineHeight: 1.5 },
  display: { font: "cormorant", weight: 600, upper: true, tracking: 0.08 },
  label: { font: "cormorant", weight: 600, upper: true, tracking: 0.24, size: 8 },
  palette: { ink: "#2E2118", muted: "#7A6450", accent: "#7A2E1F", rule: "#D3C3AE", ornament: "#8C6A3F" },
  ornament: "hedera",
  opener: {
    align: "center",
    number: "roman",
    numeral: { font: "cormorant", weight: 500, size: 36 },
    titleSize: 21,
    top: 0.34,
  },
  heading: { align: "center", size: 1.4 },
  divider: "glyph",
  leadIn: true,
  folio: { align: "center", dashes: true },
  runningHead: "plain",
  frame: "vintage",
  photos: { frame: "corners", caption: "italic" },
  pairsWith: ["leather", "linen", "noir", "postcards", "saddle", "medallion", "passepartout"],
};

/** Альбом: цветной скотч на начальных полосах и заголовки «синей ручкой». */
const album: InteriorDesign = {
  id: "album",
  mood: "tender",
  type: { heading: "caveat", headingWeight: 500, headingItalic: false, body: "lora", bodySize: 10, lineHeight: 1.55 },
  display: { font: "caveat", weight: 500 },
  label: { font: "montserrat", weight: 500, upper: true, tracking: 0.3, size: 6.4 },
  palette: { ink: "#2B2622", muted: "#7A6F66", accent: "#2F5D8C", rule: "#DDD3C6", ornament: "#2F5D8C" },
  ornament: "scribble",
  opener: { align: "center", number: "label", titleSize: 38, top: 0.32, art: "tape" },
  heading: { align: "left", size: 2, accent: true },
  divider: "glyph",
  leadIn: false,
  folio: { align: "center" },
  runningHead: "none",
  frame: "none",
  photos: { frame: "polaroid", caption: "hand" },
  pairsWith: ["photo", "herbarium", "letter", "lemons", "polaroid", "collage"],
};

/** Конфетти: праздник для книги другу — яркие конфетти, крупные цифры, розовый акцент. */
const confetti: InteriorDesign = {
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

/** Фотокнига: каждая глава открывается снимком во всю ширину, строгая типографика и подписи прописными. */
const photobook: InteriorDesign = {
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
  pairsWith: ["magazine", "mosaic", "collage", "film", "duotone", "photo"],
};

/** Воспоминания: глава открывается полароидом на скотче на тёплой бумаге, подписи к фото — от руки. */
const memories: InteriorDesign = {
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
  pairsWith: ["polaroid", "arch", "heart", "passepartout", "medallion"],
};

const byId: Record<InteriorId, InteriorDesign> = {
  classic,
  modern,
  minimal,
  romance,
  stars,
  oyu,
  herbarium,
  deco,
  editorial,
  airmail,
  watercolor,
  shanyrak,
  mountains,
  sea,
  vintage,
  album,
  confetti,
  photobook,
  memories,
};

/** Порядок в выборе: сначала спокойная классика, дальше чередуем настроения. */
export const interiorDesigns: InteriorDesign[] = (
  [
    "classic", "photobook", "romance", "stars", "memories", "herbarium", "oyu", "editorial", "watercolor", "shanyrak", "mountains",
    "deco", "album", "sea", "airmail", "vintage", "confetti", "modern", "minimal",
  ] as const
).map((id) => byId[id]);

export const DEFAULT_INTERIOR: InteriorId = "classic";

export function isInteriorId(id: string): id is InteriorId {
  return Object.hasOwn(byId, id);
}

export function getInteriorDesign(id: string): InteriorDesign {
  return isInteriorId(id) ? byId[id] : byId[DEFAULT_INTERIOR];
}

/** Дизайны в пару к обложке — для подсказки «к вашей обложке». */
export function interiorsForCover(coverId: string): InteriorDesign[] {
  return interiorDesigns.filter((d) => d.pairsWith.includes(coverId));
}

// ─── размеры ────────────────────────────────────────────────────────────────

/** Кегли и отбивки в pt для конкретного формата — общие для PDF и HTML-превью. */
export interface InteriorSizes {
  body: number;
  heading: number;
  label: number;
  /** Отбивка после подписи «Глава N». */
  kickerGap: number;
  openerTitle: number;
  numeral: number;
  kicker: number;
  epigraph: number;
  /** Отбивка виньетки сверху и снизу. */
  vignetteGap: number;
  title: number;
  subtitle: number;
  dedication: number;
  tocTitle: number;
  end: number;
  caption: number;
  folio: number;
  colophon: number;
  year: number;
  runningHead: number;
  /** Отбивки в тексте: после заголовка, перед заголовком и перед ответом без заголовка. */
  afterHeading: number;
  beforeHeading: number;
  beforeHeadless: number;
}

export function interiorSizes(design: InteriorDesign, scale: number): InteriorSizes {
  const body = design.type.bodySize * scale;
  const { opener } = design;
  return {
    body,
    heading: body * design.heading.size,
    label: design.label.size * scale,
    kickerGap: 14 * scale,
    openerTitle: opener.titleSize * scale,
    numeral: (opener.numeral?.size ?? 56) * scale,
    kicker: (opener.kicker?.size ?? design.label.size) * scale,
    epigraph: 10 * scale,
    vignetteGap: 14 * scale,
    title: 30 * scale,
    subtitle: 12 * scale,
    dedication: 13 * scale,
    tocTitle: 22 * scale,
    end: 14 * scale,
    caption: 9 * scale,
    folio: 8 * scale,
    colophon: 7.5 * scale,
    year: 7 * scale,
    runningHead: Math.min(design.label.size, 6.6) * scale,
    afterHeading: 8 * scale,
    beforeHeading: 20 * scale,
    beforeHeadless: 10 * scale,
  };
}

/** Длина линеек виньетки, pt: на титуле, в начале главы и в конце книги. */
export const VIGNETTE_RULE = { title: 34, opener: 26, end: 20 } as const;

/** Где по высоте полосы набора начинается блок на парадных полосах. */
export const DISPLAY_TOP = { title: 0.32, dedication: 0.34, end: 0.36 } as const;

// ─── номера, капитель ───────────────────────────────────────────────────────

export function romanNumeral(n: number): string {
  const table: [number, string][] = [
    [1000, "M"], [900, "CM"], [500, "D"], [400, "CD"], [100, "C"], [90, "XC"],
    [50, "L"], [40, "XL"], [10, "X"], [9, "IX"], [5, "V"], [4, "IV"], [1, "I"],
  ];
  let out = "";
  let rest = Math.max(1, Math.floor(n));
  for (const [v, s] of table)
    while (rest >= v) {
      out += s;
      rest -= v;
    }
  return out;
}

/** Номер главы для начальной полосы: подпись («Глава 1») или крупная цифра. */
export function chapterMark(design: InteriorDesign, n: number, label: (n: number) => string): { kind: "label" | "numeral"; text: string } {
  switch (design.opener.number) {
    case "digits":
      return { kind: "numeral", text: String(n) };
    case "padded":
      return { kind: "numeral", text: String(n).padStart(2, "0") };
    case "roman":
      return { kind: "numeral", text: romanNumeral(n) };
    default:
      return { kind: "label", text: label(n) };
  }
}

/**
 * Начальные слова главы для капители: до трёх слов, но не длиннее ~22 знаков и не дальше
 * первого знака препинания. Возвращает [капитель, остаток абзаца].
 */
export function splitLeadIn(paragraph: string): [string, string] {
  const words = paragraph.match(/\S+\s*/g) ?? [];
  const lead: string[] = [];
  for (const w of words) {
    if (lead.length && (lead.length >= 3 || (lead.join("") + w).trim().length > 22)) break;
    lead.push(w);
    if (/[,.;:!?…—)»]$/.test(w.trim())) break;
  }
  // Капитель не обрывается на предлоге или союзе: «МЫ ВСТРЕТИЛИСЬ в самый…», а не «МЫ ВСТРЕТИЛИСЬ В самый…».
  while (lead.length > 1 && lead[lead.length - 1].trim().replace(/[^\p{L}]/gu, "").length <= 2) lead.pop();
  const head = lead.join("").trimEnd();
  return [head, paragraph.slice(head.length)];
}

/** CSS-трекинг и регистр начертания (для HTML); в PDF те же значения в pt. */
export function trackingPt(face: Pick<TextFace, "tracking">, size: number) {
  return (face.tracking ?? 0) * size;
}
