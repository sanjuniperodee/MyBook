// Общая сборка серверных процессов в один ESM-файл в папке релиза (build/, MYBOOK_BUILD_DIR): mybook-worker
// (build-worker.mjs), mybook-backend и воркер на Nest (build-backend*.mjs), вёрстка PDF (build-pdf-worker.mjs). Next в сборке
// бэкенда не участвует (27.11: сайт — в mybook-web). Тяжёлые и нативные пакеты (EXTERNAL) не вшиваются — traceExternals
// копирует их с зависимостями в <папка>/node_modules; остальное — в бандле.
import { build } from "esbuild";
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { asciiBundle } from "./ascii-bundle.mjs";
import { coverArtVersion } from "./cover-art-version.mjs";

/** Next в процессах бэкенда не участвует: импорт next/* (в том числе через общий код веба) роняет сборку. */
const noNext = {
  name: "no-next",
  setup(b) {
    b.onResolve({ filter: /^next(\/|$)/ }, (args) => ({
      errors: [{ text: `next в бэкенде не нужен: ${args.path} из ${path.relative(process.cwd(), args.importer)} — берите src/shared/infrastructure/http` }],
    }));
  },
};

/** Папка релиза: бандлы, node_modules внешних пакетов, bin/mybook-files (deploy/pack-release.sh добавляет assets и drizzle). */
export const BUILD_DIR = process.env.MYBOOK_BUILD_DIR || "build";

export const EXTERNAL = ["@react-pdf/renderer", "@react-pdf/layout", "sharp", "pdf-lib", "hyphen", "pg", "archiver", "hunspell-asm", "heic-decode", "libheif-js", "react", "react-dom"];

/**
 * Собрать entry в <BUILD_DIR>/<name>.mjs. Импорт next/* — ошибка сборки: данные запроса бэкенда — в
 * src/shared/infrastructure/http (docs/refactor/legacy-removal-plan.md, этап 1). tsconfig — свой у процесса (бэкенду на Nest нужны experimentalDecorators); optional — пакеты, которые процесс грузит
 * только при наличии (необязательные зависимости Nest), — не в бандл и не в релиз.
 */
export async function bundleNodeProcess({ name, entry, tsconfig = "tsconfig.json", optional = [] }) {
  const out = path.join(BUILD_DIR, `${name}.mjs`);
  mkdirSync(BUILD_DIR, { recursive: true });
  await build({
    entryPoints: [entry],
    outfile: out,
    bundle: true,
    platform: "node",
    format: "esm",
    target: "node22",
    jsx: "automatic",
    tsconfig,
    external: [...EXTERNAL, ...optional],
    plugins: [noNext],
    // Версия рисунков обложек — в бандл, как раньше её вшивал next.config сайта (без неё кэши обложек не сбрасывались бы).
    define: { "process.env.COVER_ART_VERSION": JSON.stringify(coverArtVersion()) },
    alias: {
      "server-only": "./scripts/empty-module.mjs",
      "react/jsx-runtime": "./scripts/pdf-worker-jsx.mjs",
    },
    // require, __filename и __dirname — для CommonJS-пакетов, вшитых в ESM-файл.
    banner: {
      js: [
        'import { createRequire as __mbCreateRequire } from "node:module";',
        'import { fileURLToPath as __mbFileURLToPath } from "node:url";',
        'import { dirname as __mbDirname } from "node:path";',
        "const require = __mbCreateRequire(import.meta.url);",
        "const __filename = __mbFileURLToPath(import.meta.url);",
        "const __dirname = __mbDirname(__filename);",
      ].join(" "),
    },
    // Без пробелов и комментариев (имена функций те же — в журналах ошибок видно, где упало): исходник бандла V8 держит
    // в куче строкой, а русские комментарии делали её двухбайтной — ~30 МБ на 15 МБ файла (замер G4, perf.md).
    // Откат — MYBOOK_WORKER_MINIFY=off; экранирование не-ASCII (scripts/ascii-bundle.mjs) — MYBOOK_ASCII_BUNDLE=off.
    minifyWhitespace: process.env.MYBOOK_WORKER_MINIFY !== "off",
    logLevel: "warning",
  });
  asciiBundle(out);
  await traceExternals(out);
  console.log(`${name}: ${out}`);
}

/**
 * Внешние пакеты бандла (pg, sharp, @react-pdf…) — в node_modules релиза вместе со своими зависимостями (26.11 mybook-api
 * упал на «Cannot find package 'pg'», когда их перестал класть трассировщик Next). Пакет копируется папкой (с вложенными
 * node_modules), уже скопированные файлы не трогаются; затем каждый внешний пакет должен находиться из папки релиза.
 */
/** Папки пакетов во вложенных node_modules (на любой глубине). */
function nestedPackages(dir) {
  const nm = path.join(dir, "node_modules");
  if (!existsSync(nm)) return [];
  const out = [];
  for (const e of readdirSync(nm, { withFileTypes: true })) {
    if (!e.isDirectory() || e.name.startsWith(".")) continue;
    const dirs = e.name.startsWith("@") ? readdirSync(path.join(nm, e.name)).map((n) => path.join(nm, e.name, n)) : [path.join(nm, e.name)];
    for (const d of dirs) if (existsSync(path.join(d, "package.json"))) out.push(d, ...nestedPackages(d));
  }
  return out;
}

export async function traceExternals(out) {
  const seen = new Set();
  const stack = [...EXTERNAL];
  while (stack.length) {
    const name = stack.pop();
    if (seen.has(name)) continue;
    seen.add(name);
    const dir = path.join("node_modules", name);
    if (!existsSync(path.join(dir, "package.json"))) continue;
    cpSync(dir, path.join(BUILD_DIR, "node_modules", name), { recursive: true, force: false, dereference: true });
    // Зависимости самого пакета и пакетов во вложенных node_modules: им тоже нужны поднятые наверх соседи.
    for (const pkgDir of [dir, ...nestedPackages(dir)]) {
      const pkg = JSON.parse(readFileSync(path.join(pkgDir, "package.json"), "utf8"));
      for (const dep of Object.keys({ ...pkg.dependencies, ...pkg.optionalDependencies })) stack.push(dep);
    }
  }
  const fromRelease = createRequire(path.resolve(out));
  const missing = EXTERNAL.filter((pkg) => {
    try {
      fromRelease.resolve(pkg);
      return false;
    } catch {
      return true;
    }
  });
  if (missing.length) {
    console.error(`${path.basename(out)}: внешние пакеты не находятся из релиза: ${missing.join(", ")}`);
    process.exit(1);
  }
}
