/**
 * Доводка вёрстки текста глав по готовой раскладке: чтение раскладки react-pdf.
 *
 * Блок собирается в несколько проходов (см. `renderInterior`): после каждого читаем раскладку — координаты
 * помеченных блоков на полосах — и передаём её в `lib/book/flow-decisions.ts`, где принимаются решения
 * для следующего прохода. Здесь только обход узлов react-pdf, пометки и координаты; правил вёрстки тут нет.
 */
import {
  applyDecision,
  FLOW_KINDS,
  linesOffset,
  type FlowBlock,
  type FlowDecisions,
  type FlowKind,
  type FlowLayout,
  type FlowPage,
  type FlowPiece,
  nextDecisions,
} from "@/lib/book/flow-decisions";

/** Пометка блока в раскладке: `<вид>:<ответ>[:…]`, у концовки главы — `t:<глава>`; виды — `FlowKind`. */
export const FLOW_MARK = "flowMark";

/** Пометка колонки строк рядом с буквицей: значение — пометка абзаца (ключ в FlowDecisions.dropSplit). */
export const DROP_MARK = "dropMark";

interface Box {
  top: number;
  height: number;
  marginTop?: number;
  marginBottom?: number;
  paddingTop?: number;
  paddingBottom?: number;
}
interface LayoutNode {
  box?: Box;
  props?: Record<string, unknown>;
  children?: LayoutNode[];
  /** Строки текста (у узлов Text). */
  lines?: { string?: string }[];
}

interface Placed {
  mark: string;
  kind: FlowKind;
  /** Ответ, к которому относится пометка (у концовки — глава). */
  item: string;
  piece: FlowPiece;
}

/** Разбор пометки узла; чужие пометки (не из нашего набора видов) и узлы без неё — не блоки доводки. */
function parseMark(value: unknown): { mark: string; kind: FlowKind; item: string } | undefined {
  if (typeof value !== "string") return undefined;
  const [kind, item] = value.split(":");
  return item !== undefined && (FLOW_KINDS as readonly string[]).includes(kind) ? { mark: value, kind: kind as FlowKind, item } : undefined;
}

/**
 * Кусок блока в счёт, если он не пустой: react-pdf оставляет абзац нулевой высоты внизу полосы, а текст переносит.
 * У заголовка и разделителя кусков меньше строки не бывает, а линейка-разделитель тоньше пункта — их считаем при
 * любой ненулевой высоте.
 */
const counts = (kind: FlowKind, height: number) => height >= 1 || (kind === "h" && height > 0);

/** Помеченные блоки (куски) полосы по порядку обхода; координаты — от верха полосы. */
function placedOn(page: LayoutNode, pageIndex: number): Placed[] {
  const placed: Placed[] = [];
  const walk = (node: LayoutNode, offset: number) => {
    const top = offset + (node.box?.top ?? 0);
    const parts = parseMark(node.props?.[FLOW_MARK]);
    if (parts && node.box && counts(parts.kind, node.box.height)) {
      const { height, marginTop = 0, marginBottom = 0 } = node.box;
      placed.push({ ...parts, piece: { page: pageIndex, top, bottom: top + height, marginTop, marginBottom } });
    }
    for (const c of node.children ?? []) walk(c, top);
  };
  for (const c of page.children ?? []) walk(c, 0);
  return placed;
}

/** Полоса набора: от верхнего поля до нижнего. */
const pageInfo = (page: LayoutNode): FlowPage => ({ contentTop: page.box?.paddingTop ?? 0, contentBottom: (page.box?.height ?? 0) - (page.box?.paddingBottom ?? 0) });

/**
 * Раскладка для решений: полосы и блоки по порядку. Блок, разбитый на несколько полос, — один, с первым
 * и последним куском. chapterOf — глава каждого ответа (у концовки глава в пометке).
 */
export function readLayout(layout: unknown, chapterOf: ReadonlyMap<string, string>): FlowLayout {
  const pages: FlowPage[] = [];
  const blocks = new Map<string, FlowBlock>(); // порядок вставки = порядок первого появления
  ((layout as LayoutNode).children ?? []).forEach((node, pageIndex) => {
    pages.push(pageInfo(node));
    for (const { mark, kind, item, piece } of placedOn(node, pageIndex)) {
      const block = blocks.get(mark);
      if (block) block.last = piece;
      else blocks.set(mark, { mark, kind, item, chapter: kind === "t" ? item : (chapterOf.get(item) ?? ""), first: piece, last: piece });
    }
  });
  return { pages, blocks: [...blocks.values()] };
}

/**
 * Решения для следующего прохода по раскладке react-pdf; добавляются в `flow`. Возвращает true, если что-то добавилось.
 * rowHeights — высота самих фото в ряду (без подписи), pt: чтобы посчитать масштаб.
 * minLead — сколько текста (pt) должно стоять под заголовком на той же полосе: около трёх строк.
 */
export function refineFlow(layout: unknown, flow: FlowDecisions, rowHeights: ReadonlyMap<string, number>, chapterOf: ReadonlyMap<string, string>, minLead = 0): boolean {
  const decisions = nextDecisions(readLayout(layout, chapterOf), flow, rowHeights, minLead);
  for (const decision of decisions) applyDecision(flow, decision);
  return decisions.length > 0;
}

/**
 * Буквицы: сколько знаков встало в строки рядом с каждой (по раскладке прохода) — записывает в flow.dropSplit.
 * columns — текст колонки рядом с буквицей и число строк по пометке абзаца (их собирает сама вёрстка).
 * Возвращает true, если место продолжения текста поменялось: нужен ещё проход.
 */
export function refineDropCaps(layout: unknown, flow: FlowDecisions, columns: ReadonlyMap<string, { text: string; lines: number }>): boolean {
  let changed = false;
  const walk = (node: LayoutNode) => {
    const mark = node.props?.[DROP_MARK];
    const column = typeof mark === "string" ? columns.get(mark) : undefined;
    if (typeof mark === "string" && column && node.lines) {
      const at = linesOffset(column.text, node.lines.map((l) => l.string ?? ""), column.lines);
      if (at !== null && flow.dropSplit.get(mark) !== at) {
        flow.dropSplit.set(mark, at);
        changed = true;
      }
    }
    for (const c of node.children ?? []) walk(c);
  };
  walk(layout as LayoutNode);
  return changed;
}
