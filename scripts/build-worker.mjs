// Собирает процесс фоновой работы (src/worker/main.ts) в .next/standalone/worker.mjs — рядом с server.js, откуда его
// запускает PM2 (mybook-worker, deploy/ecosystem.config.cjs). Как и pdf-worker: тяжёлые и нативные пакеты
// (serverExternalPackages из next.config) не вшиваются, а берутся из node_modules релиза; остальное — в бандле,
// потому что standalone-сборка кладёт в node_modules только то, что Next оставил внешним.
import { build } from "esbuild";
import { existsSync } from "node:fs";
import path from "node:path";

const out = path.join(".next", "standalone", "worker.mjs");
if (!existsSync(path.dirname(out))) {
  console.error("worker: нет .next/standalone — сначала next build");
  process.exit(1);
}

await build({
  entryPoints: ["src/worker/main.ts"],
  outfile: out,
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  jsx: "automatic",
  tsconfig: "tsconfig.json",
  external: ["@react-pdf/renderer", "sharp", "pdf-lib", "hyphen", "pg", "archiver", "hunspell-asm", "heic-decode", "libheif-js", "react", "react-dom"],
  // next/* — заглушка: фон не работает в HTTP-запросе, а код Next вне своего сервера не загружается.
  alias: {
    "server-only": "./scripts/empty-module.mjs",
    "react/jsx-runtime": "./scripts/pdf-worker-jsx.mjs",
    "next/server": "./scripts/worker-next-shim.mjs",
    "next/headers": "./scripts/worker-next-shim.mjs",
    "next/navigation": "./scripts/worker-next-shim.mjs",
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
  logLevel: "warning",
});
console.log(`worker: ${out}`);
