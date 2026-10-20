// Собирает поток вёрстки PDF (src/modules/production/infrastructure/pdf/worker.ts) в .next/standalone/pdf-worker.mjs —
// рядом с server.js, откуда его запускает pdf/pool.ts. Next такие файлы сам не собирает. Тяжёлые пакеты не
// вшиваются: берутся из node_modules релиза (их туда кладёт standalone-сборка — serverExternalPackages в next.config).
import { build } from "esbuild";
import { existsSync } from "node:fs";
import path from "node:path";

const out = path.join(".next", "standalone", "pdf-worker.mjs");
if (!existsSync(path.dirname(out))) {
  console.error("pdf-worker: нет .next/standalone — сначала next build");
  process.exit(1);
}

await build({
  entryPoints: ["src/modules/production/infrastructure/pdf/worker.ts"],
  outfile: out,
  bundle: true,
  platform: "node",
  // ESM: зависимости react-pdf в релизе лежат в ESM-варианте (их так трассирует standalone-сборка).
  format: "esm",
  target: "node22",
  jsx: "automatic",
  tsconfig: "tsconfig.json",
  // Как serverExternalPackages + react: react-pdf рендерит той же копией react, что лежит в node_modules.
  external: ["@react-pdf/renderer", "sharp", "pdf-lib", "hyphen", "pg", "archiver", "hunspell-asm", "react", "react-dom"],
  // «server-only» в воркере не нужен: он и так выполняется только на сервере.
  // react/jsx-runtime — CommonJS-модуль, и в ESM из него виден только default: берём его через require (pdf-worker-jsx.mjs).
  alias: { "server-only": "./scripts/empty-module.mjs", "react/jsx-runtime": "./scripts/pdf-worker-jsx.mjs" },
  // require внутри бандла — для CommonJS-кода, вшитого в ESM-файл.
  banner: { js: 'import { createRequire as __mbCreateRequire } from "node:module"; const require = __mbCreateRequire(import.meta.url);' },
  logLevel: "warning",
});
console.log(`pdf-worker: ${out}`);
