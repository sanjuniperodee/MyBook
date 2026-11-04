#!/usr/bin/env node
/**
 * Инвентаризация монолита MyBooks для плана разделения на сервисы.
 *
 * Считает то, что определяет стоимость и порядок распила:
 *  - размер кода по слоям и модулям;
 *  - количество страниц, API-роутов, server actions;
 *  - таблицы по владельцам схемы и внешние ключи между владельцами;
 *  - обращения к `container()` (шов, через который бэкенд можно вынести);
 *  - миграции и тесты.
 *
 * Запуск:
 *   node scripts/microservices/inventory.mjs
 *   node scripts/microservices/inventory.mjs --out docs/microservices/baseline
 *
 * Скрипт намеренно без зависимостей: он должен работать и на старом дереве,
 * и после переезда в монорепозиторий. Пути к `src/`, `tests/`, `drizzle/`
 * задаются в ROOT и при переезде меняются в одном месте.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const SRC = path.join(ROOT, "src");
const SCHEMA = path.join(SRC, "shared/infrastructure/db/schema");
const TESTS = path.join(ROOT, "tests");
const DRIZZLE = path.join(ROOT, "drizzle");

const CODE_EXT = new Set([".ts", ".tsx", ".mjs", ".js"]);
const TS_EXT = new Set([".ts", ".tsx"]);

function walk(dir, filter = () => true) {
  if (!existsSync(dir)) return [];
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === ".next" || entry.name === "out") continue;
      out.push(...walk(full, filter));
    } else if (filter(full)) {
      out.push(full);
    }
  }
  return out;
}

function loc(files) {
  let total = 0;
  for (const file of files) total += readFileSync(file, "utf8").split("\n").length;
  return total;
}

function countMatches(files, re) {
  let total = 0;
  for (const file of files) total += (readFileSync(file, "utf8").match(re) ?? []).length;
  return total;
}

function relative(file) {
  return path.relative(ROOT, file);
}

function git(args) {
  try {
    return execFileSync("git", args, { cwd: ROOT, encoding: "utf8" }).trim();
  } catch {
    return "";
  }
}

function byPrefix(files, base) {
  const counts = new Map();
  for (const file of files) {
    const rel = path.relative(base, file).replaceAll(path.sep, "/");
    const prefix = rel.split("/")[0] || "(root)";
    counts.set(prefix, (counts.get(prefix) ?? 0) + 1);
  }
  return Object.fromEntries([...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])));
}

function schemaInventory() {
  const files = walk(SCHEMA, (f) => f.endsWith(".ts"));
  const varToTable = new Map();
  const tableToSchema = new Map();
  const tables = [];
  const perSchema = {};

  for (const file of files) {
    const schemaName = path.basename(file, ".ts");
    const text = readFileSync(file, "utf8");
    const found = [...text.matchAll(/pgTable\(\s*["']([a-z0-9_]+)["']/g)].map((m) => m[1]);
    const declared = [...text.matchAll(/export const (\w+)\s*=\s*pgTable\(\s*["']([a-z0-9_]+)["']/g)];
    for (const [, variable, table] of declared) {
      varToTable.set(variable, table);
      tableToSchema.set(table, schemaName);
    }
    perSchema[schemaName] = { tables: found, declarations: declared.length };
    tables.push(...found);
  }

  const crossRefs = [];
  const matrix = {};
  for (const file of files) {
    const fromSchema = path.basename(file, ".ts");
    const text = readFileSync(file, "utf8");
    for (const match of text.matchAll(/references\(\s*\(\)\s*=>\s*(\w+)\./g)) {
      const targetTable = varToTable.get(match[1]);
      if (!targetTable) continue;
      const toSchema = tableToSchema.get(targetTable);
      if (!toSchema || toSchema === fromSchema) continue;
      crossRefs.push({ fromSchema, toSchema, targetTable });
      const key = `${fromSchema} -> ${toSchema}`;
      matrix[key] = (matrix[key] ?? 0) + 1;
    }
  }

  return {
    schemaFiles: files.length,
    tableCount: tables.length,
    uniqueTables: new Set(tables).size,
    perSchema,
    crossSchemaReferences: crossRefs.length,
    crossSchemaMatrix: Object.fromEntries(Object.entries(matrix).sort((a, b) => b[1] - a[1])),
    crossSchemaDetails: crossRefs.sort((a, b) => a.fromSchema.localeCompare(b.fromSchema) || a.targetTable.localeCompare(b.targetTable)),
  };
}

function main() {
  const outIndex = process.argv.indexOf("--out");
  const outDir = outIndex >= 0 ? path.resolve(ROOT, process.argv[outIndex + 1] ?? "") : null;

  const srcFiles = walk(SRC);
  const tsFiles = srcFiles.filter((f) => TS_EXT.has(path.extname(f)));
  const testFiles = walk(TESTS, (f) => /\.(test|spec)\.(ts|tsx)$/.test(f));
  const apiRoutes = walk(path.join(SRC, "app/api"), (f) => f.endsWith("/route.ts") || f.endsWith("route.ts"));
  const pages = walk(path.join(SRC, "app"), (f) => f.endsWith("/page.tsx") || f.endsWith("page.tsx"));
  const actions = walk(path.join(SRC, "app"), (f) => f.endsWith("/actions.ts") || f.endsWith("actions.ts"));

  const areas = {};
  for (const area of ["app", "components", "modules", "lib", "shared", "server", "i18n", "config"]) {
    const dir = path.join(SRC, area);
    const files = walk(dir);
    const code = files.filter((f) => CODE_EXT.has(path.extname(f)));
    areas[area] = { files: files.length, codeFiles: code.length, loc: loc(code) };
  }

  const modules = {};
  for (const entry of readdirSync(path.join(SRC, "modules"), { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const dir = path.join(SRC, "modules", entry.name);
    const code = walk(dir, (f) => CODE_EXT.has(path.extname(f)));
    modules[entry.name] = { files: code.length, loc: loc(code) };
  }

  const containerFiles = [
    ...walk(path.join(SRC, "app")),
    ...walk(path.join(SRC, "components")),
    ...walk(path.join(SRC, "server")),
  ];
  const containerCallSites = containerFiles.filter((f) => readFileSync(f, "utf8").includes("container()"));

  const migrations = existsSync(DRIZZLE) ? readdirSync(DRIZZLE).filter((f) => f.endsWith(".sql")) : [];
  const schema = schemaInventory();

  const packageJson = JSON.parse(readFileSync(path.join(ROOT, "package.json"), "utf8"));

  const inventory = {
    generatedAt: new Date().toISOString(),
    git: { branch: git(["branch", "--show-current"]), commit: git(["rev-parse", "HEAD"]), shortCommit: git(["rev-parse", "--short", "HEAD"]) },
    summary: {
      sourceFiles: srcFiles.length,
      sourceTsFiles: tsFiles.length,
      sourceLoc: loc(tsFiles),
      testFiles: testFiles.length,
      tests: countMatches(testFiles, /\b(it|test)\(/g),
      apiRoutes: apiRoutes.length,
      pages: pages.length,
      serverActions: actions.length,
      modules: Object.keys(modules).length,
      tables: schema.tableCount,
      migrations: migrations.length,
      containerFiles: containerCallSites.length,
      containerCalls: countMatches(containerCallSites, /container\(\)/g),
      crossSchemaReferences: schema.crossSchemaReferences,
    },
    areas,
    modules: Object.fromEntries(Object.entries(modules).sort((a, b) => b[1].loc - a[1].loc)),
    apiRoutesByPrefix: byPrefix(apiRoutes, path.join(SRC, "app/api")),
    pagesByPrefix: byPrefix(pages, path.join(SRC, "app")),
    actionsByPrefix: byPrefix(actions, path.join(SRC, "app")),
    schema,
    dependencies: {
      runtime: packageJson.dependencies ?? {},
      dev: packageJson.devDependencies ?? {},
    },
  };

  if (!outDir) {
    process.stdout.write(`${JSON.stringify(inventory, null, 2)}\n`);
    return;
  }

  mkdirSync(outDir, { recursive: true });
  writeFileSync(path.join(outDir, "inventory.json"), `${JSON.stringify(inventory, null, 2)}\n`);
  writeFileSync(path.join(outDir, "inventory.md"), renderMarkdown(inventory));
  console.log(`inventory: ${relative(path.join(outDir, "inventory.json"))}, ${relative(path.join(outDir, "inventory.md"))}`);
}

function renderMarkdown(inv) {
  const s = inv.summary;
  const rows = [
    ["Файлов в `src/`", s.sourceFiles],
    ["Файлов TypeScript", s.sourceTsFiles],
    ["Строк TypeScript", s.sourceLoc],
    ["Тестовых файлов", s.testFiles],
    ["Тестов (`it`/`test`)", s.tests],
    ["API-роутов", s.apiRoutes],
    ["Страниц", s.pages],
    ["Server actions", s.serverActions],
    ["Модулей (bounded contexts)", s.modules],
    ["Таблиц", s.tables],
    ["Миграций", s.migrations],
    ["Файлов с `container()`", s.containerFiles],
    ["Вызовов `container()`", s.containerCalls],
    ["Внешних ключей между схемами", s.crossSchemaReferences],
  ];
  const areaRows = Object.entries(inv.areas).map(([name, a]) => `| \`${name}/\` | ${a.codeFiles} | ${a.loc} |`);
  const moduleRows = Object.entries(inv.modules).map(([name, m]) => `| \`${name}\` | ${m.files} | ${m.loc} |`);
  const schemaRows = Object.entries(inv.schema.perSchema)
    .filter(([, v]) => v.tables.length)
    .map(([name, v]) => `| \`${name}\` | ${v.tables.length} | ${v.tables.map((t) => `\`${t}\``).join(", ")} |`);
  const crossRows = Object.entries(inv.schema.crossSchemaMatrix).map(([k, v]) => `| ${k} | ${v} |`);
  const routeRows = Object.entries(inv.apiRoutesByPrefix).map(([k, v]) => `| \`${k}\` | ${v} |`);

  return `# Инвентаризация MyBooks

> Сгенерировано \`scripts/microservices/inventory.mjs\` ${inv.generatedAt}.
> Ветка \`${inv.git.branch}\`, коммит \`${inv.git.shortCommit}\`.

## Сводка

| Метрика | Значение |
|---|---:|
${rows.map(([k, v]) => `| ${k} | ${v} |`).join("\n")}

## Код по слоям

| Слой | Файлов | Строк |
|---|---:|---:|
${areaRows.join("\n")}

## Модули

| Модуль | Файлов | Строк |
|---|---:|---:|
${moduleRows.join("\n")}

## Таблицы по владельцам схемы

| Схема | Таблиц | Таблицы |
|---|---:|---|
${schemaRows.join("\n")}

## Внешние ключи между схемами

Это главный блокер разделения баз: пока ключ идёт из одной схемы в другую,
владельцы таблиц не независимы.

| Направление | Ключей |
|---|---:|
${crossRows.join("\n")}

## API-роуты по префиксам

| Префикс | Роутов |
|---|---:|
${routeRows.join("\n")}

## Как пересчитать

\`\`\`sh
node scripts/microservices/inventory.mjs --out docs/microservices/baseline
\`\`\`
`;
}

main();
