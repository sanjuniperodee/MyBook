import { describe, expect, it } from "vitest";
import { coverArtSources } from "../next.config";
import { importGraph, type ImportEdge } from "../scripts/refactor/import-graph.mjs";

/** Файлы, которые рисунок обложек импортирует во время выполнения (без import type), от covers/index.ts — по графу src. */
function runtimeClosure(entry: string) {
  const next = new Map<string, string[]>();
  for (const e of importGraph(".").edges as ImportEdge[]) if (!e.typeOnly) next.set(e.from, [...(next.get(e.from) ?? []), e.to]);
  const seen = new Set<string>();
  const queue = [entry];
  while (queue.length) {
    const f = queue.pop()!;
    if (seen.has(f)) continue;
    seen.add(f);
    queue.push(...(next.get(f) ?? []));
  }
  return seen;
}

describe("COVER_ART_VERSION (B1)", () => {
  it("хеширует все файлы, от которых зависит рисунок обложек, — правка любого шаблона меняет версию", () => {
    const sources = new Set(coverArtSources());
    const missing = [...runtimeClosure("src/lib/book/covers/index.ts")].filter((f) => !sources.has(f));
    expect(missing).toEqual([]);
  });

  it("обложки с фото клиента входят в версию (раньше их правка не сбрасывала кэш SVG)", () => {
    expect(coverArtSources().filter((f) => f.startsWith("src/lib/book/covers/client-photo/")).length).toBeGreaterThan(20);
  });
});
