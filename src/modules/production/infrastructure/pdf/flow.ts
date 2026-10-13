/**
 * Доводка вёрстки текста глав по готовой раскладке — как это делает верстальщик после первой сборки.
 *
 * react-pdf не умеет «плавающих» фото и надёжно не держит заголовок вместе с текстом. Поэтому блок
 * собирается в несколько проходов: после каждого читаем раскладку (координаты помеченных блоков на
 * полосах) и принимаем решения для следующего прохода:
 *  - заголовок (или лид) остался внизу полосы, а текст ушёл дальше → ответ начинается с новой полосы;
 *  - фото не поместилось и перескочило на следующую полосу, оставив пустоту → фото уменьшается
 *    ровно до свободного места (если это не делает его слишком мелким);
 *  - фото оказалось на полосе одно → встаёт по центру по вертикали, как фотостраница;
 *  - концовка главы перескочила одна на новую полосу → её не ставим.
 *
 * Решения копятся (не отменяются) и в пределах куска главы между принудительными разрывами
 * принимаются по одному за проход: каждое сдвигает всё, что ниже, и дальше смотрим уже на новую раскладку.
 */

/** Пометка блока в раскладке: `h:` заголовок/разделитель, `k:` лид, `b:` блок текста, `r:` ряд фото, `t:` концовка. */
export const FLOW_MARK = "flowMark";

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

export const flowSize = (f: FlowDecisions) => f.breakBefore.size + f.rowScale.size + f.rowOffset.size + f.noTail.size;

/** Фото не уменьшаем сильнее — и не мельче этой доли высоты полосы набора. */
export const MIN_ROW_SCALE = 0.45;
const MIN_ROW_SHARE = 0.3;
/** Пустота меньше этой доли полосы — не повод что-то менять. */
const MIN_GAP_SHARE = 0.12;
const EPS = 1.5;

interface Box {
  top: number;
  height: number;
  marginTop?: number;
  marginBottom?: number;
}
interface LayoutNode {
  box?: Box;
  props?: Record<string, unknown>;
  children?: LayoutNode[];
}

interface Placed {
  mark: string;
  page: number;
  top: number;
  bottom: number;
  marginTop: number;
  marginBottom: number;
}

interface PageInfo {
  contentTop: number;
  contentBottom: number;
}

const kind = (mark: string) => mark.slice(0, mark.indexOf(":"));
/** Ответ, к которому относится пометка (у концовки — глава). */
const itemOf = (mark: string) => mark.split(":")[1];

/**
 * Кусок блока в счёт, если он не пустой: react-pdf оставляет абзац нулевой высоты внизу полосы, а текст переносит.
 * У заголовка и разделителя кусков меньше строки не бывает, а линейка-разделитель тоньше пункта — их считаем при
 * любой ненулевой высоте.
 */
const counts = (mark: string, height: number) => height >= 1 || (kind(mark) === "h" && height > 0);

/** Все помеченные блоки по порядку: для блока, разбитого на несколько полос, — каждый кусок. */
function collect(layout: LayoutNode) {
  const placed: Placed[] = [];
  const pages: PageInfo[] = [];
  (layout.children ?? []).forEach((page, pageIndex) => {
    const box = page.box as (Box & { paddingTop?: number; paddingBottom?: number }) | undefined;
    pages.push({ contentTop: box?.paddingTop ?? 0, contentBottom: (box?.height ?? 0) - (box?.paddingBottom ?? 0) });
    const walk = (node: LayoutNode, offset: number) => {
      const top = offset + (node.box?.top ?? 0);
      const mark = node.props?.[FLOW_MARK];
      if (typeof mark === "string" && node.box && counts(mark, node.box.height))
        placed.push({ mark, page: pageIndex, top, bottom: top + node.box.height, marginTop: node.box.marginTop ?? 0, marginBottom: node.box.marginBottom ?? 0 });
      for (const c of node.children ?? []) walk(c, top);
    };
    for (const c of page.children ?? []) walk(c, 0);
  });
  return { placed, pages };
}

/**
 * Решения для следующего прохода. Возвращает true, если что-то добавилось.
 * rowHeights — высота самих фото в ряду (без подписи), pt: чтобы посчитать масштаб.
 */
export function refineFlow(
  layout: unknown,
  flow: FlowDecisions,
  rowHeights: Map<string, number>,
  chapterOf: Map<string, string>,
  /** Сколько текста (pt) должно стоять под заголовком на той же полосе — около трёх строк. */
  minLead = 0,
): boolean {
  const { placed, pages } = collect(layout as LayoutNode);
  // Куски одного блока на разных полосах: первый (где начался) и последний (где закончился).
  const order: string[] = [];
  const first = new Map<string, Placed>();
  const last = new Map<string, Placed>();
  for (const p of placed) {
    if (!first.has(p.mark)) {
      first.set(p.mark, p);
      order.push(p.mark);
    }
    last.set(p.mark, p);
  }
  /** Глава пометки: у концовки в пометке сама глава, у остальных — ответ. */
  const chapterOfMark = (m: string) => (kind(m) === "t" ? itemOf(m) : (chapterOf.get(itemOf(m)) ?? ""));
  const touched = new Set<string>(); // куски глав (глава + разрыв), где в этом проходе уже есть решение
  const segmentOf = new Map<string, string>();
  let segment = "";
  let chapter = "";
  for (const m of order) {
    const it = itemOf(m);
    const ch = chapterOfMark(m);
    if (ch !== chapter || (kind(m) === "h" && flow.breakBefore.has(it))) segment = `${ch}/${it}`;
    chapter = ch;
    segmentOf.set(m, segment);
  }
  let changed = false;
  const decide = (mark: string, apply: () => void) => {
    const seg = segmentOf.get(mark)!;
    if (touched.has(seg)) return;
    touched.add(seg);
    apply();
    changed = true;
  };

  for (let i = 0; i < order.length; i++) {
    const mark = order[i];
    const k = kind(mark);
    const start = first.get(mark)!;
    const end = last.get(mark)!;
    const prev = i > 0 && chapterOfMark(order[i - 1]) === chapterOfMark(mark) ? last.get(order[i - 1]) : undefined;
    const sameChapterNext = i + 1 < order.length && chapterOfMark(order[i + 1]) === chapterOfMark(mark) ? first.get(order[i + 1]) : undefined;
    const page = pages[start.page];
    const textH = page.contentBottom - page.contentTop;

    // Заголовок или лид — последний на полосе, а продолжение ответа уже на следующей (или под ним всего пара строк).
    const nextMark = order[i + 1];
    const nextEnd = nextMark ? last.get(nextMark) : undefined;
    const thinLead = !!sameChapterNext && kind(nextMark) === "b" && sameChapterNext.page === end.page && nextEnd!.page > end.page && sameChapterNext.bottom - sameChapterNext.top < minLead;
    if ((k === "h" || k === "k") && sameChapterNext && itemOf(nextMark) === itemOf(mark) && (sameChapterNext.page > end.page || thinLead)) {
      const it = itemOf(mark);
      // Ответ и так начинается с полосы — разрывом ничего не исправить.
      if (!flow.breakBefore.has(it) && start.top > page.contentTop + EPS) decide(mark, () => flow.breakBefore.add(it));
      continue;
    }

    if (k === "r") {
      const atTop = start.top - start.marginTop <= page.contentTop + EPS;
      // Фото перескочило на новую полосу и оставило пустоту на предыдущей.
      if (atTop && prev && prev.page === start.page - 1 && !flow.rowScale.has(mark)) {
        const before = pages[prev.page];
        const gap = before.contentBottom - prev.bottom - prev.marginBottom;
        const photoH = rowHeights.get(mark) ?? 0;
        const rowH = start.bottom - start.top;
        if (gap > textH * MIN_GAP_SHARE && photoH > 0) {
          // Место под ряд: пустота минус поля ряда (react-pdf учитывает и нижнее); подпись под фото не уменьшается.
          const room = gap - start.marginTop - start.marginBottom - (rowH - photoH) - EPS * 2;
          const scale = room / photoH;
          if (scale >= MIN_ROW_SCALE && photoH * scale >= textH * MIN_ROW_SHARE) {
            decide(mark, () => flow.rowScale.set(mark, Math.min(1, scale)));
            continue;
          }
        }
      }
      // Фото одно на полосе (до и после — другие полосы): ставим по центру полосы набора.
      const alone = atTop && (!prev || prev.page < start.page) && (!sameChapterNext || sameChapterNext.page > end.page);
      if (alone && start.page === end.page && !flow.rowOffset.has(mark)) {
        const offset = (page.contentBottom - page.contentTop - (end.bottom - start.top)) / 2;
        if (offset > textH * 0.04) decide(mark, () => flow.rowOffset.set(mark, Math.round(offset)));
      }
      continue;
    }

    // Концовка главы одна на новой полосе.
    if (k === "t" && prev && prev.page < start.page) {
      const ch = itemOf(mark);
      if (!flow.noTail.has(ch)) decide(mark, () => flow.noTail.add(ch));
    }
  }
  return changed;
}
