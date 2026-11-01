/**
 * Свет и цвет снимка в редакторе фото — над пикселями RGBA (ImageData.data), без браузера: одно и то же для превью
 * (уменьшенная копия) и для готового файла (полный размер), проверяется тестами.
 *
 * Порядок: уровни «Авто» → тепло и оттенок → яркость → тени и света → контраст → выцветание (всё это — таблицы на
 * канал, 256 значений) → насыщенность → ч/б, сепия и тонирование фильтра → резкость. Виньетка рисуется поверх
 * холста (render.ts), потому что зависит от кадра.
 */
import { ADJUST_KEYS, ADJUST_RANGE, type Adjust, type FilterId, type Levels } from "./doc";

interface FilterDef {
  adjust?: Adjust;
  mono?: number;
  sepia?: number;
  /** Тонирование: прибавка к теням и к светам (−1…1 на канал). */
  split?: {
    shadows: [number, number, number];
    highlights: [number, number, number];
  };
}

export const FILTERS: Record<FilterId, FilterDef> = {
  none: {},
  vivid: {
    adjust: { contrast: 18, saturation: 32, brightness: 4, sharpen: 15 },
  },
  warm: { adjust: { warmth: 38, saturation: 8, brightness: 3 } },
  cool: { adjust: { warmth: -34, tint: -6, contrast: 6 } },
  soft: {
    adjust: {
      contrast: -18,
      highlights: -22,
      shadows: 18,
      brightness: 6,
      saturation: -6,
    },
  },
  film: {
    adjust: { fade: 18, contrast: 12, saturation: -12, warmth: 8 },
    split: { shadows: [-0.02, 0.03, 0.06], highlights: [0.05, 0.03, -0.03] },
  },
  vintage: {
    adjust: {
      fade: 30,
      warmth: 22,
      saturation: -24,
      contrast: -6,
      vignette: 30,
    },
    split: { shadows: [0.02, 0.02, 0.07], highlights: [0.07, 0.04, -0.04] },
  },
  drama: {
    adjust: {
      contrast: 34,
      highlights: -30,
      shadows: -8,
      saturation: -18,
      vignette: 35,
      sharpen: 25,
    },
  },
  bw: { mono: 1, adjust: { contrast: 8 } },
  noir: {
    mono: 1,
    adjust: { contrast: 42, shadows: -14, vignette: 30, sharpen: 20 },
  },
  sepia: { sepia: 1, adjust: { contrast: 6, fade: 8 } },
  fade: { adjust: { fade: 38, contrast: -12, saturation: -20, brightness: 6 } },
};

/** Свет и цвет с учётом фильтра: ползунки автора плюс поправки фильтра, умноженные на его силу. */
export function effectiveAdjust(adjust: Adjust, filter: { id: FilterId; strength: number }): Required<Adjust> {
  const k = filter.strength / 100;
  const extra = FILTERS[filter.id]?.adjust ?? {};
  const out = {} as Required<Adjust>;
  for (const key of ADJUST_KEYS) {
    const [lo, hi] = ADJUST_RANGE[key];
    out[key] = Math.min(hi, Math.max(lo, (adjust[key] ?? 0) + (extra[key] ?? 0) * k));
  }
  return out;
}

const c01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

/** Таблицы R, G, B: уровни, тепло/оттенок, яркость, тени/света, контраст, выцветание. */
export function channelLuts(a: Required<Adjust>, levels: Levels | null): [Uint8ClampedArray, Uint8ClampedArray, Uint8ClampedArray] {
  const warm = a.warmth / 100;
  const tint = a.tint / 100;
  const gains = [1 + 0.14 * warm + 0.04 * tint, 1 + 0.03 * warm - 0.09 * tint, 1 - 0.16 * warm + 0.04 * tint];
  const b = (a.brightness / 100) * 0.85;
  const sh = a.shadows / 100;
  const hi = a.highlights / 100;
  const c = a.contrast / 100;
  const k = c >= 0 ? 1 + c * 1.1 : 1 + c * 0.75;
  const fade = a.fade / 100;
  return gains.map((gain) => {
    const lut = new Uint8ClampedArray(256);
    for (let i = 0; i < 256; i++) {
      let v = i / 255;
      if (levels) v = Math.pow(c01((v - levels.black) / Math.max(0.01, levels.white - levels.black)), 1 / levels.gamma);
      v = c01(v * gain);
      v = b >= 0 ? 1 - Math.pow(1 - v, 1 + b) : Math.pow(v, 1 - b);
      // Тени и света — горбы с вершинами на трети и двух третях: чёрное и белое остаются на месте.
      v = c01(v + sh * 0.32 * v * (1 - v) * (1 - v) * 6.75 + hi * 0.32 * v * v * (1 - v) * 6.75);
      v = c01(0.5 + (v - 0.5) * k);
      v = v * (1 - 0.26 * fade) + 0.13 * fade;
      lut[i] = Math.round(v * 255);
    }
    return lut;
  }) as [Uint8ClampedArray, Uint8ClampedArray, Uint8ClampedArray];
}

/** Меняет ли свет и цвет пиксели вообще (без виньетки — она поверх). */
export function touchesPixels(a: Required<Adjust>, levels: Levels | null, filter: { id: FilterId; strength: number }) {
  const def = FILTERS[filter.id];
  const k = filter.strength / 100;
  return (
    !!levels ||
    ((def.mono || def.sepia || def.split) && k > 0) ||
    (["brightness", "contrast", "highlights", "shadows", "saturation", "warmth", "tint", "fade", "sharpen"] as const).some((key) => a[key] !== 0)
  );
}

/** Свет и цвет над пикселями RGBA на месте. */
export function applyColor(data: Uint8ClampedArray, width: number, height: number, adjust: Adjust, levels: Levels | null, filter: { id: FilterId; strength: number }) {
  const a = effectiveAdjust(adjust, filter);
  if (!touchesPixels(a, levels, filter)) return;
  const [lr, lg, lb] = channelLuts(a, levels);
  const def = FILTERS[filter.id];
  const k = filter.strength / 100;
  const sat = 1 + a.saturation / 100;
  const mono = (def.mono ?? 0) * k;
  const sepia = (def.sepia ?? 0) * k;
  const split = def.split
    ? {
        s: def.split.shadows.map((v) => v * 255 * k),
        h: def.split.highlights.map((v) => v * 255 * k),
      }
    : null;
  for (let i = 0; i < data.length; i += 4) {
    let r = lr[data[i]];
    let g = lg[data[i + 1]];
    let b = lb[data[i + 2]];
    let L = 0.299 * r + 0.587 * g + 0.114 * b;
    if (sat !== 1) {
      r = L + (r - L) * sat;
      g = L + (g - L) * sat;
      b = L + (b - L) * sat;
    }
    if (mono) {
      r += (L - r) * mono;
      g += (L - g) * mono;
      b += (L - b) * mono;
    }
    if (sepia) {
      const sr = 0.393 * r + 0.769 * g + 0.189 * b;
      const sg = 0.349 * r + 0.686 * g + 0.168 * b;
      const sb = 0.272 * r + 0.534 * g + 0.131 * b;
      r += (sr - r) * sepia;
      g += (sg - g) * sepia;
      b += (sb - b) * sepia;
    }
    if (split) {
      L = c01(L / 255);
      const ws = (1 - L) * (1 - L);
      const wh = L * L;
      r += split.s[0] * ws + split.h[0] * wh;
      g += split.s[1] * ws + split.h[1] * wh;
      b += split.s[2] * ws + split.h[2] * wh;
    }
    data[i] = r;
    data[i + 1] = g;
    data[i + 2] = b;
  }
  if (a.sharpen > 0) sharpen(data, width, height, a.sharpen / 100);
}

/** Резкость: нерезкая маска 3×3 (крест) — края ярче, ровные места не меняются. */
export function sharpen(data: Uint8ClampedArray, width: number, height: number, amount: number) {
  if (width < 3 || height < 3 || amount <= 0) return;
  const k = amount * 0.9;
  const src = new Uint8ClampedArray(data);
  const row = width * 4;
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const i = y * row + x * 4;
      for (let c = 0; c < 3; c++) {
        const v = src[i + c];
        const lap = 4 * v - src[i + c - 4] - src[i + c + 4] - src[i + c - row] - src[i + c + row];
        data[i + c] = v + lap * k;
      }
    }
  }
}

/**
 * «Авто»: чёрная и белая точки по гистограмме яркости (0,5% и 99,5%) и гамма, чтобы средний тон встал около
 * середины. Для блёклых и тёмных старых снимков это главное улучшение; у нормального снимка правка почти незаметна.
 */
export function autoLevels(data: Uint8ClampedArray): Levels {
  const hist = new Uint32Array(256);
  let n = 0;
  let sum = 0;
  for (let i = 0; i < data.length; i += 16) {
    const L = Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
    hist[L]++;
    sum += L;
    n++;
  }
  if (!n) return { black: 0, white: 1, gamma: 1 };
  const at = (share: number) => {
    let acc = 0;
    for (let i = 0; i < 256; i++) {
      acc += hist[i];
      if (acc >= n * share) return i / 255;
    }
    return 1;
  };
  const black = Math.min(0.25, at(0.005));
  const white = Math.max(0.75, at(0.995));
  const mean = c01((sum / n / 255 - black) / (white - black));
  const gamma = mean > 0.02 && mean < 0.98 ? Math.min(1.6, Math.max(0.7, Math.log(mean) / Math.log(0.47))) : 1;
  const r = (v: number) => Math.round(v * 1000) / 1000;
  return { black: r(black), white: r(white), gamma: r(gamma) };
}
