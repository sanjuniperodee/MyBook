import { describe, expect, it } from "vitest";
import { importGraph, type ImportEdge } from "../scripts/refactor/import-graph.mjs";

/**
 * Тяжёлые серверные модули не попадают в браузер редактора: каталог тем со всеми вопросами (lib/content/themes)
 * и сборка книги с текстами темы и словаря (book-content) стоили редактору ~22 KiB gz (регрессия V4: оценка
 * объёма собирала книгу buildBookContent, а editor-model тянул темы ради серверного editorModel).
 */
const { edges } = importGraph(".");
const runtime = new Map<string, string[]>();
for (const e of edges as ImportEdge[]) if (!e.typeOnly && !e.dynamic) runtime.set(e.from, [...(runtime.get(e.from) ?? []), e.to]);

function reach(entry: string) {
  const seen = new Set<string>();
  const queue = [entry];
  while (queue.length) {
    const f = queue.pop()!;
    if (seen.has(f)) continue;
    seen.add(f);
    queue.push(...(runtime.get(f) ?? []));
  }
  return seen;
}

describe("вес клиентских модулей редактора", () => {
  it.each(["src/components/editor/QuestionsEditor.tsx", "src/components/editor/preview/PagePreview.tsx"])("%s не тянет каталог тем и серверную сборку книги", (entry) => {
    const heavy = [...reach(entry)].filter((f) => f.startsWith("src/lib/content/themes") || f === "src/lib/book/book-content.ts" || f === "src/lib/book/editor-data.ts");
    expect(heavy).toEqual([]);
  });
});
