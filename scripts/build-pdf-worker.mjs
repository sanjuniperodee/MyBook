// Собирает процесс вёрстки PDF (src/modules/production/infrastructure/pdf/worker.ts) в build/pdf-worker.mjs — рядом с
// backend.mjs и воркером, откуда его запускает pdf/pool.ts (child_process.fork). Тяжёлые пакеты не вшиваются: берутся из
// node_modules релиза (их туда копирует traceExternals, scripts/node-bundle.mjs).
import { build } from "esbuild";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { asciiBundle } from "./ascii-bundle.mjs";
import { coverArtVersion } from "./cover-art-version.mjs";
import { BUILD_DIR, traceExternals } from "./node-bundle.mjs";

const out = path.join(BUILD_DIR, "pdf-worker.mjs");
mkdirSync(BUILD_DIR, { recursive: true });

await build({
  entryPoints: ["src/modules/production/infrastructure/pdf/worker.ts"],
  outfile: out,
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  jsx: "automatic",
  tsconfig: "tsconfig.json",
  // Как serverExternalPackages + react: react-pdf рендерит той же копией react, что лежит в node_modules.
  define: { "process.env.COVER_ART_VERSION": JSON.stringify(coverArtVersion()) },
  external: ["@react-pdf/renderer", "@react-pdf/layout", "sharp", "pdf-lib", "hyphen", "pg", "archiver", "hunspell-asm", "react", "react-dom"],
  // «server-only» в воркере не нужен: он и так выполняется только на сервере.
  // react/jsx-runtime — CommonJS-модуль, и в ESM из него виден только default: берём его через require (pdf-worker-jsx.mjs).
  alias: { "server-only": "./scripts/empty-module.mjs", "react/jsx-runtime": "./scripts/pdf-worker-jsx.mjs" },
  // require внутри бандла — для CommonJS-кода, вшитого в ESM-файл.
  banner: { js: 'import { createRequire as __mbCreateRequire } from "node:module"; const require = __mbCreateRequire(import.meta.url);' },
  // Без пробелов и комментариев, исходник — чистый ASCII (как mybook-worker, scripts/build-worker.mjs): V8 держит его
  // в куче однобайтной строкой. Откат — MYBOOK_WORKER_MINIFY=off.
  minifyWhitespace: process.env.MYBOOK_WORKER_MINIFY !== "off",
  logLevel: "warning",
});
asciiBundle(out);
await traceExternals(out);
console.log(`pdf-worker: ${out}`);
