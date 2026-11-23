/**
 * Разбивка текста главы на полосы — по правилам react-pdf (@react-pdf/layout 4.x: splitNodes, shouldBreak, splitText,
 * splitView, relayout после разрыва). PDF раскладывает блоки на полосе Yoga (столбик, поля не схлопываются) и переносит
 * их по своим правилам: блок с полем снизу, которое не помещается, уходит целиком; текст делится по строкам с висячими
 * строками (orphans/widows); блок «держать со следующим» (minPresenceAhead) уходит, если за ним мало места; неделимый
 * блок (wrap={false}) уходит целиком. Браузерные колонки этого не повторяют — превью считает полосы здесь и ставит
 * разрывы там, где их поставит PDF.
 *
 * Дерево — как у PDF: текст (строки с высотами), блок с детьми (столбик или ряд) и неделимый лист с высотой. Размеры — pt.
 * Код повторяет react-pdf шаг в шаг (имена и порядок проверок — оттуда), кроме того, чего в книге нет (float, fixed
 * с render, фиксированная высота блоков).
 */

const SAFETY_THRESHOLD = 0.001;

interface Spacing {
  /** Поля (margin) и отступы (padding) сверху и снизу, pt. */
  mt: number;
  mb: number;
  pt: number;
  pb: number;
}

interface Props {
  /** Пометка блока — ключ в результате (блоки доводки, начала полос). */
  id?: string;
  /** Делится между полосами (react-pdf wrap); у текста — по строкам. */
  wrap: boolean;
  /** Разрыв перед блоком (react-pdf break). */
  brk: boolean;
  /** Сколько места за блоком нужно на полосе, pt (react-pdf minPresenceAhead). */
  minPresenceAhead: number;
}

export interface PText extends Spacing, Props {
  kind: "text";
  /** Высоты строк, pt. */
  lines: number[];
  orphans: number;
  widows: number;
}

export interface PView extends Spacing, Props {
  kind: "view";
  children: PNode[];
  /** Ряд (flexDirection: row): дети рядом, высота — по самому высокому. */
  row?: boolean;
  /** Высота содержимого листа без детей (картинка, рисунок, неделимый блок), pt. */
  content?: number;
}

export type PNode = PText | PView;

/** Узел, разложенный на полосе: верх (от верха родителя) и высота рамки, как box у react-pdf. */
interface Laid {
  node: PNode;
  top: number;
  height: number;
  /** Строки текста, оставшиеся у этого куска ([from, to) исходных). */
  from: number;
  to: number;
  children: Laid[];
  /** Кусок продолжает узел с прошлой полосы (поля и отступы сверху сняты). */
  cont: boolean;
  /** Кусок закончится на следующей полосе (поля и отступы снизу сняты). */
  cut: boolean;
  /**
   * Высота рамки задана (react-pdf: у куска разбитого блока — до низа полосы, у полосы — её высота): дети, которые не
   * помещаются, ужимаются по Yoga (flexShrink 1 — пропорционально высоте), поля не ужимаются.
   */
  fixed?: number;
  /** Остаток высоты листа заданной высоты на следующей полосе (react-pdf splitNode: nextHeight). */
  remain?: number;
}

/** Кусок помеченного блока на полосе: координаты от верха полосы (как FlowPiece) и строки текста [from, to). */
export interface PagePiece {
  id: string;
  page: number;
  top: number;
  bottom: number;
  marginTop: number;
  marginBottom: number;
  from: number;
  to: number;
}

const sp = (n: PNode, l: Pick<Laid, "cont" | "cut">) => ({ mt: l.cont ? 0 : n.mt, pt: l.cont ? 0 : n.pt, mb: l.cut ? 0 : n.mb, pb: l.cut ? 0 : n.pb });

/** Раскладка Yoga для столбика: высота рамки и места детей. Поля соседей складываются. */
function layoutNode(l: Laid): Laid {
  const s = sp(l.node, l);
  if (l.node.kind === "text") {
    let h = 0;
    for (let i = l.from; i < l.to; i++) h += l.node.lines[i];
    l.height = s.pt + h + s.pb;
    return l;
  }
  if (!l.children.length && l.node.kind === "view" && !l.node.children.length) {
    // Лист заданной высоты (content — style.height у react-pdf, рамка целиком): кусок до низа полосы, остаток — дальше.
    l.height = l.fixed ?? l.remain ?? (l.node.content !== undefined ? l.node.content : s.pt + s.pb);
    return l;
  }
  if (!l.children.length) {
    l.height = l.fixed ?? s.pt + s.pb;
    return l;
  }
  let max = 0;
  for (const c of l.children) {
    layoutNode(c);
    const cs = sp(c.node, c);
    if (l.node.row) {
      c.top = s.pt + cs.mt;
      max = Math.max(max, cs.mt + c.height + cs.mb);
    }
  }
  if (l.node.row) {
    l.height = l.fixed ?? s.pt + max + s.pb;
    return l;
  }
  const stack = () => {
    let cursor = s.pt;
    for (const c of l.children) {
      const cs = sp(c.node, c);
      c.top = cursor + cs.mt;
      cursor = c.top + c.height + cs.mb;
    }
    return cursor + s.pb;
  };
  const natural = stack();
  if (l.fixed !== undefined && natural > l.fixed + SAFETY_THRESHOLD) {
    // Не помещается в заданную высоту: Yoga ужимает детей (flexShrink 1, основа — их высота).
    const total = l.children.reduce((a, c) => a + c.height, 0);
    const over = natural - l.fixed;
    if (total > 0) for (const c of l.children) c.height = Math.max(0, c.height - (over * c.height) / total);
    stack();
  }
  l.height = l.fixed ?? natural;
  return l;
}

const laid = (node: PNode): Laid => ({
  node,
  top: 0,
  height: 0,
  from: 0,
  to: node.kind === "text" ? node.lines.length : 0,
  children: node.kind === "view" ? node.children.map(laid) : [],
  cont: false,
  cut: false,
});

/** Строка, на которой текст перестаёт помещаться в height (от верха текста). */
function lineIndexAtHeight(l: Laid, height: number) {
  const n = l.node as PText;
  let top = sp(n, l).pt;
  for (let i = l.from; i < l.to; i++) {
    if (top + n.lines[i] > height) return i - l.from;
    top += n.lines[i];
  }
  return l.to - l.from;
}

function getLineBreak(l: Laid, height: number) {
  const n = l.node as PText;
  const linesQuantity = l.to - l.from;
  const slicedLine = lineIndexAtHeight(l, height - l.top);
  if (slicedLine === 0) return 0;
  if (linesQuantity < n.orphans) return linesQuantity;
  if (slicedLine < n.orphans || linesQuantity < n.orphans + n.widows) return 0;
  if (linesQuantity === n.orphans + n.widows) return n.orphans;
  if (linesQuantity - slicedLine < n.widows) return linesQuantity - n.widows;
  return slicedLine;
}

function splitText(l: Laid, height: number): [Laid | null, Laid | null] {
  const at = l.from + getLineBreak(l, height);
  const current: Laid = { ...l, to: at, cut: true, children: [] };
  const next: Laid = { ...l, from: at, top: 0, cont: true, children: [] };
  return [current, next];
}

function getEndOfPresence(child: Laid, future: Laid[]) {
  const s = sp(child.node, child);
  const after = child.top + child.height + s.mb + (child.node.minPresenceAhead ?? 0);
  if (!future.length) return after;
  return Math.min(after, Math.max(...future.map((n) => n.top + n.height)));
}

function shouldBreak(child: Laid, future: Laid[], height: number, previous: Laid[]) {
  const shouldSplit = height < child.top + child.height;
  const canWrap = child.node.wrap;
  const endOfPresence = getEndOfPresence(child, future);
  const breakingImprovesPresence = previous.length > 0;
  return child.node.brk || (shouldSplit && !canWrap) || (!shouldSplit && endOfPresence > height && breakingImprovesPresence);
}

function splitView(l: Laid, height: number, contentArea: number): [Laid | null, Laid | null] {
  if (l.node.kind === "view" && !l.node.children.length) {
    // Лист без детей: кусок — до низа полосы, у листа заданной высоты остаток уходит дальше.
    const here = height - l.top;
    const total = l.remain ?? l.node.content;
    return [
      { ...l, cut: true, fixed: here },
      { ...l, top: 0, cont: true, fixed: undefined, remain: total === undefined ? undefined : total - here },
    ];
  }
  const [currentChildren, nextChildren] = splitNodes(height - l.top, contentArea, l.children);
  // Кусок на этой полосе — до её низа (react-pdf splitNode: height − nodeTop).
  const current: Laid = { ...l, cut: true, children: currentChildren, fixed: height - l.top };
  const next: Laid = { ...l, top: 0, cont: true, children: nextChildren };
  return [current, next];
}

const split = (l: Laid, height: number, contentArea: number) => (l.node.kind === "text" ? splitText(l, height) : splitView(l, height, contentArea));

/** react-pdf splitNodes: что остаётся на полосе высотой height (от верха контейнера) и что уходит дальше. */
function splitNodes(height: number, contentArea: number, nodes: Laid[]): [Laid[], Laid[]] {
  const current: Laid[] = [];
  const next: Laid[] = [];
  for (let i = 0; i < nodes.length; i++) {
    const child = nodes[i];
    const future = nodes.slice(i + 1);
    const nodeTop = child.top;
    const nodeHeight = child.height;
    const isOutside = height <= nodeTop;
    const brk = shouldBreak(child, future, height, current);
    const shouldSplit = height + SAFETY_THRESHOLD < nodeTop + nodeHeight;
    const canWrap = child.node.wrap;
    const fitsInsidePage = nodeHeight <= contentArea;
    if (isOutside) {
      next.push({ ...child, top: child.top - height });
      continue;
    }
    if (!fitsInsidePage && !canWrap) {
      current.push(child);
      next.push(...future);
      break;
    }
    if (brk) {
      // Перенесённый блок на новой полосе делится и без разрыва перед собой (react-pdf: wrap true, break false).
      next.push({ ...child, top: child.top - height, node: { ...child.node, wrap: true, brk: false } as PNode }, ...future);
      break;
    }
    if (shouldSplit) {
      const [cur, nxt] = split(child, height, contentArea);
      if (child.children.length > 0 && cur && cur.children.length === 0) {
        if (current.length === 0) {
          current.push(child);
          next.push(...future);
        } else {
          next.push({ ...child, top: child.top - height }, ...future);
        }
        break;
      }
      if (cur) current.push(cur);
      if (nxt) next.push(nxt);
      continue;
    }
    current.push(child);
  }
  return [current, next];
}

/** Полоса: где на ней начинается набор (верх) и где он кончается, pt от верха полосы. */
export interface PageFrame {
  contentTop: number;
  contentBottom: number;
}

/** Есть ли у куска что-то, кроме пустых блоков (react-pdf не делает полосу из одних пустых узлов). */
const empty = (l: Laid): boolean => (l.node.kind === "text" ? l.to <= l.from : l.children.length ? l.children.every(empty) : l.cont);

/**
 * Полосы текста главы, как у react-pdf: дети полосы — блоки в порядке вёрстки. Результат — куски помеченных блоков по
 * полосам (координаты от верха полосы, с полями — как FlowPiece) и число полос.
 */
export function paginate(children: PNode[], frame: PageFrame): { pages: number; pieces: PagePiece[] } {
  const pieces: PagePiece[] = [];
  const wrapArea = frame.contentBottom;
  const contentArea = frame.contentBottom - frame.contentTop;
  let rest: Laid[] = children.map(laid);
  let page = 0;
  // Полос не больше, чем строк и блоков: защита от зацикливания на блоке, который не помещается нигде.
  for (let guard = 0; rest.length && guard < 10_000; guard++) {
    // Раскладка полосы: блоки столбиком от верхнего поля (как relayoutPage).
    const pageNode: Laid = { node: { kind: "view", children: [], mt: 0, mb: 0, pt: frame.contentTop, pb: 0, wrap: true, brk: false, minPresenceAhead: 0 }, top: 0, height: 0, from: 0, to: 0, children: rest, cont: false, cut: false };
    layoutNode(pageNode);
    // Как у react-pdf: блок с разрывом первым на полосе всё равно уходит дальше (с break: false) — полоса остаётся
    // пустой; дальше он встаёт без разрыва, так что цикл идёт вперёд.
    const [current, next] = splitNodes(wrapArea, contentArea, rest);
    // Полоса — заданной высоты: что не помещается (поле снизу последнего блока), ужимается, как у Yoga.
    const cur: Laid = { ...pageNode, children: current, fixed: wrapArea };
    layoutNode(cur);
    collect(cur, 0, page, pieces);
    page++;
    // Пустые остатки (текст, у которого все строки встали) переходят дальше, как у react-pdf: на следующей полосе они
    // «предыдущие» для правил. Остались только они — полос больше нет.
    rest = next.some((l) => !empty(l)) ? next : [];
  }
  return { pages: page, pieces };
}

/** Куски помеченных блоков полосы: координаты от верха полосы. */
function collect(l: Laid, offset: number, page: number, out: PagePiece[]) {
  for (const c of l.children) {
    const top = offset + c.top;
    const s = sp(c.node, c);
    if (c.node.id && (c.node.kind !== "text" || c.to > c.from)) out.push({ id: c.node.id, page, top, bottom: top + c.height, marginTop: s.mt, marginBottom: s.mb, from: c.from, to: c.to });
    collect(c, top, page, out);
  }
}
