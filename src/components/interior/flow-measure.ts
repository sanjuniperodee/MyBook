/**
 * Доводка вёрстки в HTML-превью — те же решения, что у PDF (lib/book/flow-decisions.ts), по раскладке браузера.
 *
 * PDF собирается в несколько проходов: после каждого читается, где на полосах встали помеченные блоки, и принимаются
 * решения (ответ с новой полосы, ряд фото меньше, ряд по центру полосы, без концовки главы). Превью делает то же со
 * своей раскладкой: глава в CSS-колонках шириной в полосу набора, каждая колонка — полоса. Блоки помечены так же, как
 * в PDF (атрибут data-flow: «h:<ответ>», «b:<ответ>:<блок>», «r:<ответ>:<место>:<ряд>», «t:<глава>»), координаты — в
 * пунктах от верха полосы набора. Правила одни, поэтому где раскладки совпадают, совпадают и решения.
 */
import { emptyFlow, FLOW_KINDS, type FlowBlock, type FlowDecisions, type FlowKind, type FlowLayout, type FlowPiece } from "@/lib/book/flow-decisions";

/** Атрибут пометки блока доводки (значение — как FLOW_MARK у PDF). */
export const FLOW_ATTR = "data-flow";

/** Пометка блока доводки в разметке: data-flow. */
export const flowMark = (mark: string) => ({ [FLOW_ATTR]: mark }) as Record<string, string>;

/** Пустые решения: превью без доводки (миниатюры, первый кадр). Не менять — общий объект. */
export const NO_FLOW: FlowDecisions = emptyFlow();

/** Копия решений — следующий проход добавляет к ним свои. */
export function copyFlow(flow: FlowDecisions): FlowDecisions {
  return {
    breakBefore: new Set(flow.breakBefore),
    rowScale: new Map(flow.rowScale),
    rowOffset: new Map(flow.rowOffset),
    noTail: new Set(flow.noTail),
    dropSplit: new Map(flow.dropSplit),
    blankBefore: new Set(flow.blankBefore),
  };
}

/** Кусок в счёт, если он не пустой; заголовок и разделитель — при любой ненулевой высоте (как counts в pdf/flow.ts). */
const counts = (kind: FlowKind, height: number) => height >= 1 || (kind === "h" && height > 0);

/**
 * Раскладка главы в колонках для решений доводки. root — блок с колонками (column-width — полоса набора), ptPx —
 * пикселей в пункте, pageHeightPt — высота полосы набора в пунктах. Блок, разбитый на колонки, — один, с первым и
 * последним куском (getClientRects даёт по прямоугольнику на колонку).
 */
export function measureFlow(root: HTMLElement, chapter: string, ptPx: number, pageHeightPt: number): FlowLayout {
  const cs = getComputedStyle(root);
  const step = parseFloat(cs.columnWidth) + parseFloat(cs.columnGap);
  const box = root.getBoundingClientRect();
  const blocks: FlowBlock[] = [];
  let lastPage = 0;
  for (const el of root.querySelectorAll<HTMLElement>(`[${FLOW_ATTR}]`)) {
    const mark = el.getAttribute(FLOW_ATTR)!;
    const [kind, item] = mark.split(":");
    if (!(FLOW_KINDS as readonly string[]).includes(kind) || item === undefined) continue;
    const style = getComputedStyle(el);
    const marginTop = parseFloat(style.marginTop) / ptPx;
    // Отбивка снизу полем внутри блока (GAP_BELOW: ряд фото, карточка QR) — для правил это внешнее поле, как у PDF.
    const gapBelow = el.hasAttribute("data-gap-below") ? parseFloat(style.paddingBottom) / ptPx : 0;
    const marginBottom = parseFloat(style.marginBottom) / ptPx + gapBelow;
    const pieces: FlowPiece[] = [];
    const rects = [...el.getClientRects()];
    for (const r of rects) {
      const height = r.height / ptPx - (r === rects[rects.length - 1] ? gapBelow : 0);
      if (!counts(kind as FlowKind, height)) continue;
      const page = Math.max(0, Math.floor((r.left - box.left + 1) / step));
      const top = (r.top - box.top) / ptPx;
      pieces.push({ page, top, bottom: top + height, marginTop, marginBottom });
      lastPage = Math.max(lastPage, page);
    }
    if (!pieces.length) continue;
    blocks.push({ mark, kind: kind as FlowKind, item, chapter: kind === "t" ? item : chapter, first: pieces[0], last: pieces[pieces.length - 1] });
  }
  const pages = Array.from({ length: lastPage + 1 }, () => ({ contentTop: 0, contentBottom: pageHeightPt }));
  return { pages, blocks };
}
