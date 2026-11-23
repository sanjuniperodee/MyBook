// Собирает сверку отдачи файлов (scripts/files/parity.ts) одним файлом для сервера: node scripts/files/build-parity.mjs [выход]
// Код сайта (хранилище, ответ, подпись ссылок) вшивается тот же, что в релизе; pg и прочие внешние — из node_modules релиза.
import { build } from "esbuild";

const out = process.argv[2] || "/tmp/files-parity.mjs";
await build({
  entryPoints: ["scripts/files/parity.ts"],
  outfile: out,
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  tsconfig: "tsconfig.json",
  external: ["pg", "sharp"],
  alias: { "server-only": "./scripts/empty-module.mjs" },
  banner: { js: 'import { createRequire as __mbCreateRequire } from "node:module"; const require = __mbCreateRequire(import.meta.url);' },
  logLevel: "warning",
});
console.log(`files-parity: ${out}`);
