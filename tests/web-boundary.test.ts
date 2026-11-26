import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { isPureModuleImport } from "./pure-imports";

/**
 * ADR 0013, шаг 2: веб не содержит кода бэкенда даже транзитивно. От входов веба (src/app, src/components, src/web,
 * src/proxy.ts, src/instrumentation*) по импортам значений (статическим и динамическим) нельзя дойти до src/server,
 * src/worker, apps, src/shared/infrastructure и модулей, кроме транзитивно чистых `domain`/`ui` (их и общий код —
 * src/shared, src/lib, src/i18n, src/config, @mybook/contracts — веб получает пакетами в шаге 3). Импорт типов можно:
 * в отдельном репозитории веба их даёт пакет объявлений бэкенда.
 *
 * Граница:
 * - веб: src/app, src/components, src/web (клиент API v1, прокси маршрутов, вход, права, CRM), src/proxy.ts, public/;
 * - бэкенд: apps/api, src/server, src/modules (кроме чистых domain/ui), src/worker, src/shared/infrastructure, drizzle,
 *   services, deploy;
 * - пакеты: @mybook/contracts; общий чистый код — src/shared (без infrastructure), src/lib, src/i18n, src/config и чистые
 *   domain/ui модулей.
 */
const ROOT = path.join(__dirname, "..");
const BACKEND = /^src\/(server|worker)\/|^apps\/|^src\/shared\/infrastructure\//;

const walk = (dir: string): string[] =>
  readdirSync(path.join(ROOT, dir), { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(path.join(dir, e.name)) : /\.(ts|tsx|mjs)$/.test(e.name) ? [path.join(dir, e.name)] : [],
  );

function resolve(spec: string, from: string): string | null {
  let base: string;
  if (spec.startsWith("@/")) base = path.join("src", spec.slice(2));
  else if (spec.startsWith(".")) base = path.join(path.dirname(from), spec);
  else return null;
  for (const c of [base, `${base}.ts`, `${base}.tsx`, `${base}.mjs`, path.join(base, "index.ts"), path.join(base, "index.tsx")]) {
    const abs = path.join(ROOT, c);
    if (existsSync(abs) && statSync(abs).isFile()) return c;
  }
  return null;
}

/** Импорты значений: import/export … from (без type), import(). */
function valueImports(source: string): string[] {
  const out: string[] = [];
  for (const m of source.matchAll(/^(?:import|export)\s+(type\s+)?(?:[^;]*?\s+from\s+)?["']([^"']+)["']/gm)) if (!m[1]) out.push(m[2]);
  for (const m of source.matchAll(/\bimport\(\s*["']([^"']+)["']\s*\)/g)) out.push(m[1]);
  return out;
}

function reach() {
  const entries = [...walk("src/app"), ...walk("src/components"), ...walk("src/web"), "src/proxy.ts", "src/instrumentation.ts", "src/instrumentation-node.ts"];
  const via = new Map<string, string | null>();
  const violations: string[] = [];
  const stack: [string, string | null][] = entries.map((e) => [e, null]);
  while (stack.length) {
    const [file, from] = stack.pop()!;
    if (via.has(file)) continue;
    via.set(file, from);
    for (const spec of valueImports(readFileSync(path.join(ROOT, file), "utf8"))) {
      if (spec.startsWith("@/modules/") && !isPureModuleImport(spec)) violations.push(`${file} → ${spec}`);
      const next = resolve(spec, file);
      if (!next) continue;
      if (BACKEND.test(next)) violations.push(`${file} → ${next}`);
      else if (!via.has(next)) stack.push([next, file]);
    }
  }
  return { files: [...via.keys()], violations };
}

describe("граница веба и бэкенда (ADR 0013, шаг 2)", () => {
  const { files, violations } = reach();

  it("от страниц, компонентов и src/web нельзя дойти до кода бэкенда", () => {
    expect(violations).toEqual([]);
  });

  it("модули — только чистые domain/ui; src/server в граф веба не попадает", () => {
    expect(files.filter((f) => f.startsWith("src/modules/") && !/\/(domain|ui)(\/|\.ts$)/.test(f))).toEqual([]);
    expect(files.filter((f) => f.startsWith("src/server/"))).toEqual([]);
  });

  it("у веба нет локальных веток: ни local: в вызовах API, ни мостов v1-local-bridge", () => {
    const web = files.filter((f) => /^src\/(app|components|web)\//.test(f));
    const offenders = web.filter((f) => {
      const src = readFileSync(path.join(ROOT, f), "utf8");
      return /v1-local-bridge|\blocal:\s*(async\s*)?\(/.test(src);
    });
    expect(offenders).toEqual([]);
  });
});
