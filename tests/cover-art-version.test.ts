import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { coverArtSources } from "../next.config";

/** Файлы, которые рисунок обложек импортирует во время выполнения (import type не считается), от covers/index.ts. */
function runtimeClosure(entry: string) {
  const seen = new Set<string>();
  const queue = [entry];
  const resolve = (from: string, spec: string) => {
    if (!spec.startsWith(".")) return null;
    const p = path.normalize(path.join(path.dirname(from), spec));
    return [`${p}.ts`, `${p}.tsx`, `${p}/index.ts`].find(existsSync) ?? null;
  };
  while (queue.length) {
    const f = queue.pop()!;
    if (seen.has(f)) continue;
    seen.add(f);
    for (const m of readFileSync(f, "utf8").matchAll(/^import\s+(type\s+)?[^;]*?from\s+"([^"]+)";/gms)) {
      const r = m[1] ? null : resolve(f, m[2]);
      if (r) queue.push(r);
    }
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
