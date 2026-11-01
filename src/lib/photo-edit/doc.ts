/**
 * Правка фото в редакторе фото: описание того, что автор сделал со снимком, — кадр и поворот, свет и цвет, фильтр и
 * слои поверх (надписи, фигуры, рисунок от руки). Описание хранится отдельно от файла (photo_edits) вместе с
 * оригиналом, а в книгу идёт готовая картинка, собранная по нему в браузере (render.ts): открыли снова — всё
 * правится дальше, «Вернуть оригинал» — одним действием.
 *
 * Единицы слоёв: x, y — доли ширины и высоты готовой картинки (центр слоя); размеры — доли её короткой стороны
 * (она не меняется при повороте на 90°, поэтому поворот файла не меняет вид надписей). Модуль без браузера и
 * сервера: его проверяют тесты и сервер (схема), а рисует — render.ts.
 */
import { z } from "zod";
import { fontKeys, type FontKey } from "@/lib/book/fonts";
import { SHAPE_IDS, type ShapeId } from "./shapes";

export const ADJUST_KEYS = ["brightness", "contrast", "highlights", "shadows", "saturation", "warmth", "tint", "fade", "vignette", "sharpen"] as const;
export type AdjustKey = (typeof ADJUST_KEYS)[number];
export type Adjust = Partial<Record<AdjustKey, number>>;

/** Пределы ползунков света и цвета: «двусторонние» от −100 до 100, остальные — от 0. */
export const ADJUST_RANGE: Record<AdjustKey, readonly [number, number]> = {
  brightness: [-100, 100],
  contrast: [-100, 100],
  highlights: [-100, 100],
  shadows: [-100, 100],
  saturation: [-100, 100],
  warmth: [-100, 100],
  tint: [-100, 100],
  fade: [0, 100],
  vignette: [0, 100],
  sharpen: [0, 100],
};

export const FILTER_IDS = ["none", "vivid", "warm", "cool", "soft", "film", "vintage", "drama", "bw", "noir", "sepia", "fade"] as const;
export type FilterId = (typeof FILTER_IDS)[number];

/** Чёрная и белая точки и гамма — их ставит «Авто» по гистограмме снимка. */
export interface Levels {
  black: number;
  white: number;
  gamma: number;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Геометрия снимка: сначала отражение, затем повороты на 90° по часовой (turns), затем «выпрямить» на угол (снимок
 * при этом приближается, чтобы не было пустых углов), затем кадр crop — доли картинки после поворотов.
 */
export interface Geometry {
  turns: 0 | 1 | 2 | 3;
  flip: boolean;
  straighten: number;
  crop: Rect | null;
  /** Пропорция рамки кадра, выбранная автором (только для редактора): «free», «original» или «4:3». */
  aspect: string;
}

interface LayerBase {
  id: string;
  x: number;
  y: number;
  /** Поворот, градусы по часовой. */
  rotation: number;
  scale: number;
  opacity: number;
}

export type TextShadow = "none" | "soft" | "hard" | "glow";

export interface TextLayer extends LayerBase {
  type: "text";
  text: string;
  font: FontKey;
  weight: number;
  italic: boolean;
  color: string;
  align: "left" | "center" | "right";
  lineHeight: number;
  /** Разрядка, доли кегля. */
  spacing: number;
  /** Плашка под текстом: цвет и непрозрачность; null — без плашки. */
  background: string | null;
  backgroundOpacity: number;
  /** Обводка букв: цвет и толщина (доля кегля); null — без обводки. */
  stroke: string | null;
  strokeWidth: number;
  shadow: TextShadow;
}

export interface ShapeLayer extends LayerBase {
  type: "shape";
  shape: ShapeId;
  fill: string | null;
  stroke: string | null;
  /** Толщина контура, доли короткой стороны картинки (при scale 1). */
  strokeWidth: number;
}

export interface DrawLayer extends LayerBase {
  type: "draw";
  /** Точки линии парами x, y — от центра слоя, в долях короткой стороны. */
  points: number[];
  color: string;
  /** Толщина, доли короткой стороны. */
  width: number;
  brush: "pen" | "marker";
}

export type Layer = TextLayer | ShapeLayer | DrawLayer;

export interface PhotoEdit {
  v: 1;
  geometry: Geometry;
  adjust: Adjust;
  levels: Levels | null;
  filter: { id: FilterId; strength: number };
  layers: Layer[];
}

/** Кегль надписи при scale 1 — доля короткой стороны картинки. */
export const TEXT_BASE = 0.07;
/** Длинная сторона фигуры при scale 1 — доля короткой стороны. */
export const SHAPE_BASE = 0.3;
export const SCALE_MIN = 0.1;
export const SCALE_MAX = 12;
export const MAX_LAYERS = 80;
export const MAX_TEXT = 500;
/** Точек в одной линии рисунка (пары x, y): редактор прореживает линию, сервер не примет длиннее. */
export const MAX_DRAW_POINTS = 1500;
/** Предел описания правки в байтах JSON — сервер не примет больше. */
export const MAX_EDIT_BYTES = 400_000;

export const emptyGeometry = (): Geometry => ({
  turns: 0,
  flip: false,
  straighten: 0,
  crop: null,
  aspect: "free",
});

export const emptyEdit = (): PhotoEdit => ({
  v: 1,
  geometry: emptyGeometry(),
  adjust: {},
  levels: null,
  filter: { id: "none", strength: 100 },
  layers: [],
});

/** Правка ничего не меняет — сохранять нечего, это оригинал. */
export function isEmptyEdit(e: PhotoEdit): boolean {
  const g = e.geometry;
  return !g.turns && !g.flip && !g.straighten && !g.crop && !e.levels && e.filter.id === "none" && !e.layers.length && ADJUST_KEYS.every((k) => !e.adjust[k]);
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const round = (v: number, k = 10_000) => Math.round(v * k) / k;

/** Угол в пределах (−180, 180]. */
export const normAngle = (deg: number) => {
  const a = ((((deg + 180) % 360) + 360) % 360) - 180;
  return a === -180 ? 180 : round(a, 100);
};

/** Кадр в пределах картинки (доли), не меньше 2% стороны. */
export function clampRect(r: Rect): Rect {
  const w = clamp(r.w, 0.02, 1);
  const h = clamp(r.h, 0.02, 1);
  return {
    x: round(clamp(r.x, 0, 1 - w)),
    y: round(clamp(r.y, 0, 1 - h)),
    w: round(w),
    h: round(h),
  };
}

/**
 * Поворот всей готовой картинки на 90° по часовой (кнопка «Повернуть» и поворот файла на сервере): снимок
 * поворачивается ещё на четверть, кадр и слои — вместе с ним, слои сохраняют размер (он в долях короткой стороны).
 */
export function rotateEditCW(e: PhotoEdit): PhotoEdit {
  const g = e.geometry;
  const crop = g.crop
    ? {
        x: round(1 - g.crop.y - g.crop.h),
        y: g.crop.x,
        w: g.crop.h,
        h: g.crop.w,
      }
    : null;
  return {
    ...e,
    geometry: {
      ...g,
      turns: ((g.turns + 1) % 4) as Geometry["turns"],
      crop,
      aspect: flipAspect(g.aspect),
    },
    layers: e.layers.map((l) => ({
      ...l,
      x: round(1 - l.y),
      y: l.x,
      rotation: normAngle(l.rotation + 90),
    })),
  };
}

export const rotateEditCCW = (e: PhotoEdit) => rotateEditCW(rotateEditCW(rotateEditCW(e)));

/** «Отразить» — зеркально по горизонтали то, что видно: снимок, кадр, угол выпрямления и места слоёв (сами надписи не зеркалятся). */
export function flipEdit(e: PhotoEdit): PhotoEdit {
  const g = e.geometry;
  // Отражение идёт до поворотов: при нечётном числе четвертей отразить видимое по горизонтали — это отразить
  // исходник и повернуть ещё на пол-оборота.
  const turns = (g.turns % 2 ? (g.turns + 2) % 4 : g.turns) as Geometry["turns"];
  return {
    ...e,
    geometry: {
      ...g,
      flip: !g.flip,
      turns,
      straighten: -g.straighten || 0,
      crop: g.crop ? { ...g.crop, x: round(1 - g.crop.x - g.crop.w) } : null,
    },
    layers: e.layers.map((l) => ({
      ...l,
      x: round(1 - l.x),
      rotation: normAngle(-l.rotation),
    })),
  };
}

const flipAspect = (a: string) => {
  const m = /^(\d+):(\d+)$/.exec(a);
  return m ? `${m[2]}:${m[1]}` : a;
};

/** Размеры снимка после поворотов (до кадра). */
export const turnedSize = (w: number, h: number, turns: number) => (turns % 2 ? { w: h, h: w } : { w, h });

/** Во сколько раз приблизить снимок, повёрнутый на угол, чтобы он закрыл рамку w×h без пустых углов. */
export function coverScale(w: number, h: number, deg: number) {
  const a = (Math.abs(deg) * Math.PI) / 180;
  const c = Math.cos(a);
  const s = Math.sin(a);
  return Math.max((w * c + h * s) / w, (w * s + h * c) / h);
}

/** Размер готовой картинки в пикселях для снимка w×h. */
export function outputSize(w: number, h: number, g: Geometry) {
  const t = turnedSize(w, h, g.turns);
  const c = g.crop ?? { x: 0, y: 0, w: 1, h: 1 };
  return {
    w: Math.max(1, Math.round(t.w * c.w)),
    h: Math.max(1, Math.round(t.h * c.h)),
  };
}

/** Пропорция «4:3» → 4/3; «free» — null; «original» — пропорция снимка после поворотов. */
export function aspectRatio(aspect: string, turned: { w: number; h: number }): number | null {
  if (aspect === "original") return turned.w / turned.h;
  const m = /^(\d+):(\d+)$/.exec(aspect);
  return m ? Number(m[1]) / Number(m[2]) : null;
}

/** Самый большой кадр нужной пропорции (в пикселях снимка ratio = w/h) по центру. */
export function centeredCrop(ratio: number, turned: { w: number; h: number }): Rect {
  const r = ratio / (turned.w / turned.h);
  return r >= 1 ? clampRect({ x: 0, y: (1 - 1 / r) / 2, w: 1, h: 1 / r }) : clampRect({ x: (1 - r) / 2, y: 0, w: r, h: 1 });
}

/** Новый id слоя (короткий, в пределах одной правки). */
export const layerId = () => Math.random().toString(36).slice(2, 10);

// --- Схема для сервера: правка приходит из браузера и проверяется целиком. ---

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/);
const num = (lo: number, hi: number) => z.number().finite().min(lo).max(hi);
const base = {
  id: z.string().min(1).max(24),
  x: num(-2, 3),
  y: num(-2, 3),
  rotation: num(-360, 360),
  scale: num(SCALE_MIN, SCALE_MAX),
  opacity: num(0, 1),
};

const layerSchema = z.discriminatedUnion("type", [
  z.object({
    ...base,
    type: z.literal("text"),
    text: z.string().max(MAX_TEXT),
    font: z.enum(fontKeys as [FontKey, ...FontKey[]]),
    weight: z.number().int().min(100).max(900),
    italic: z.boolean(),
    color: hex,
    align: z.enum(["left", "center", "right"]),
    lineHeight: num(0.7, 3),
    spacing: num(-0.2, 1),
    background: hex.nullable(),
    backgroundOpacity: num(0, 1),
    stroke: hex.nullable(),
    strokeWidth: num(0, 0.5),
    shadow: z.enum(["none", "soft", "hard", "glow"]),
  }),
  z.object({
    ...base,
    type: z.literal("shape"),
    shape: z.enum(SHAPE_IDS),
    fill: hex.nullable(),
    stroke: hex.nullable(),
    strokeWidth: num(0, 0.2),
  }),
  z.object({
    ...base,
    type: z.literal("draw"),
    points: z
      .array(num(-3, 3))
      .min(2)
      .max(MAX_DRAW_POINTS * 2),
    color: hex,
    width: num(0.001, 0.3),
    brush: z.enum(["pen", "marker"]),
  }),
]);

const rect = z.object({
  x: num(0, 1),
  y: num(0, 1),
  w: num(0.01, 1),
  h: num(0.01, 1),
});

export const photoEditSchema = z.object({
  v: z.literal(1),
  geometry: z.object({
    turns: z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)]),
    flip: z.boolean(),
    straighten: num(-45, 45),
    crop: rect.nullable(),
    aspect: z.string().max(16),
  }),
  adjust: z.partialRecord(z.enum(ADJUST_KEYS), num(-100, 100)),
  levels: z.object({ black: num(0, 0.5), white: num(0.5, 1), gamma: num(0.3, 3) }).nullable(),
  filter: z.object({ id: z.enum(FILTER_IDS), strength: num(0, 100) }),
  layers: z.array(layerSchema).max(MAX_LAYERS),
});

/** Правка из запроса: проверенная и с кадром в пределах картинки; не та — null. */
export function parsePhotoEdit(raw: unknown): PhotoEdit | null {
  const r = photoEditSchema.safeParse(raw);
  if (!r.success) return null;
  const e = r.data as PhotoEdit;
  return {
    ...e,
    geometry: {
      ...e.geometry,
      crop: e.geometry.crop ? clampRect(e.geometry.crop) : null,
    },
  };
}

/** Версия файла фото (по ключу хранилища): редактор присылает её обратно, чтобы не записать правку поверх другой. */
export const photoVersion = (storageKey: string) =>
  storageKey
    .split("/")
    .pop()!
    .replace(/\.jpg$/, "");
