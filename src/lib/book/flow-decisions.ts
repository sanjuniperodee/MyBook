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
 *  - на полосе только фото (один или несколько рядов, с подписями, может быть с концовкой главы) → они встают по центру
 *    по вертикали, как фотостраница;
 *  - концовка главы перескочила одна на новую полосу → её не ставим.
 * Ряд фото, который автор поставил сам (отступ сверху или «с новой страницы», вид f), доводка не уменьшает и не
 * центрирует: он стоит, как поставили; на его полосе соседние ряды тоже не центрируются.
 *
 * Решения копятся (не отменяются) и в пределах куска главы между принудительными разрывами
 * принимаются по одному за проход: каждое сдвигает всё, что ниже, и дальше смотрим уже на новую раскладку.
 */

/**
 * Вид помеченного блока: h — заголовок или разделитель ответа, k — лид, b — другой блок набора (абзац, цитата, список,
 * стих), r — ряд фото, f — ряд фото, поставленный автором (отступ сверху, «с новой страницы»), t — концовка главы.
 */
export const FLOW_KINDS = ["h", "k", "b", "r", "f", "t"] as const;
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
  /**
   * Буквица: сколько знаков абзаца (после буквы буквицы) встало в строки рядом с ней — по пометке блока. Текст под
   * буквицей продолжается с этого места; до первого замера — с оценки по ширине знаков.
   */
  dropSplit: Map<string, number>;
  /** Главы (и альбом, "__gallery"), перед начальной полосой которых стоит пустая полоса: начальная полоса — слева (BookContent.openersLeft). */
  blankBefore: Set<string>;
}

export const emptyFlow = (): FlowDecisions => ({ breakBefore: new Set(), rowScale: new Map(), rowOffset: new Map(), noTail: new Set(), dropSplit: new Map(), blankBefore: new Set() });

/**
 * Пустые полосы перед начальными полосами (BookContent.openersLeft): начальная полоса главы и альбома встаёт слева —
 * на чётную страницу, а первая полоса текста напротив неё, справа. order — главы по порядку книги (с альбомом в конце),
 * pages — где встали их начальные полосы в этом проходе (с 1). Решение пересчитывается целиком: пустая полоса перед
 * главой сдвигает все следующие на одну, поэтому каждая глава смотрит на страницу с учётом решений по главам выше.
 * Длина глав от стороны полосы не зависит, так что следующий проход обычно уже сходится. Вернёт, поменялось ли решение.
 */
export function refineBlanks(order: readonly string[], pages: Readonly<Record<string, number>>, flow: FlowDecisions): boolean {
  const next = new Set<string>();
  let shift = 0;
  for (const key of order) {
    const at = pages[key];
    if (at === undefined) continue;
    const had = flow.blankBefore.has(key);
    // Страница начальной полосы без её пустой полосы — после решений по главам выше.
    const bare = at + shift - (had ? 1 : 0);
    const need = bare % 2 === 1;
    if (need) next.add(key);
    shift += Number(need) - Number(had);
  }
  const changed = next.size !== flow.blankBefore.size || [...next].some((k) => !flow.blankBefore.has(k));
  flow.blankBefore.clear();
  for (const k of next) flow.blankBefore.add(k);
  return changed;
}

/**
 * Сколько знаков исходного текста заняли первые count строк раскладки. react-pdf переводит регистр (капитель) и ставит
 * дефис в месте переноса — такой дефис знаком текста не считается. Строки не совпали с текстом — null (оставляем оценку).
 */
export function linesOffset(source: string, lines: readonly string[], count: number): number | null {
  let pos = 0;
  for (const line of lines.slice(0, count))
    for (const ch of line) {
      const src = source[pos];
      if (src !== undefined && (src === ch || src.toUpperCase() === ch.toUpperCase())) pos++;
      else if (ch === "-" || ch === "\u00AD" || ch === "\u2010") continue;
      else return null;
    }
  return pos;
}

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
  /** Следующие блоки той же главы по порядку (next — первый): до полосы, где блок кончился, и первый после неё. */
  rest: FlowBlock[];
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

/**
 * На полосе только фото → ставим по центру полосы набора, как фотостраницу. «Только фото» — с верха полосы подряд стоят
 * ряды фото (один или несколько, с подписями), за ними может быть концовка главы; текста ответа, заголовков и карточек
 * QR на полосе нет: до — другая полоса, следующий блок главы — тоже на другой. Отступ получает первый ряд, остальное
 * (ряды и концовка) сдвигается вместе с ним; объём книги не меняется — сдвиг не больше половины свободного места.
 */
const centerRow: Rule = ({ block, prev, rest, page, flow }) => {
  const { mark, first: start } = block;
  if (!atPageTop(start, page) || (prev && prev.page >= start.page) || flow.rowOffset.has(mark)) return undefined;
  // Группа полосы: этот ряд, следующие ряды на той же полосе и концовка главы последней.
  let end = block;
  let i = 0;
  for (; i < rest.length; i++) {
    const b = rest[i];
    if (b.first.page !== start.page || !(b.kind === "r" || b.kind === "t") || end.kind === "t") break;
    end = b;
  }
  const after = rest[i];
  // Блок группы разбит на полосы или следом на той же полосе что-то ещё (текст, заголовок, карточка) → не только фото.
  if (end.last.page !== start.page || block.last.page !== start.page || (after && after.first.page <= start.page)) return undefined;
  if (rest.slice(0, i).some((b) => b.last.page !== start.page)) return undefined;
  const textH = textHeight(page);
  const height = end.last.bottom - start.top;
  const offset = (textH - height) / 2;
  // Нижнее поле последнего блока тоже должно уместиться — иначе сдвиг вытолкнет его на следующую полосу.
  if (offset + height + end.last.marginBottom > textH - EPS) return undefined;
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
  f: () => undefined,
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

/** Блоки той же главы с index: те, что начинаются не позже полосы page, и первый после неё. */
function restOfChapter(blocks: FlowBlock[], index: number, chapter: string, page: number): FlowBlock[] {
  const out: FlowBlock[] = [];
  for (let i = index; blocks[i]?.chapter === chapter; i++) {
    out.push(blocks[i]);
    if (blocks[i].first.page > page) break;
  }
  return out;
}

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
    const rest = restOfChapter(blocks, i + 1, block.chapter, block.last.page);
    const decision = RULES[block.kind]({ block, prev, next, rest, page: pages[block.first.page], pages, flow, rowHeights, minLead });
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
