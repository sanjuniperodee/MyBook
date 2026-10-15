/**
 * Решения доводки вёрстки текста глав — чистые функции над простыми данными, без react-pdf.
 *
 * react-pdf не умеет «плавающих» фото и надёжно не держит заголовок вместе с текстом. Поэтому блок
 * собирается в несколько проходов: после каждого адаптер (`production/infrastructure/pdf/flow.ts`) читает
 * раскладку — где на полосах встали помеченные блоки — и отдаёт её сюда, а здесь принимаются решения
 * для следующего прохода:
 *  - заголовок (или лид) остался внизу полосы, а текст ушёл дальше → ответ начинается с новой полосы;
 *  - фото не поместилось и перескочило на следующую полосу, оставив пустоту → фото уменьшается
 *    ровно до свободного места (если это не делает его слишком мелким);
 *  - фото оказалось на полосе одно → встаёт по центру по вертикали, как фотостраница;
 *  - концовка главы перескочила одна на новую полосу → её не ставим.
 *
 * Решения копятся (не отменяются) и в пределах куска главы между принудительными разрывами
 * принимаются по одному за проход: каждое сдвигает всё, что ниже, и дальше смотрим уже на новую раскладку.
 */

/** Вид помеченного блока: h — заголовок или разделитель ответа, k — лид, b — другой блок набора (абзац, цитата, список, стих), r — ряд фото, t — концовка главы. */
export const FLOW_KINDS = ["h", "k", "b", "r", "t"] as const;
export type FlowKind = (typeof FLOW_KINDS)[number];

/** Кусок блока на одной полосе: координаты, pt от верха полосы. */
export interface FlowPiece {
  page: number;
  top: number;
  bottom: number;
  marginTop: number;
  marginBottom: number;
}

/** Полоса: где на ней начинается и кончается набор (за вычетом полей), pt от верха. */
export interface FlowPage {
  contentTop: number;
  contentBottom: number;
}

/** Помеченный блок целиком: первый и последний куски (блок мог разбиться на несколько полос). */
export interface FlowBlock {
  /** Пометка блока в раскладке; у ряда фото она же ключ в решениях. */
  mark: string;
  kind: FlowKind;
  /** Ответ; у концовки — глава. */
  item: string;
  chapter: string;
  first: FlowPiece;
  last: FlowPiece;
}

/** Раскладка: полосы по номерам и блоки в порядке появления. */
export interface FlowLayout {
  pages: FlowPage[];
  blocks: FlowBlock[];
}

export interface FlowDecisions {
  /** Ответы, которые начинаются с новой полосы. */
  breakBefore: Set<string>;
  /** Ряды фото, уменьшенные под свободное место: ключ ряда → масштаб (0…1). */
  rowScale: Map<string, number>;
  /** Ряды фото, одни на полосе: ключ ряда → отступ сверху, pt (по центру полосы набора). */
  rowOffset: Map<string, number>;
  /** Главы без концовки. */
  noTail: Set<string>;
}

export const emptyFlow = (): FlowDecisions => ({ breakBefore: new Set(), rowScale: new Map(), rowOffset: new Map(), noTail: new Set() });

/** Одно решение: что поменять в `FlowDecisions` (применяет `applyDecision`). */
type FlowDecision =
  | { type: "breakBefore"; item: string }
  | { type: "rowScale"; mark: string; scale: number }
  | { type: "rowOffset"; mark: string; offset: number }
  | { type: "noTail"; chapter: string };

/** Фото не уменьшаем сильнее — и не мельче этой доли высоты полосы набора. */
const MIN_ROW_SCALE = 0.45;
const MIN_ROW_SHARE = 0.3;
/** Пустота меньше этой доли полосы — не повод что-то менять. */
const MIN_GAP_SHARE = 0.12;
/** Фото, которое и так почти по центру (отступ меньше этой доли полосы), не двигаем. */
const MIN_OFFSET_SHARE = 0.04;
/** Допуск на дробные координаты react-pdf, pt. */
const EPS = 1.5;

/** Всё, что нужно правилам про один блок: он сам, соседи по главе и общие для прохода данные. */
interface Spot {
  block: FlowBlock;
  /** Последний кусок предыдущего блока той же главы. */
  prev?: FlowPiece;
  /** Следующий блок той же главы. */
  next?: FlowBlock;
  /** Полоса, на которой блок начался. */
  page: FlowPage;
  pages: FlowPage[];
  flow: FlowDecisions;
  rowHeights: ReadonlyMap<string, number>;
  minLead: number;
}
type Rule = (spot: Spot) => FlowDecision | undefined;

const textHeight = (page: FlowPage) => page.contentBottom - page.contentTop;
/** Кусок стоит в самом верху полосы набора (вместе со своим верхним полем). */
const atPageTop = (piece: FlowPiece, page: FlowPage) => piece.top - piece.marginTop <= page.contentTop + EPS;

/** Под заголовком на этой полосе остался обрывок текста короче minLead (около трёх строк), а остальное ушло дальше. */
const thinLead = (block: FlowBlock, next: FlowBlock, minLead: number) =>
  next.kind === "b" && next.first.page === block.last.page && next.last.page > block.last.page && next.first.bottom - next.first.top < minLead;

/** Заголовок или лид — последний на полосе, а продолжение ответа уже на следующей (или под ним всего пара строк). */
const hangingHeading: Rule = ({ block, next, page, flow, minLead }) => {
  if (!next || next.item !== block.item) return undefined;
  if (!(next.first.page > block.last.page || thinLead(block, next, minLead))) return undefined;
  // Ответ и так начинается с полосы — разрывом ничего не исправить.
  if (flow.breakBefore.has(block.item) || block.first.top <= page.contentTop + EPS) return undefined;
  return { type: "breakBefore", item: block.item };
};

/** Фото перескочило на новую полосу и оставило пустоту на предыдущей → уменьшаем под неё. */
const shrinkRow: Rule = ({ block, prev, page, pages, flow, rowHeights }) => {
  const { mark, first: start } = block;
  if (!prev || !atPageTop(start, page) || prev.page !== start.page - 1 || flow.rowScale.has(mark)) return undefined;
  const textH = textHeight(page);
  const gap = pages[prev.page].contentBottom - prev.bottom - prev.marginBottom;
  const photoH = rowHeights.get(mark) ?? 0;
  if (!(gap > textH * MIN_GAP_SHARE && photoH > 0)) return undefined;
  // Место под ряд: пустота минус поля ряда (react-pdf учитывает и нижнее); подпись под фото не уменьшается.
  const rowH = start.bottom - start.top;
  const room = gap - start.marginTop - start.marginBottom - (rowH - photoH) - EPS * 2;
  const scale = room / photoH;
  if (!(scale >= MIN_ROW_SCALE && photoH * scale >= textH * MIN_ROW_SHARE)) return undefined;
  return { type: "rowScale", mark, scale: Math.min(1, scale) };
};

/** Фото одно на полосе (до и после — другие полосы) → ставим по центру полосы набора. */
const centerRow: Rule = ({ block, prev, next, page, flow }) => {
  const { mark, first: start, last: end } = block;
  const alone = atPageTop(start, page) && (!prev || prev.page < start.page) && (!next || next.first.page > end.page);
  if (!alone || start.page !== end.page || flow.rowOffset.has(mark)) return undefined;
  const textH = textHeight(page);
  const offset = (textH - (end.bottom - start.top)) / 2;
  return offset > textH * MIN_OFFSET_SHARE ? { type: "rowOffset", mark, offset: Math.round(offset) } : undefined;
};

/** Концовка главы одна на новой полосе → не ставим. */
const lonelyTail: Rule = ({ block, prev, flow }) => {
  if (!prev || prev.page >= block.first.page || flow.noTail.has(block.chapter)) return undefined;
  return { type: "noTail", chapter: block.chapter };
};

/** Правила по виду блока. Для ряда фото сначала пробуем уменьшить, и только если это не нужно — центрировать. */
const RULES: Record<FlowKind, Rule> = {
  h: hangingHeading,
  k: hangingHeading,
  b: () => undefined,
  r: (spot) => shrinkRow(spot) ?? centerRow(spot),
  t: lonelyTail,
};

/**
 * Куски глав: глава целиком, а там, где ответ уже начинается с принудительного разрыва (breakBefore), —
 * новый кусок. Номер куска для каждого блока, в порядке блоков.
 */
function segmentsOf(blocks: FlowBlock[], breakBefore: ReadonlySet<string>): string[] {
  let segment = "";
  let chapter = "";
  return blocks.map((b) => {
    if (b.chapter !== chapter || (b.kind === "h" && breakBefore.has(b.item))) segment = `${b.chapter}/${b.item}`;
    chapter = b.chapter;
    return segment;
  });
}

/** Блок по индексу, если он из той же главы. */
const inChapter = (blocks: FlowBlock[], index: number, chapter: string) => (blocks[index]?.chapter === chapter ? blocks[index] : undefined);

/**
 * Решения для следующего прохода по раскладке прошлого. Не больше одного на кусок главы: первое по порядку.
 * Уже принятые (`flow`) не повторяются. rowHeights — высота самих фото в ряду (без подписи), pt: чтобы посчитать масштаб;
 * minLead — сколько текста (pt) должно стоять под заголовком на той же полосе, около трёх строк.
 */
export function nextDecisions(layout: FlowLayout, flow: FlowDecisions, rowHeights: ReadonlyMap<string, number>, minLead = 0): FlowDecision[] {
  const { blocks, pages } = layout;
  const segments = segmentsOf(blocks, flow.breakBefore);
  const decided = new Set<string>();
  const decisions: FlowDecision[] = [];
  blocks.forEach((block, i) => {
    if (decided.has(segments[i])) return;
    const prev = inChapter(blocks, i - 1, block.chapter)?.last;
    const next = inChapter(blocks, i + 1, block.chapter);
    const decision = RULES[block.kind]({ block, prev, next, page: pages[block.first.page], pages, flow, rowHeights, minLead });
    if (!decision) return;
    decided.add(segments[i]);
    decisions.push(decision);
  });
  return decisions;
}

export function applyDecision(flow: FlowDecisions, decision: FlowDecision) {
  switch (decision.type) {
    case "breakBefore":
      flow.breakBefore.add(decision.item);
      break;
    case "rowScale":
      flow.rowScale.set(decision.mark, decision.scale);
      break;
    case "rowOffset":
      flow.rowOffset.set(decision.mark, decision.offset);
      break;
    case "noTail":
      flow.noTail.add(decision.chapter);
      break;
  }
}
