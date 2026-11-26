// Пакет @sanjuniperodee/mybook-shared для веба (ADR 0013, шаг 3): node scripts/packages/build-shared.mjs <версия> [папка]
//
// Веб (mybook-web) не содержит кода бэкенда, но пользуется общим чистым кодом и контрактом API v1. Пакет повторяет
// раскладку этого репозитория, чтобы импорты веба (`@/lib/…`, `@/i18n/…`, `@mybook/contracts`) не менялись:
//   src/**                  — исходники TS всего, до чего страницы, компоненты и src/web доходят импортами значений
//                             (src/lib, src/i18n, src/config, src/shared без infrastructure, чистые domain/ui модулей);
//   src/** (*.d.ts)         — только объявления типов остального бэкенда: веб импортирует из него лишь типы
//                             (ответы сборщиков CRM, строки БД), кода бэкенда в пакете нет;
//   packages/contracts/src  — контракт API v1 (исходники).
// Что из этого — исходник, решает тот же обход, что tests/web-boundary.test.ts.
import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const version = process.argv[2];
const OUT = path.resolve(process.argv[3] ?? "dist/mybook-shared");
if (!version) {
  console.error("usage: node scripts/packages/build-shared.mjs <version> [outDir]");
  process.exit(1);
}

const walk = (d) => readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : /\.(ts|tsx|mjs)$/.test(e.name) ? [path.join(d, e.name)] : []));
const WEB = /^src\/(app|components|web|hooks)\/|^src\/(proxy|instrumentation|instrumentation-node)\.ts$/;
const entries = [...walk("src/app"), ...walk("src/components"), ...walk("src/web"), ...walk("src/hooks"), "src/proxy.ts", "src/instrumentation.ts", "src/instrumentation-node.ts"];

function resolve(spec, from) {
  let base;
  if (spec.startsWith("@/")) base = path.join("src", spec.slice(2));
  else if (spec.startsWith(".")) base = path.join(path.dirname(from), spec);
  else return null;
  for (const c of [base, `${base}.ts`, `${base}.tsx`, `${base}.mjs`, path.join(base, "index.ts"), path.join(base, "index.tsx")]) if (existsSync(c) && statSync(c).isFile()) return c;
  return null;
}
const valueImports = (src) => [
  ...[...src.matchAll(/^(?:import|export)\s+(type\s+)?(?:[^;]*?\s+from\s+)?["']([^"']+)["']/gm)].filter((m) => !m[1]).map((m) => m[2]),
  ...[...src.matchAll(/\bimport\(\s*["']([^"']+)["']\s*\)/g)].map((m) => m[1]),
];

const seen = new Set();
const stack = [...entries];
while (stack.length) {
  const f = stack.pop();
  if (seen.has(f)) continue;
  seen.add(f);
  for (const s of valueImports(readFileSync(f, "utf8"))) {
    const r = resolve(s, f);
    if (r && !seen.has(r)) stack.push(r);
  }
}
const sources = [...seen].filter((f) => !WEB.test(f)).sort();
const backend = sources.filter((f) => /^src\/(server|worker)\/|^apps\/|^src\/shared\/infrastructure\//.test(f));
if (backend.length) {
  console.error(`веб доходит до кода бэкенда — пакет не собирается:\n${backend.join("\n")}`);
  process.exit(1);
}

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

// Объявления типов всего src (кроме веба) и контракта.
const dts = path.join(OUT, ".dts");
const tsconfig = path.join(OUT, "tsconfig.dts.json");
writeFileSync(
  tsconfig,
  JSON.stringify({
    extends: path.join(ROOT, "tsconfig.json"),
    compilerOptions: { noEmit: false, declaration: true, emitDeclarationOnly: true, outDir: dts, rootDir: ROOT, incremental: false, skipLibCheck: true },
    include: [path.join(ROOT, "src/**/*.ts"), path.join(ROOT, "src/**/*.tsx"), path.join(ROOT, "packages/contracts/src/**/*.ts")],
    exclude: ["app", "components", "web", "hooks"].map((d) => path.join(ROOT, "src", d, "**")),
  }),
);
execFileSync(process.execPath, [path.join(ROOT, "node_modules/typescript/bin/tsc"), "-p", tsconfig], { stdio: "inherit" });

const sourceSet = new Set(sources);
for (const f of walk(path.join(dts, "src")).map((f) => path.relative(dts, f))) {
  const src = f.replace(/\.d\.ts$/, ".ts");
  const srcx = f.replace(/\.d\.ts$/, ".tsx");
  if (sourceSet.has(src) || sourceSet.has(srcx)) continue;
  mkdirSync(path.dirname(path.join(OUT, f)), { recursive: true });
  cpSync(path.join(dts, f), path.join(OUT, f));
}
for (const f of sources) {
  mkdirSync(path.dirname(path.join(OUT, f)), { recursive: true });
  cpSync(f, path.join(OUT, f));
}
cpSync("src/types", path.join(OUT, "src/types"), { recursive: true });
cpSync("packages/contracts/src", path.join(OUT, "packages/contracts/src"), { recursive: true });
rmSync(dts, { recursive: true, force: true });
rmSync(tsconfig);

writeFileSync(
  path.join(OUT, "package.json"),
  `${JSON.stringify(
    {
      name: "@sanjuniperodee/mybook-shared",
      version,
      description: "MyBooks: контракт API v1 и общий чистый код для веба (ADR 0013). Типы бэкенда — только объявления.",
      license: "UNLICENSED",
      repository: { type: "git", url: "https://github.com/sanjuniperodee/MyBook" },
      publishConfig: { registry: "https://npm.pkg.github.com" },
      files: ["src", "packages"],
    },
    null,
    2,
  )}\n`,
);
console.log(`mybook-shared ${version}: исходников ${sources.length}, папка ${path.relative(ROOT, OUT)}`);
