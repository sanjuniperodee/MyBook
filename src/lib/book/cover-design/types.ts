/**
 * Обложка из слоёв — конструктор обложек. Фон — рисунок шаблона (с фото клиента в его местах), свой цвет или
 * градиент; поверх — слои по порядку: текст, фото, фигуры и декор. Это данные: их одинаково рисуют редактор (HTML),
 * превью, 3D-книга и PDF для типографии.
 *
 * Координаты — доли лицевой крышки (картона, как в PDF), поэтому то, что клиент поставил в редакторе, печатается там же.
 * Слой может заходить за край — в загиб под обрез (до SAFE.bleed доли). Размер текста и толщины — доли ширины крышки.
 */
import type { FontKey } from "../fonts";
import type { PhotoFrame } from "../photo-frame";

export type LayerKind = "text" | "image" | "shape" | "decor";

export interface LayerBase {
  id: string;
  kind: LayerKind;
  /** Своё имя слоя в списке слоёв. */
  name?: string;
  /** Рамка слоя, доли лицевой крышки: левый верхний угол, ширина и высота. */
  x: number;
  y: number;
  w: number;
  h: number;
  /** Поворот вокруг центра рамки, градусы. */
  rotate?: number;
  /** Непрозрачность 0–1. */
  opacity?: number;
  /** Закреплён: не двигается и не выделяется на холсте. */
  locked?: boolean;
  /** Скрыт: не печатается. */
  hidden?: boolean;
}

/** Текст слоя берётся из книги: название, подзаголовок или имена на обложке (правка слоя правит книгу). */
export type TextBind = "title" | "subtitle" | "names";

export interface TextShadow {
  color: string;
  /** Сдвиг, em кегля. Размытия нет: в PDF тень — копия текста, и она должна выглядеть так же, как в редакторе. */
  x: number;
  y: number;
  opacity?: number;
}

export interface TextStyle {
  font: FontKey;
  weight: number;
  italic?: boolean;
  underline?: boolean;
  upper?: boolean;
  /** Кегль — доля ширины крышки. */
  size: number;
  color: string;
  /** Разрядка, em. */
  tracking?: number;
  /** Интерлиньяж, множитель. */
  lineHeight?: number;
  align: "left" | "center" | "right";
  valign: "top" | "middle" | "bottom";
  shadow?: TextShadow;
  /** Контур: цвет и толщина, em кегля. */
  outline?: { color: string; width: number };
  /** Подложка — заливка рамки слоя: цвет, непрозрачность, скругление (доля ширины крышки) и поля для текста (em). */
  plate?: { color: string; opacity: number; radius?: number; pad?: number };
}

export interface TextLayer extends LayerBase {
  kind: "text";
  bind?: TextBind;
  /** Свой текст (у привязанного слоя не используется). Перевод строки — \n. */
  text: string;
  style: TextStyle;
}

export type ImageMask = "rect" | "rounded" | "circle" | "arch";

export interface ImageLayer extends LayerBase {
  kind: "image";
  /** Фото книги (uuid). */
  photoId?: string | null;
  /** Снимок коллекции (assets/cover-photos) — пока клиент не поставил своё фото или вместо него. */
  stock?: string | null;
  /** Кадр: масштаб и положение снимка в рамке (как у мест шаблонов). */
  frame?: PhotoFrame;
  mask?: ImageMask;
  /** Скругление для mask = rounded — доля меньшей стороны рамки. */
  radius?: number;
  /** Рамка-окантовка: цвет и толщина (доля ширины крышки). */
  border?: { color: string; width: number } | null;
  /** Чёрно-белое. */
  mono?: boolean;
  /** Цветной слой поверх снимка (тонирование, затемнение). */
  overlay?: { color: string; opacity: number } | null;
}

export type ShapeKind = "rect" | "ellipse" | "line" | "frame" | "double" | "corners" | "arch";

export interface ShapeLayer extends LayerBase {
  kind: "shape";
  shape: ShapeKind;
  fill?: string | null;
  /** Градиент заливки: от fill к to под углом angle (градусы, 90 — сверху вниз). */
  gradient?: { to: string; angle: number } | null;
  stroke?: string | null;
  /** Толщина линии — доля ширины крышки. */
  strokeWidth?: number;
  /** Скругление прямоугольника — доля меньшей стороны. */
  radius?: number;
}

export interface DecorLayer extends LayerBase {
  kind: "decor";
  motif: DecorId;
  color: string;
}

export type CoverLayer = TextLayer | ImageLayer | ShapeLayer | DecorLayer;

export type CoverBackground = { kind: "template" } | { kind: "color"; color: string } | { kind: "gradient"; from: string; to: string; angle: number };

export interface CoverDesign {
  v: 1;
  background: CoverBackground;
  layers: CoverLayer[];
}

/** Декор из библиотеки (decor.ts). */
export type DecorId =
  | "heart"
  | "hearts"
  | "sparkle"
  | "star"
  | "stars"
  | "diamond"
  | "ram"
  | "fleuron"
  | "sprig"
  | "laurel"
  | "vignette"
  | "flourish"
  | "dots"
  | "wave"
  | "sunburst"
  | "crescent"
  | "shanyrak"
  | "rings"
  | "confetti"
  | "hedera"
  | "peaks"
  | "botanical";

/** Слой с текстом из книги: что подставить в привязанные слои. */
export interface CoverTexts {
  title: string;
  subtitle: string;
  names: string;
}
