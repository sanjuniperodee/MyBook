import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * ADR 0012, A5 «веб без БД»: страницы и компоненты сайта (src/app без src/app/api, src/components) не должны ходить в
 * базу и модули напрямую — только через API v1. Пока переезд не закончен, такие файлы перечислены в списке
 * tests/architecture-web-db-allowlist.json; он только сокращается: новый файл с доступом к БД роняет тест, а файл,
 * который больше не ходит в БД, надо из списка убрать. Пересобрать список: UPDATE_WEB_DB_ALLOWLIST=1 npx vitest run
 * tests/architecture-web-db.test.ts (только если он стал короче).
 */
const ROOTS = ["src/app", "src/components"];
const SKIP = new Set(["src/app/api"]);
const FORBIDDEN = /^(@\/server\/container|@\/modules\/|@\/shared\/infrastructure|pg$|drizzle-orm)/;
const LIST = path.join(__dirname, "architecture-web-db-allowlist.json");

function files(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return SKIP.has(p) ? [] : files(p);
    return /\.(ts|tsx)$/.test(e.name) ? [p] : [];
  });
}

/** Импорты значений (не `import type`) из базы и модулей. */
export function dbImports(source: string): string[] {
  const found: string[] = [];
  for (const m of source.matchAll(/^import\s+(type\s+)?[^;]*?\s+from\s+"([^"]+)";?/gm)) if (!m[1] && FORBIDDEN.test(m[2])) found.push(m[2]);
  return found;
}

describe("веб без БД (ADR 0012, A5)", () => {
  const current = ROOTS.flatMap(files)
    .filter((f) => dbImports(readFileSync(f, "utf8")).length)
    .sort();
  if (process.env.UPDATE_WEB_DB_ALLOWLIST === "1") writeFileSync(LIST, `${JSON.stringify(current, null, 2)}\n`);
  const allowed: string[] = JSON.parse(readFileSync(LIST, "utf8"));

  it("новые страницы и компоненты не ходят в БД и модули напрямую — только через API v1", () => {
    expect(current.filter((f) => !allowed.includes(f))).toEqual([]);
  });

  it("список исключений только сокращается: переехавший на API файл убран из списка", () => {
    expect(allowed.filter((f) => !current.includes(f))).toEqual([]);
  });

  it("импорт типов не считается", () => {
    expect(dbImports('import type { BookRow } from "@/modules/authoring";\nimport { x } from "@/lib/y";')).toEqual([]);
    expect(dbImports('import { container } from "@/server/container";')).toEqual(["@/server/container"]);
  });
});
