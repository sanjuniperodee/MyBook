"use client";

/**
 * Строки текста в HTML-превью — как их ставит react-pdf (lib/book/linebreak.ts): ширины — из тех же шрифтов (canvas даёт
 * те же продвижения и кернинг, что fontkit у PDF), переносы — те же (lib/book/hyphenate.ts). Браузер строки не ломает:
 * каждая строка — свой блок (components/interior/lines.tsx).
 *
 * Шрифт ещё не загружен — разбивки нет (null): текст идёт браузерной вёрсткой, а когда шрифт догрузится, onReady просит
 * перерисовать. Результаты запоминаются по тексту и начертанию.
 */
import type { Locale } from "@/i18n/config";
import { fontFaces, type FontKey } from "@/lib/book/fonts";
import { breakLines, glyphAdvance, type TextLine } from "@/lib/book/linebreak";

/** Начертание куска текста, как у PDF: шрифт, насыщенность, курсив, кегль (pt), разрядка (pt), прописные. */
export interface TextSpec {
  font: FontKey;
  weight: number;
  italic?: boolean;
  size: number;
  tracking?: number;
  upper?: boolean;
}

export interface BreakRequest {
  text: string;
  /** Начертание всего текста; runs — куски другого начертания (капитель в начале главы). */
  spec: TextSpec;
  runs?: readonly { start: number; end: number; spec: TextSpec }[];
  /** Ширина строки, pt; indent — красная строка первой. */
  width: number;
  indent?: number;
  /** Переносы основного текста (у заголовков, цитат, стихов и подписей их нет — noHyphens у PDF). */
  hyphens: boolean;
  justify: boolean;
}

export type LineBreaker = ((req: BreakRequest) => TextLine[] | null) & {
  /** Ширина текста начертанием spec, pt (буквица: ширина колонки рядом с ней); шрифт не загружен — null. */
  width?: (spec: TextSpec, text: string) => number | null;
};

/** Начертание из подключённых — ближайшее по насыщенности, как face() у PDF (pdf/fonts.ts). */
function nearest(spec: TextSpec) {
  const def = fontFaces[spec.font];
  const style = spec.italic ? "italic" : "normal";
  const pool = def.faces.filter((f) => f.style === style);
  const list = pool.length ? pool : def.faces;
  const best = list.reduce((a, b) => (Math.abs(b.weight - spec.weight) < Math.abs(a.weight - spec.weight) ? b : a));
  return { weight: best.weight, style: best.style };
}

/** Шрифт для canvas: семейства — те же, что у страницы (переменные next/font), с запасным, как у PDF. */
function fontString(spec: TextSpec, size: number) {
  const def = fontFaces[spec.font];
  const root = getComputedStyle(document.documentElement);
  const family = (key: FontKey) => root.getPropertyValue(fontFaces[key].cssVar).trim();
  const families = [family(spec.font), ...(def.fallback ? [family(def.fallback)] : [])].filter(Boolean).join(", ");
  const f = nearest(spec);
  return `${f.style} ${f.weight} ${size}px ${families || "serif"}`;
}

/** Ширины считаем крупным кеглем и уменьшаем: canvas округляет меньше. */
const MEASURE_SIZE = 100;

export function createLineBreaker(language: Locale, syllables: (word: string, lang: Locale) => string[], onReady: () => void): LineBreaker {
  const ctx = document.createElement("canvas").getContext("2d");
  const results = new Map<string, TextLine[]>();
  const loading = new Set<string>();

  /** Ширина строки s начертанием spec, pt; шрифт не загружен — null (и грузим его). */
  const measurer = (spec: TextSpec) => {
    const font = fontString(spec, MEASURE_SIZE);
    if (!document.fonts.check(font)) {
      if (!loading.has(font)) {
        loading.add(font);
        void document.fonts.load(font).then(() => onReady());
      }
      return null;
    }
    const k = spec.size / MEASURE_SIZE;
    const tracking = spec.tracking ?? 0;
    return (s: string) => {
      ctx!.font = font;
      ctx!.fontKerning = "normal";
      return ctx!.measureText(s).width * k + tracking * [...s].length;
    };
  };

  const breaker: LineBreaker = (req) => {
    if (!ctx) return null;
    const key = JSON.stringify(req);
    const done = results.get(key);
    if (done) return done;
    const runs = req.runs?.length ? req.runs : [{ start: 0, end: req.text.length, spec: req.spec }];
    // Прописные (капитель, заголовки дизайнера): ширины — у текста прописными, длина у кириллицы и латиницы та же.
    const shown = runs.map((r) => (r.spec.upper ? req.text.slice(r.start, r.end).toUpperCase() : req.text.slice(r.start, r.end))).join("");
    if (shown.length !== req.text.length) return null;
    const advances: { start: number; end: number; advance: (a: number, b: number) => number }[] = [];
    for (const r of runs) {
      const m = measurer(r.spec);
      if (!m) return null;
      const part = shown.slice(r.start, r.end);
      advances.push({ start: r.start, end: r.end, advance: glyphAdvance(part, m) });
    }
    // Ширина по кускам: внутри куска — по его шрифту, на стыке кусков кернинга нет (как у textkit — разные шрифты).
    const advance = (a: number, b: number) => {
      let w = 0;
      for (const r of advances) {
        const s = Math.max(a, r.start);
        const e = Math.min(b, r.end);
        if (e > s) w += r.advance(s - r.start, e - r.start);
      }
      return w;
    };
    const lines = breakLines({
      text: shown,
      runs,
      syllables: req.hyphens ? (w) => syllables(w, language) : (w) => [w],
      advance,
      widths: [req.width - (req.indent ?? 0), req.width],
      justify: req.justify,
    });
    if (results.size > 20_000) results.clear();
    results.set(key, lines);
    return lines;
  };
  breaker.width = (spec, text) => {
    if (!ctx) return null;
    const m = measurer(spec);
    return m ? m(spec.upper ? text.toUpperCase() : text) : null;
  };
  return breaker;
}
