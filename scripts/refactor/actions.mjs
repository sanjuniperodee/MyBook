// Server actions: какие проверки прав (guards), лимиты и zod вызывает каждая экспортируемая функция файлов "use server"
// (напрямую или через локальные помощники). Запуск: node scripts/refactor/actions.mjs
import { createRequire } from "node:module";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const ts = createRequire(path.join(root, "package.json"))("typescript");
const files = [];
(function walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = path.join(dir, name);
    if (statSync(p).isDirectory()) walk(p);
    else if (/\.(ts|tsx)$/.test(name) && /^["']use server["']/m.test(readFileSync(p, "utf8"))) files.push(p);
  }
})(path.join(root, "src"));

const GUARD = /\b(requireStaff|assertStaff|assertStaffShell|requireStaffShell|requireUser|getCurrentUser|getStaff|getAccessibleBook|assertVisible|rateLimit|require[A-Z]\w*|assert[A-Z]\w*)\s*\(/g;
// zod напрямую или вызовы общих схем из server/input (uuid.parse, textForm(), idParam()); formText стоит внутри z.object().
const ZOD = /\.(safeParse|parse)\(|z\.\w+\(|\b(textForm|idParams?)\(/;

let total = 0;
const unguarded = [];
const withoutZod = [];
const noInput = [];
for (const file of files.sort()) {
  const rel = path.relative(root, file);
  const sf = ts.createSourceFile(file, readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const local = new Map();
  for (const st of sf.statements) {
    if (ts.isFunctionDeclaration(st) && st.name) local.set(st.name.text, st);
    if (ts.isVariableStatement(st)) for (const d of st.declarationList.declarations) if (d.initializer && ts.isIdentifier(d.name)) local.set(d.name.text, d.initializer);
  }
  const guardsOf = (node, seen = new Set()) => {
    const text = node.getText(sf);
    const found = new Set([...text.matchAll(GUARD)].map((m) => m[1]));
    for (const [name, helper] of local) {
      if (seen.has(name) || helper === node || !new RegExp(`\\b${name}\\s*\\(`).test(text)) continue;
      seen.add(name);
      for (const g of guardsOf(helper, seen)) found.add(g);
    }
    return found;
  };
  // zod в самой функции или в локальных помощниках, которые она вызывает (loadDeal, loadConv…).
  const zodOf = (node, seen = new Set()) => {
    const text = node.getText(sf);
    if (ZOD.test(text)) return true;
    for (const [name, helper] of local) {
      if (seen.has(name) || helper === node || !new RegExp(`\\b${name}\\s*\\(`).test(text)) continue;
      seen.add(name);
      if (zodOf(helper, seen)) return true;
    }
    return false;
  };
  const paramsOf = (node) => (ts.isFunctionDeclaration(node) || ts.isArrowFunction(node) || ts.isFunctionExpression(node) ? node.parameters.length : 1);
  for (const st of sf.statements) {
    if (!st.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)) continue;
    let name;
    let node;
    if (ts.isFunctionDeclaration(st)) [name, node] = [st.name?.text, st];
    else if (ts.isVariableStatement(st)) [name, node] = [st.declarationList.declarations[0].name.getText(sf), st.declarationList.declarations[0].initializer];
    if (!node) continue;
    total++;
    const guards = [...guardsOf(node)];
    const input = paramsOf(node) > 0;
    const zod = zodOf(node);
    console.log(`${rel}::${name} -> ${guards.join(",") || "НЕТ ПРОВЕРОК"}${zod ? " [zod]" : input ? "" : " [без входа]"}`);
    if (!guards.length) unguarded.push(`${rel}::${name}`);
    if (!input) noInput.push(`${rel}::${name}`);
    else if (!zod) withoutZod.push(`${rel}::${name}`);
  }
}
console.log(`\nвсего: ${total}, без проверок: ${unguarded.length}, без входа: ${noInput.length}, с входом без zod: ${withoutZod.length}`);
for (const u of withoutZod) console.log(`  без zod: ${u}`);
for (const u of unguarded) console.log(`  без проверок: ${u}`);
