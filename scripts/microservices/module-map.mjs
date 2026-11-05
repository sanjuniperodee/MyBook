#!/usr/bin/env node
// Карта модулей (ADR 0009, P3): что делает каждый модуль, его фасад, таблицы, тесты и кто его зовёт.
// Нужна, чтобы агент (или человек) по одному файлу нашёл, где живёт задача, и взял в контекст один модуль, а не весь проект.
//
//   node scripts/microservices/module-map.mjs          — перезаписать docs/modules.md
//   node scripts/microservices/module-map.mjs --check  — выйти с ошибкой, если карта устарела (так проверяет тест)
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const OUT = "docs/modules.md";

function walk(dir, exts) {
  let out = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out = out.concat(walk(p, exts));
    else if (exts.some((x) => e.name.endsWith(x))) out.push(p);
  }
  return out;
}

const read = (f) => readFileSync(f, "utf8");
const rel = (root, f) => path.relative(root, f).split(path.sep).join("/");

/** Первая строка JSDoc фасада («Публичный фасад контекста X: …») — без служебного начала. */
function describe(indexText) {
  const docs = [...indexText.matchAll(/\/\*\*([\s\S]*?)\*\//g)].map((m) =>
    m[1]
      .split("\n")
      .map((l) => l.replace(/^\s*\*\s?/, "").trim())
      .filter(Boolean)
      .join(" "),
  );
  const facade = docs.find((d) => /фасад/i.test(d)) ?? docs[0] ?? "";
  return facade
    .replace(/^Публичный фасад( контекста)?\s*/i, "")
    .replace(/^«([^»]+)»/, "$1")
    .trim();
}

/** Публичные поля класса-фасада: readonly x и методы верхнего уровня. */
function members(indexText) {
  const cls = indexText.match(/export class (\w+Module)\b[\s\S]*?\n}\n/);
  if (!cls) return { name: null, list: [] };
  const body = cls[0];
  const fields = [...body.matchAll(/^ {2}readonly (\w+)/gm)].map((m) => m[1]);
  const methods = [...body.matchAll(/^ {2}(?:async )?(\w+)\(/gm)].map((m) => m[1]).filter((n) => n !== "constructor");
  return { name: cls[1], list: [...new Set([...fields, ...methods])] };
}

export function renderModuleMap(root) {
  const src = path.join(root, "src");
  const modules = readdirSync(path.join(src, "modules"), { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort();
  const callers = [...walk(path.join(src, "app"), [".ts", ".tsx"]), ...walk(path.join(src, "components"), [".ts", ".tsx"]), ...walk(path.join(src, "server"), [".ts", ".tsx"])].map(read);
  const tests = walk(path.join(root, "tests"), [".test.ts", ".test.tsx"]).sort();
  const testTexts = tests.map((f) => [rel(root, f), read(f)]);

  const rows = modules.map((m) => {
    const dir = path.join(src, "modules", m);
    const files = walk(dir, [".ts", ".tsx"]);
    const loc = files.reduce((n, f) => n + read(f).split("\n").length, 0);
    const index = read(path.join(dir, "index.ts"));
    const facade = members(index);
    let tables = [];
    try {
      tables = [...read(path.join(src, "shared/infrastructure/db/schema", `${m}.ts`)).matchAll(/pgTable\(\s*"([a-z_0-9]+)"/g)].map((x) => x[1]);
    } catch {
      /* у модуля нет своих таблиц */
    }
    const calls = callers.reduce((n, t) => n + (t.match(new RegExp(`container\\(\\)\\.${m}\\b`, "g"))?.length ?? 0), 0);
    const re = new RegExp(`["'@/]modules/${m}(?:["'/])`);
    const own = testTexts.filter(([, t]) => re.test(t)).map(([f]) => f.replace(/^tests\//, ""));
    const subdirs = ["domain", "application", "infrastructure", "ui"].filter((d) => {
      try {
        return statSync(path.join(dir, d)).isDirectory();
      } catch {
        return false;
      }
    });
    return { m, about: describe(index), facade, tables, files: files.length, loc, calls, tests: own, subdirs };
  });

  const lines = [
    "# Карта модулей",
    "",
    "> Сгенерировано `node scripts/microservices/module-map.mjs` — не править руками. Свежесть проверяет",
    "> `tests/module-map.test.ts`: изменили модуль — перегенерируйте карту.",
    "",
    "Как пользоваться: найдите модуль по задаче, дальше работайте внутри `src/modules/<модуль>` и его тестов.",
    "Модуль не импортирует другие модули: нужное от соседа объявляется портом в `application`, адаптер подставляет",
    "`src/server/container.ts`. Страницы и `src/server` видят модуль через фасад (`@/modules/<модуль>`), `domain` и `ui`.",
    "Проверить один модуль: `npx vitest run <файлы из колонки «Тесты»>`.",
    "",
    "| Модуль | Что делает | Файлов / строк | Вызовов `container()` |",
    "|---|---|---:|---:|",
    ...rows.map((r) => `| [${r.m}](#${r.m}) | ${r.about.replace(/\|/g, "\\|")} | ${r.files} / ${r.loc} | ${r.calls} |`),
    "",
  ];
  for (const r of rows) {
    lines.push(`## ${r.m}`, "");
    lines.push(`${r.about}`, "");
    lines.push(`- Папка: \`src/modules/${r.m}\` (${r.subdirs.join(", ") || "плоская"})`);
    lines.push(`- Фасад: ${r.facade.name ? `\`${r.facade.name}\` → \`container().${r.m}\`` : "нет класса-фасада (функции из index.ts)"}`);
    if (r.facade.list.length) lines.push(`- Публичное: ${r.facade.list.map((x) => `\`${x}\``).join(", ")}`);
    lines.push(`- Таблицы: ${r.tables.length ? r.tables.map((t) => `\`${t}\``).join(", ") : "своих нет"}`);
    lines.push(`- Тесты (${r.tests.length}): ${r.tests.length ? r.tests.map((t) => `\`${t}\``).join(", ") : "—"}`);
    lines.push("");
  }
  return lines.join("\n");
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = process.cwd();
  const text = renderModuleMap(root);
  if (process.argv.includes("--check")) {
    let current = "";
    try {
      current = read(path.join(root, OUT));
    } catch {
      /* карты ещё нет */
    }
    if (current !== text) {
      console.error(`${OUT} устарела: node scripts/microservices/module-map.mjs`);
      process.exit(1);
    }
    console.log(`${OUT} свежая`);
  } else {
    writeFileSync(path.join(root, OUT), text);
    console.log(`${OUT}: ${text.split("\n").length} строк`);
  }
}
