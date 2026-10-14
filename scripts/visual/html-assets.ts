import { readFile } from "node:fs/promises";
import { registerHooks } from "node:module";
import path from "node:path";
import tailwind from "@tailwindcss/postcss";
import { build } from "esbuild";
import postcss from "postcss";
import type { StandView } from "./html-data";
import { ROOT } from "./shared";

/**
 * Ресурсы стенда html-snapshot — как их собирает сайт: JS — esbuild из html-stand.tsx (пути @/ из tsconfig,
 * next/link и next/navigation — заглушка), CSS — src/app/globals.css через Tailwind (PostCSS, как в
 * postcss.config.mjs), шрифты — @font-face и CSS-переменные из src/app/fonts.ts, как их делает next/font/local.
 */

const HERE = path.join(ROOT, "scripts/visual");

export interface StandAssets {
  js: Buffer;
  css: string;
  /** Имя файла шрифта в адресе /fonts/<имя> → путь на диске. */
  fonts: Map<string, string>;
}

/** Параметры localFont() из src/app/fonts.ts. */
interface LocalFont {
  src: { path: string; weight?: string; style?: string }[];
  variable: string;
  display?: string;
}

/**
 * next/font/local подменяется функцией, которая возвращает свои параметры: по ним пишутся @font-face, как это
 * делает загрузчик Next (семейство — имя константы, файлы — WOFF2-подмножества). Запасное семейство «… Fallback»
 * с подогнанными метриками не нужно: стенд загружает все начертания до первой раскладки.
 */
async function siteFonts() {
  const stub = `data:text/javascript,${encodeURIComponent("export default (options) => options;")}`;
  registerHooks({ resolve: (specifier, context, next) => (specifier === "next/font/local" ? { url: stub, format: "module", shortCircuit: true } : next(specifier, context)) });
  const exported: Record<string, unknown> = await import("@/app/fonts");
  const fonts = Object.entries(exported).filter((e): e is [string, LocalFont] => typeof e[1] === "object" && e[1] !== null && "src" in e[1]);
  const files = new Map<string, string>();
  const faces = fonts.flatMap(([family, f]) =>
    f.src.map((s) => {
      const file = path.resolve(ROOT, "src/app", s.path);
      files.set(path.basename(file), file);
      const weight = s.weight ? `font-weight:${s.weight};` : "";
      return `@font-face{font-family:${family};src:url(/fonts/${path.basename(file)}) format("woff2");font-display:${f.display ?? "swap"};${weight}font-style:${s.style ?? "normal"}}`;
    }),
  );
  const vars = `:root{${fonts.map(([family, f]) => `${f.variable}:${family}`).join(";")}}`;
  return { css: [...faces, vars].join("\n"), files };
}

async function siteCss() {
  const from = path.join(ROOT, "src/app/globals.css");
  const result = await postcss([tailwind({ base: ROOT })]).process(await readFile(from, "utf8"), { from });
  return result.css;
}

async function standJs() {
  const result = await build({
    entryPoints: [path.join(HERE, "html-stand.tsx")],
    bundle: true,
    write: false,
    format: "esm",
    platform: "browser",
    target: "es2022",
    jsx: "automatic",
    tsconfig: path.join(ROOT, "tsconfig.json"),
    // Как в next.config: COVER_ART_VERSION подставляется в адреса фонов обложек при сборке.
    define: { "process.env.NODE_ENV": JSON.stringify("production"), "process.env.COVER_ART_VERSION": JSON.stringify("stand") },
    logLevel: "silent",
    plugins: [{ name: "next-stub", setup: (b) => b.onResolve({ filter: /^next\/(link|navigation)$/ }, () => ({ path: path.join(HERE, "next-stub.tsx") })) }],
  });
  return Buffer.from(result.outputFiles[0].contents);
}

export async function buildStandAssets(): Promise<StandAssets> {
  const [fonts, css, js] = await Promise.all([siteFonts(), siteCss(), standJs()]);
  return { js, css: `${css}\n${fonts.css}`, fonts: fonts.files };
}

/** Страница стенда: данные вида — в window.__stand (JSON без «<», чтобы не закрыть script). */
export function standHtml(view: StandView) {
  const data = JSON.stringify(view).replace(/</g, "\\u003c");
  return `<!doctype html><html lang="${view.locale}"><head><meta charset="utf-8"><link rel="stylesheet" href="/stand.css"></head><body><div id="stand"></div><script>window.__stand=${data}</script><script type="module" src="/stand.js"></script></body></html>`;
}
