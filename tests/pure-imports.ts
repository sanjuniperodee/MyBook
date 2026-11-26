import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

/**
 * ADR 0012, A5 «веб без БД»: страницы и компоненты могут брать из модулей только чистые части — `domain` и `ui`
 * (подписи, правила, расчёты; так и велит слой представления в eslint.config), если они транзитивно не тянут БД,
 * сервер и инфраструктуру. Здесь — проверка этого: импорт `@/modules/<имя>/domain|ui[/…]` чист, если ни один файл,
 * до которого он доходит импортами значений, не импортирует запрещённое.
 */
const ROOT = path.join(__dirname, "..");
const PURE_ENTRY = /^@\/modules\/[\w-]+\/(domain|ui)(\/[\w./-]+)?$/;
const FORBIDDEN = /^(@\/server\/|@\/shared\/infrastructure|@\/app\/|@\/components\/|pg$|drizzle-orm|server-only$|next\/(headers|cache|server|navigation)$)|\/(infrastructure|application)(\/|$)/;

function resolve(spec: string, from: string): string | null {
  let base: string;
  if (spec.startsWith("@/")) base = path.join(ROOT, "src", spec.slice(2));
  else if (spec.startsWith(".")) base = path.join(path.dirname(from), spec);
  else return null;
  for (const c of [base, `${base}.ts`, `${base}.tsx`, path.join(base, "index.ts"), path.join(base, "index.tsx")]) {
    if (existsSync(c) && /\.tsx?$/.test(c)) return c;
  }
  return null;
}

/** Импорты значений файла (import/export … from, без `import type` / `export type`). */
function valueImports(source: string): string[] {
  const out: string[] = [];
  for (const m of source.matchAll(/^(?:import|export)\s+(type\s+)?(?:[^;]*?\s+from\s+)?["']([^"']+)["']/gm)) if (!m[1]) out.push(m[2]);
  for (const m of source.matchAll(/\bimport\(\s*["']([^"']+)["']\s*\)/g)) out.push(m[1]);
  return out;
}

const cache = new Map<string, string | null>();

/** null — чисто; иначе цепочка до запрещённого импорта. */
function impurity(file: string, seen = new Set<string>()): string | null {
  if (cache.has(file)) return cache.get(file)!;
  if (seen.has(file)) return null;
  seen.add(file);
  let result: string | null = null;
  for (const spec of valueImports(readFileSync(file, "utf8"))) {
    if (FORBIDDEN.test(spec)) {
      result = `${path.relative(ROOT, file)} → ${spec}`;
      break;
    }
    const next = resolve(spec, file);
    if (!next) continue;
    const deeper = impurity(next, seen);
    if (deeper) {
      result = `${path.relative(ROOT, file)} → ${deeper}`;
      break;
    }
  }
  cache.set(file, result);
  return result;
}

/** Импорт `@/modules/<имя>/domain|ui[/…]`, который транзитивно не доходит до БД, сервера и инфраструктуры. */
export function isPureModuleImport(spec: string): boolean {
  if (!PURE_ENTRY.test(spec)) return false;
  const file = resolve(spec, ROOT);
  return !!file && impurity(file) === null;
}

/** Почему импорт не чистый (для сообщений тестов). */
export function whyImpure(spec: string): string | null {
  const file = resolve(spec, ROOT);
  if (!PURE_ENTRY.test(spec) || !file) return `${spec}: не domain/ui модуля`;
  return impurity(file);
}
