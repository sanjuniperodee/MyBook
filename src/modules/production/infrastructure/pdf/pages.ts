/**
 * Виды полос готового блока — для манифеста сборки (lib/book/book-build.ts). Каждая <Page> блока помечена видом
 * и главой (pageMark в interior/kit.ts); react-pdf сохраняет пометку в раскладке у каждой полосы, в том числе
 * у всех полос переносимой страницы (<Page wrap> — текст главы, оглавление).
 */
import type { BookBuildPage, BookPageKind } from "@/lib/book/book-build";

/** Пометка страницы react-pdf: { kind, chapterKey }. */
export const PAGE_MARK = "bookPage";

const KINDS: readonly BookPageKind[] = ["front", "toc", "opener", "text", "photo", "gallery", "end", "pad"];

interface PageNode {
  box?: unknown;
  props?: Record<string, unknown>;
}

/**
 * Полосы раскладки react-pdf по порядку — ровно те, что попали в PDF (react-pdf рисует полосу, только если у неё
 * есть box). Полоса без пометки — ошибка: значит, у новой страницы блока забыли pageMark, и манифест бы соврал.
 */
export function readPages(layout: unknown): BookBuildPage[] {
  const nodes = ((layout as { children?: PageNode[] } | undefined)?.children ?? []).filter((p) => p.box);
  return nodes.map((node, i) => {
    const mark = node.props?.[PAGE_MARK] as { kind?: unknown; chapterKey?: unknown } | undefined;
    const kind = mark?.kind as BookPageKind;
    if (!KINDS.includes(kind)) throw new Error(`PDF: page ${i + 1} has no pageMark`);
    return typeof mark?.chapterKey === "string" ? { n: i + 1, kind, chapterKey: mark.chapterKey } : { n: i + 1, kind };
  });
}
