/**
 * После next build: в скриптах для браузера (.next/static) нет того, что ломает Safari 16.0–16.3 (iPhone на iOS 16 —
 * встроенный браузер WhatsApp и Instagram). Такой Safari не разбирает весь чанк целиком — страница остаётся без скриптов:
 * текст набирается, на экране «Сохранено», а ответы на сервер не уходят (так было 02.11.2026).
 *  - lookbehind в регулярных выражениях «(?<=…)», «(?<!…)» — появился в Safari 16.4, транспилировать его нельзя;
 *  - статические блоки классов «static {…}» — тоже 16.4; их переписывает сборка по browserslist в package.json,
 *    проверка ловит, если browserslist потеряли.
 * Запуск: node scripts/check-browser-support.mjs [каталог сборки] — входит в npm run build, CI не выкатит такую сборку.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(process.argv[2] ?? ".next", "static");
const CHECKS = [
  { name: "lookbehind (?<= / (?<! в регулярном выражении", re: /\(\?<[=!]/g },
  { name: "статический блок класса static{…}", re: /[{};]static\{/g },
];

let files;
try {
  files = readdirSync(root, { recursive: true, encoding: "utf8" }).filter((f) => f.endsWith(".js"));
} catch {
  console.error(`check-browser-support: нет ${root} — сначала next build`);
  process.exit(1);
}

const problems = [];
for (const file of files) {
  const code = readFileSync(join(root, file), "utf8");
  for (const { name, re } of CHECKS)
    for (const m of code.matchAll(re)) problems.push(`${file}: ${name}\n    …${code.slice(Math.max(0, m.index - 80), m.index + 60).replace(/\s+/g, " ")}…`);
}

if (problems.length) {
  console.error(`check-browser-support: в скриптах для браузера есть то, что не понимает Safari до 16.4 (iPhone на iOS 16):\n  ${problems.join("\n  ")}`);
  console.error("Lookbehind перепишите проверкой знака перед совпадением в коде; код только для сервера не импортируйте из клиентских компонентов.");
  process.exit(1);
}
console.log(`check-browser-support: ${files.length} файлов в ${root} — без lookbehind и статических блоков классов`);
