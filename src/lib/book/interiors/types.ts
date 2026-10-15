/** Типы оформлений блока: шрифты, палитра, начальные полосы, заголовки, колонтитулы, фото. */
import type { FontKey, Typography } from "../fonts";
import type { PhotoCaption, PhotoFrame } from "../photo-pages";

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
  | "memories"
  | "gallery"
  | "arches"
  | "cinema"
  | "luna";

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
     * на скотче; full — во всю полосу, название светлым по затемнению; arch — в арочном окне; circle — в круге;
     * framed — в белом паспарту с тенью. Глава без фото открывается обычной полосой.
     */
    photo?: "bleed" | "polaroid" | "full" | "arch" | "circle" | "framed";
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
  /** Фотостраницы: рамка снимков, подпись, цвет скотча (для рамки «скотч») и тон бумаги (по умолчанию белая). */
  photos: { frame: PhotoFrame; caption: PhotoCaption; tape?: string; paper?: string };
  /** Обложки, с которыми дизайн составляет пару, — подсказка в выборе. */
  pairsWith: string[];
}
