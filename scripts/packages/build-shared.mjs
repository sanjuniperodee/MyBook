// Пакет @sanjuniperodee/mybook-shared для веба (ADR 0013, шаг 3): node scripts/packages/build-shared.mjs <версия> [папка]
//
// Веб (mybook-web) не содержит кода бэкенда, но пользуется общим чистым кодом и контрактом API v1. Пакет повторяет
// раскладку этого репозитория, чтобы импорты веба (`@/lib/…`, `@/i18n/…`, `@mybook/contracts`) не менялись:
//   src/**                  — исходники TS общего чистого кода: src/lib, src/i18n, src/config, src/shared без infrastructure,
//                             domain/ui модулей и всё, до чего они доходят импортами значений (scripts/packages/shared-sources.mjs);
//   src/** (*.d.ts)         — только объявления типов остального бэкенда: веб импортирует из него лишь типы
//                             (ответы сборщиков CRM, строки БД), кода бэкенда в пакете нет;
//   packages/contracts/src  — контракт API v1 (исходники).
// Чистоту общего кода проверяет tests/web-boundary.test.ts тем же обходом.
import { execFileSync } from "node:child_process";
import { cpSync, mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { sharedSources } from "./shared-sources.mjs";

const ROOT = process.cwd();
const version = process.argv[2];
const OUT = path.resolve(process.argv[3] ?? "dist/mybook-shared");
if (!version) {
  console.error("usage: node scripts/packages/build-shared.mjs <version> [outDir]");
  process.exit(1);
}

const walk = (d) => readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : /\.(ts|tsx|mjs)$/.test(e.name) ? [path.join(d, e.name)] : []));
const { sources, violations } = sharedSources(ROOT);
if (violations.length) {
  console.error(`общий код доходит до кода бэкенда — пакет не собирается:\n${violations.join("\n")}`);
  process.exit(1);
}

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

// Объявления типов всего src (кроме вида книги) и контракта.
const dts = path.join(OUT, ".dts");
const tsconfig = path.join(OUT, "tsconfig.dts.json");
writeFileSync(
  tsconfig,
  JSON.stringify({
    extends: path.join(ROOT, "tsconfig.json"),
    compilerOptions: { noEmit: false, declaration: true, emitDeclarationOnly: true, outDir: dts, rootDir: ROOT, incremental: false, skipLibCheck: true },
    include: [path.join(ROOT, "src/**/*.ts"), path.join(ROOT, "src/**/*.tsx"), path.join(ROOT, "packages/contracts/src/**/*.ts")],
    // Вид книги для сверки превью с PDF (src/book-view) — копия компонентов веба, вебу из пакета не нужен.
    exclude: [path.join(ROOT, "src", "book-view", "**")],
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
