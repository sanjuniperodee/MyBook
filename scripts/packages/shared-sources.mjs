// Что входит в пакет @sanjuniperodee/mybook-shared исходниками (ADR 0013): общий чистый код бэкенда — src/lib, src/i18n,
// src/config, src/shared без infrastructure и слои domain/ui модулей, — и всё, до чего они доходят импортами значений.
// С 27.11 копии сайта в этом репозитории нет, поэтому состав пакета задают папки общего кода, а не обход от страниц веба:
// веб может взять из пакета любой чистый модуль. Тот же обход проверяет tests/web-boundary.test.ts: общий код не доходит
// до кода бэкенда (src/server, src/worker, apps, src/shared/infrastructure, application/infrastructure модулей).
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

/** Код бэкенда: в пакет не попадает и из общего кода недоступен. */
export const BACKEND = /^src\/(server|worker)\/|^apps\/|^src\/shared\/infrastructure\/|^src\/modules\/[^/]+\/(application|infrastructure)\//;

const walk = (root, dir) =>
  existsSync(path.join(root, dir))
    ? readdirSync(path.join(root, dir), { withFileTypes: true }).flatMap((e) =>
        e.isDirectory() ? walk(root, path.join(dir, e.name)) : /\.(ts|tsx|mjs)$/.test(e.name) && !e.name.endsWith(".d.ts") ? [path.join(dir, e.name)] : [],
      )
    : [];

/** Корни общего кода (пути от корня репозитория). */
export function sharedRoots(root = process.cwd()) {
  const modules = readdirSync(path.join(root, "src/modules"), { withFileTypes: true }).filter((e) => e.isDirectory());
  return [
    ...walk(root, "src/lib"),
    ...walk(root, "src/i18n"),
    ...walk(root, "src/config"),
    ...walk(root, "src/shared").filter((f) => !f.startsWith("src/shared/infrastructure/")),
    ...modules.flatMap((m) => [...walk(root, `src/modules/${m.name}/domain`), ...walk(root, `src/modules/${m.name}/ui`)]),
  ];
}

function resolve(root, spec, from) {
  let base;
  if (spec.startsWith("@/")) base = path.join("src", spec.slice(2));
  else if (spec.startsWith(".")) base = path.join(path.dirname(from), spec);
  else return null;
  for (const c of [base, `${base}.ts`, `${base}.tsx`, `${base}.mjs`, path.join(base, "index.ts"), path.join(base, "index.tsx")]) {
    const abs = path.join(root, c);
    if (existsSync(abs) && statSync(abs).isFile()) return c;
  }
  return null;
}

/** Импорты значений: import/export … from (без type), import(). Импорт типов можно — их даёт пакет объявлений. */
export function valueImports(source) {
  return [
    ...[...source.matchAll(/^(?:import|export)\s+(type\s+)?(?:[^;]*?\s+from\s+)?["']([^"']+)["']/gm)].filter((m) => !m[1]).map((m) => m[2]),
    ...[...source.matchAll(/\bimport\(\s*["']([^"']+)["']\s*\)/g)].map((m) => m[1]),
  ];
}

/**
 * Исходники пакета: корни общего кода и всё, до чего они доходят импортами значений. violations — «файл → код бэкенда»
 * (пакет с ними не собирается).
 */
export function sharedSources(root = process.cwd()) {
  const seen = new Set();
  const violations = [];
  const stack = sharedRoots(root);
  while (stack.length) {
    const file = stack.pop();
    if (seen.has(file)) continue;
    seen.add(file);
    for (const spec of valueImports(readFileSync(path.join(root, file), "utf8"))) {
      const next = resolve(root, spec, file);
      if (!next) continue;
      if (BACKEND.test(next)) violations.push(`${file} → ${next}`);
      else if (!seen.has(next)) stack.push(next);
    }
  }
  return { sources: [...seen].sort(), violations };
}
