// Общая сборка серверных процессов в один ESM-файл рядом с server.js релиза (.next/standalone): mybook-worker
// (build-worker.mjs) и mybook-api (build-api.mjs). Тяжёлые и нативные пакеты (serverExternalPackages из next.config) не
// вшиваются — берутся из node_modules релиза; остальное — в бандле, потому что standalone-сборка кладёт в node_modules
// только то, что Next оставил внешним.
import { build } from "esbuild";
import { copyFileSync, existsSync, lstatSync, mkdirSync } from "node:fs";
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
 * Внешние пакеты бандла (pg, sharp, @react-pdf…) — в node_modules релиза. Раньше их туда клал трассировщик Next, потому
 * что сайт сам импортировал БД; с ADR 0013 у веба кода бэкенда нет, и Next их больше не трассирует (26.11 mybook-api
 * упал на «Cannot find package 'pg'»). Тот же трассировщик (@vercel/nft из Next) проходит по бандлу и докладывает в
 * .next/standalone/node_modules недостающие файлы; затем каждый внешний пакет должен находиться из папки релиза.
 */
async function traceExternals(out) {
  const require = createRequire(import.meta.url);
  const { nodeFileTrace } = require("next/dist/compiled/@vercel/nft");
  const { fileList } = await nodeFileTrace([out], { base: process.cwd() });
  let copied = 0;
  for (const file of fileList) {
    if (!file.startsWith("node_modules/")) continue;
    const dest = path.join(".next", "standalone", file);
    // Только обычные файлы: ссылки (пакеты рабочей области) и папки трассировщик перечисляет отдельно от их файлов.
    if (existsSync(dest) || !lstatSync(file).isFile()) continue;
    mkdirSync(path.dirname(dest), { recursive: true });
    copyFileSync(file, dest);
    copied++;
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
  if (copied) console.log(`${path.basename(out)}: в node_modules релиза докопировано файлов: ${copied}`);
}
