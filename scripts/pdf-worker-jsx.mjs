// react/jsx-runtime для потока PDF (scripts/build-pdf-worker.mjs): CommonJS-модуль из node_modules релиза через require —
// в ESM его именованные экспорты (jsx, jsxs, Fragment) не видны.
import { createRequire } from "node:module";

const runtime = createRequire(import.meta.url)("react/jsx-runtime");
export const { jsx, jsxs, Fragment } = runtime;
