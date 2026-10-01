import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = path.join(dir, f);
    return statSync(p).isDirectory() ? files(p) : /\.tsx?$/.test(f) ? [p] : [];
  });
}

describe("коррелированные подзапросы", () => {
  // Drizzle пишет ${table.column} без имени таблицы, и в подзапросе ссылка «перехватывается» его таблицей.
  it("не ссылаются на внешнюю таблицу через ${table.column}", () => {
    const bad: string[] = [];
    for (const f of files(path.join(__dirname, "..", "src"))) {
      const src = readFileSync(f, "utf8");
      // Каждый sql`…` с подзапросом: внешние ключевые колонки — только через явные ссылки из shared/infrastructure/db/refs.
      for (const t of src.matchAll(/sql(?:<[^>]*>)?`([^`]*)`/g)) {
        if (!/\(\s*select|exists\s*\(/i.test(t[1])) continue;
        for (const m of t[1].matchAll(/\$\{(\w+)\.(id|clientId|userId|bookId)\}/g)) bad.push(`${path.relative(process.cwd(), f)}: ${m[0]} в «${t[1].slice(0, 60)}…»`);
      }
    }
    expect(bad).toEqual([]);
  });
});
