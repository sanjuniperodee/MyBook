/**
 * Разбивка абзаца на строки — та же, что у react-pdf (@react-pdf/textkit: getNodes, linebreak Кнута — Пласса,
 * запасной best fit, breakLines). PDF ломает строки этим алгоритмом с переносами и сжатием пробелов, браузер — жадно,
 * и на той же ширине у них разное число строк: превью уезжало от книги на строку-другую за страницу. HTML-превью
 * считает строки здесь по ширинам из шрифта (canvas) и ставит их как есть (components/interior/lines.tsx).
 *
 * Алгоритм перенесён из textkit 4.x без изменений (поведение — до мелочей, включая сравнение с одиночным пробелом
 * при флаге переноса). Исходный код linebreak — Bram Stein, BSD; textkit — MIT.
 */

/** Ширина пробела растягивается до +ширина·3/6 и сжимается до −ширина·3/9 (textkit: opts width/stretch/shrink). */
const GLUE = { width: 3, stretch: 6, shrink: 9 } as const;
/** Ширина дефиса в расчёте строк — постоянная, pt (textkit: hyphenWidth). */
const HYPHEN_WIDTH = 5;
const TOLERANCE = 4;
const TOLERANCE_STEPS = 5;
const TOLERANCE_LIMIT = 50;
const INF = 10000;
const DEMERITS = { line: 10, flagged: 100, fitness: 3000 } as const;

type Box = { type: "box"; width: number; start: number; end: number; hyphenated: boolean };
type Glue = { type: "glue"; width: number; start: number; end: number; stretch: number; shrink: number };
type Penalty = { type: "penalty"; width: number; penalty: number; flagged: number };
type LbNode = Box | Glue | Penalty;

/** Строка абзаца: знаки [start, end) текста (с пробелом в конце, как у textkit) и дефис в конце, если слово перенесено. */
export interface TextLine {
  start: number;
  end: number;
  hyphen: boolean;
}

export interface LineBreakInput {
  text: string;
  /**
   * Куски текста одного начертания ([start, end)) — как runs у textkit: слова делятся по пробелам внутри куска.
   * Нет — весь текст одним куском.
   */
  runs?: readonly { start: number; end: number }[];
  /** Слоги слова для переноса (кусок между пробелами); без переносов — [word]. */
  syllables: (word: string) => string[];
  /** Ширина текста [start, end), pt — по глифам всего абзаца (кернинг на стыках тоже). */
  advance: (start: number, end: number) => number;
  /** Ширина первой строки (с красной строкой — меньше) и остальных, pt. */
  widths: readonly number[];
  /** По ширине — штраф за перенос 100, иначе 600 (textkit: hyphenationPenalty). */
  justify: boolean;
}

/** Узлы Кнута — Пласса по слогам (textkit: wrapWords + getNodes). */
function nodesOf(input: LineBreakInput): LbNode[] {
  const { text } = input;
  const runs = input.runs?.length ? input.runs : [{ start: 0, end: text.length }];
  const syllables: string[] = [];
  for (const run of runs)
    for (const word of text.slice(run.start, run.end).split(/([ ]+)/g).filter(Boolean)) syllables.push(...input.syllables(word));
  const penalty = input.justify ? 100 : 600;
  const nodes: LbNode[] = [];
  let start = 0;
  syllables.forEach((s, i) => {
    const end = start + s.length;
    const width = input.advance(start, end);
    if (s.trim() === "") nodes.push({ type: "glue", width, start, end, stretch: (width * GLUE.width) / GLUE.stretch, shrink: (width * GLUE.width) / GLUE.shrink });
    else {
      const hyphenated = syllables[i + 1] !== " ";
      nodes.push({ type: "box", width, start, end, hyphenated });
      if (syllables[i + 1] && hyphenated) nodes.push({ type: "penalty", width: HYPHEN_WIDTH, penalty, flagged: 1 });
    }
    start = end;
  });
  nodes.push({ type: "glue", width: 0, start, end: start, stretch: INF, shrink: 0 });
  nodes.push({ type: "penalty", width: 0, penalty: -INF, flagged: 1 });
  return nodes;
}

interface Totals {
  width: number;
  stretch: number;
  shrink: number;
}
interface Active {
  position: number;
  demerits: number;
  line: number;
  fitnessClass: number;
  totals: Totals;
  previous: Active | null;
}

/** Кнут — Пласс (textkit: linebreak). Возвращает позиции разрывов (с 0 в начале) или пусто, если не вышло. */
function knuthPlass(nodes: LbNode[], lineLengths: readonly number[], tolerance: number): number[] {
  let active: Active[] = [{ position: 0, demerits: 0, line: 0, fitnessClass: 0, totals: { width: 0, stretch: 0, shrink: 0 }, previous: null }];
  const sum: Totals = { width: 0, stretch: 0, shrink: 0 };
  const lengthOf = (line: number) => (line < lineLengths.length ? lineLengths[line - 1] : lineLengths[lineLengths.length - 1]);

  const cost = (end: number, a: Active, line: number) => {
    let width = sum.width - a.totals.width;
    const length = lengthOf(line);
    const node = nodes[end];
    if (node.type === "penalty") width += node.width;
    if (width < length) {
      const stretch = sum.stretch - a.totals.stretch;
      return stretch > 0 ? (length - width) / stretch : INF;
    }
    if (width > length) {
      const shrink = sum.shrink - a.totals.shrink;
      return shrink > 0 ? (length - width) / shrink : INF;
    }
    return 0;
  };

  const sumFrom = (index: number): Totals => {
    const out = { ...sum };
    for (let i = index; i < nodes.length; i++) {
      const n = nodes[i];
      if (n.type === "glue") {
        out.width += n.width;
        out.stretch += n.stretch;
        out.shrink += n.shrink;
      } else if (n.type === "box" || (n.type === "penalty" && n.penalty === -INF && i > index)) break;
    }
    return out;
  };

  const mainLoop = (node: LbNode, index: number) => {
    let i = 0;
    while (i < active.length) {
      let currentLine = 0;
      const candidates: { active?: Active; demerits: number }[] = [0, 1, 2, 3].map(() => ({ demerits: Infinity }));
      while (i < active.length) {
        const a = active[i];
        currentLine = a.line + 1;
        const ratio = cost(index, a, currentLine);
        let removed = false;
        if (ratio < -1 || (node.type === "penalty" && node.penalty === -INF)) {
          active.splice(i, 1);
          removed = true;
        }
        if (ratio >= -1 && ratio <= tolerance) {
          const badness = 100 * Math.abs(ratio) ** 3;
          let demerits = (DEMERITS.line + badness) ** 2;
          if (node.type === "penalty" && node.penalty >= 0) demerits += node.penalty ** 2;
          else if (node.type === "penalty" && node.penalty !== -INF) demerits -= node.penalty ** 2;
          const prev = nodes[a.position];
          if (node.type === "penalty" && prev.type === "penalty") demerits += DEMERITS.flagged * node.flagged * prev.flagged;
          const fitnessClass = ratio < -0.5 ? 0 : ratio <= 0.5 ? 1 : ratio <= 1 ? 2 : 3;
          if (Math.abs(fitnessClass - a.fitnessClass) > 1) demerits += DEMERITS.fitness;
          demerits += a.demerits;
          if (demerits < candidates[fitnessClass].demerits) candidates[fitnessClass] = { active: a, demerits };
        }
        if (!removed) i++;
        // Узлы следующей строки — после вставки кандидатов этой (как в textkit: список держится по номеру строки).
        if (i < active.length && active[i].line >= currentLine && currentLine < lineLengths.length) break;
      }
      const totals = sumFrom(index);
      candidates.forEach((c, fitnessClass) => {
        if (c.demerits === Infinity || !c.active) return;
        const next: Active = { position: index, demerits: c.demerits, line: c.active.line + 1, fitnessClass, totals, previous: c.active };
        active.splice(i, 0, next);
        i++;
      });
    }
  };

  nodes.forEach((node, index) => {
    if (node.type === "box") sum.width += node.width;
    else if (node.type === "glue") {
      if (index > 0 && nodes[index - 1].type === "box") mainLoop(node, index);
      sum.width += node.width;
      sum.stretch += node.stretch;
      sum.shrink += node.shrink;
    } else if (node.penalty !== INF) mainLoop(node, index);
  });
  if (!active.length) return [];
  let best = active[0];
  for (const a of active) if (a.demerits < best.demerits) best = a;
  const out: number[] = [];
  for (let a: Active | null = best; a; a = a.previous) out.push(a.position);
  active = [];
  return out.reverse();
}

/** Запасной вариант, когда Кнут — Пласс не нашёл разбивки (textkit: applyBestFit). */
function bestFit(nodes: LbNode[], widths: readonly number[]): number[] {
  const next = (sub: LbNode[], line: number): number | null => {
    let position: number | null = null;
    let minimum = Infinity;
    const sum = { width: 0, stretch: 0, shrink: 0 };
    const length = widths[Math.min(line, widths.length - 1)];
    const ratioOf = (node: LbNode) => {
      const stretch = "stretch" in node ? node.stretch : null;
      if (sum.width < length) return !stretch ? INF : sum.stretch - stretch > 0 ? (length - sum.width) / sum.stretch : INF;
      const shrink = "shrink" in node ? node.shrink : null;
      if (sum.width > length) return !shrink ? INF : sum.shrink - shrink > 0 ? (length - sum.width) / sum.shrink : INF;
      return 0;
    };
    let hyphen = 0;
    for (let i = 0; i < sub.length; i++) {
      const node = sub[i];
      if (node.type === "box") sum.width += node.width;
      if (node.type === "glue") {
        sum.width += node.width;
        sum.stretch += node.stretch;
        sum.shrink += node.shrink;
      }
      let j = i + 1;
      while (j < sub.length && (sub[j].type === "glue" || sub[j].type === "penalty")) j++;
      const end = sub[j - 1];
      hyphen = end.type === "penalty" ? end.width : 0;
      if (sum.width - sum.shrink + hyphen > length) {
        if (position === null) {
          let k = i === 0 ? i + 1 : i;
          while (k < sub.length && (sub[k].type === "glue" || sub[k].type === "penalty")) k++;
          position = k - 1;
        }
        break;
      }
      if (node.type === "penalty" || node.type === "glue") {
        const badness = 100 * Math.abs(ratioOf(node)) ** 3 + (node.type === "penalty" ? node.penalty : 0);
        if (minimum >= badness) {
          position = i;
          minimum = badness;
        }
      }
    }
    return sum.width - sum.shrink + hyphen > length ? position : null;
  };
  let count = 0;
  let line = 0;
  let sub = nodes;
  const breaks = [0];
  while (sub.length) {
    const bp = next(sub, line);
    if (bp === null) break;
    count += bp;
    breaks.push(count);
    sub = sub.slice(bp + 1);
    count++;
    line++;
  }
  return breaks;
}

/** Строки абзаца так, как их поставит react-pdf. */
export function breakLines(input: LineBreakInput): TextLine[] {
  const nodes = nodesOf(input);
  let tolerance = TOLERANCE;
  let breaks = knuthPlass(nodes, input.widths, tolerance);
  while (breaks.length === 0 && tolerance < TOLERANCE_LIMIT) {
    tolerance += TOLERANCE_STEPS;
    breaks = knuthPlass(nodes, input.widths, tolerance);
  }
  if (breaks.length === 0 || (breaks.length === 1 && breaks[0] === 0)) breaks = bestFit(nodes, input.widths);
  const lines: TextLine[] = [];
  let start = 0;
  for (const bp of breaks.slice(1)) {
    if (bp === nodes.length - 1) continue;
    const node = nodes[bp];
    if (node.type === "penalty") {
      const prev = nodes[bp - 1] as Box | Glue;
      lines.push({ start, end: prev.end, hyphen: true });
      start = prev.end;
    } else {
      lines.push({ start, end: node.end, hyphen: false });
      start = node.end;
    }
  }
  lines.push({ start, end: input.text.length, hyphen: false });
  return lines;
}

/**
 * Ширина куска текста, как её считает textkit — по глифам абзаца: кернинг пары на стыке кусков достаётся левому куску
 * (он в продвижении его последнего глифа). measure — ширина строки целиком (canvas, fontkit) с кернингом внутри; ширина
 * до знака n по глифам C(n) = measure(text[0..n]) − measure(text[n]) (без кернинга со следующим — он уже учтён).
 */
export function glyphAdvance(text: string, measure: (s: string) => number) {
  const cache = new Map<number, number>();
  const cumulative = (n: number) => {
    if (n <= 0) return 0;
    if (n >= text.length) return measure(text);
    let v = cache.get(n);
    if (v === undefined) cache.set(n, (v = measure(text.slice(0, n + 1)) - measure(text[n])));
    return v;
  };
  return (start: number, end: number) => cumulative(end) - cumulative(start);
}
