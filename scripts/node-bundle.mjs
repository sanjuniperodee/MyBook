// Общая сборка серверных процессов в один ESM-файл рядом с server.js релиза (.next/standalone): mybook-worker
// (build-worker.mjs) и mybook-api (build-api.mjs). Тяжёлые и нативные пакеты (serverExternalPackages из next.config) не
// вшиваются — берутся из node_modules релиза; остальное — в бандле, потому что standalone-сборка кладёт в node_modules
// только то, что Next оставил внешним.
import { build } from "esbuild";
import { cpSync, existsSync, readdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { asciiBundle } from "./ascii-bundle.mjs";

export const EXTERNAL = ["@react-pdf/renderer", "@react-pdf/layout", "sharp", "pdf-lib", "hyphen", "pg", "archiver", "hunspell-asm", "heic-decode", "libheif-js", "react", "react-dom"];

/** Собрать entry в .next/standalone/<name>.mjs; nextShim — чем заменить next/server, next/headers, next/navigation. */
export async function bundleNodeProcess({ name, entry, nextShim }) {
  const out = path.join(".next", "standalone", `${name}.mjs`);
  if (!existsSync(path.dirname(out))) {
    console.error(`${name}: нет .next/standalone — сначала next build`);
    process.exit(1);
  }
  await build({
    entryPoints: [entry],
    outfile: out,
    bundle: true,
    platform: "node",
    format: "esm",
    target: "node22",
    jsx: "automatic",
    tsconfig: "tsconfig.json",
    external: EXTERNAL,
    alias: {
      "server-only": "./scripts/empty-module.mjs",
      "react/jsx-runtime": "./scripts/pdf-worker-jsx.mjs",
      "next/server": nextShim,
      "next/headers": nextShim,
      "next/navigation": nextShim,
      "next/cache": "./scripts/next-cache-shim.mjs",
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
 * Внешние пакеты бандла (pg, sharp, @react-pdf…) — в node_modules релиза вместе со своими зависимостями. Раньше их туда
 * клал трассировщик Next, потому что сайт сам импортировал БД; с ADR 0013 у веба кода бэкенда нет, и Next их больше не
 * трассирует (26.11 mybook-api упал на «Cannot find package 'pg'»). Пакет копируется папкой (с вложенными node_modules),
 * файлы, которые уже положил Next, не трогаются; затем каждый внешний пакет должен находиться из папки релиза.
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

async function traceExternals(out) {
  const seen = new Set();
  const stack = [...EXTERNAL];
  while (stack.length) {
    const name = stack.pop();
    if (seen.has(name)) continue;
    seen.add(name);
    const dir = path.join("node_modules", name);
    if (!existsSync(path.join(dir, "package.json"))) continue;
    cpSync(dir, path.join(".next", "standalone", "node_modules", name), { recursive: true, force: false, dereference: true });
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
