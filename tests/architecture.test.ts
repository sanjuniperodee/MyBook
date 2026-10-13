import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { CATEGORIES, edgeLabel, importGraph, violations, type ImportEdge } from "../scripts/refactor/import-graph.mjs";
import baseline from "./architecture-baseline.json";

const BASELINE = "tests/architecture-baseline.json";
const pair = (e: ImportEdge) => `${e.from} -> ${e.to}`;

// Разница мультимножеств: импорты сверх разрешённых (повтор пары — ещё одно нарушение) и разрешённые, которых больше нет.
function compare(found: ImportEdge[], allowed: string[]) {
  const left = new Map<string, number>();
  for (const p of allowed) left.set(p, (left.get(p) ?? 0) + 1);
  const added: string[] = [];
  for (const e of found) {
    const n = left.get(pair(e)) ?? 0;
    if (n > 0) left.set(pair(e), n - 1);
    else added.push(edgeLabel(e));
  }
  const gone = [...left].flatMap(([p, n]) => Array<string>(n).fill(p));
  return { added, gone };
}

// Храповик: число нарушений границ только опускается (docs/refactor/plan.md, S1).
describe("границы модулей", () => {
  const found = violations(importGraph(path.join(__dirname, "..")).edges);
  for (const [key, title] of CATEGORIES) {
    const { added, gone } = compare(found[key], baseline[key]);
    it(`${title}: нет нарушений сверх baseline`, () => {
      expect(added, `Новые нарушения «${title}». Уберите импорт (порт, shared, фасад) — не добавляйте его в ${BASELINE}`).toEqual([]);
    });
    it(`${title}: исчезнувшие нарушения убраны из baseline`, () => {
      expect(gone, `Нарушений «${title}» больше нет — удалите эти строки из ${BASELINE}, чтобы порог опустился`).toEqual([]);
    });
  }
});

// Мини-репозиторий: по файлу на каждый вид импорта.
const FIXTURE: Record<string, string> = {
  "src/modules/a/domain/x.ts": "export const x = 1;\n",
  "src/modules/a/typeOnly.ts": 'import type { B } from "@/modules/b";\n',
  "src/modules/a/reexports.ts": 'export * from "./domain/x";\nexport { ui } from "../b/ui";\n',
  "src/modules/a/dynamic.ts": 'export async function load() {\n  return import("@/server/srv");\n}\n',
  "src/modules/a/multiline.ts": `import {
  s,
  t,
} from "@/shared/s";
import Card from "@/components/Card";
import { z } from "zod";
`,
  "src/modules/b/index.ts": "export type B = 1;\n",
  "src/modules/b/ui/index.tsx": "export const ui = 1;\n",
  "src/server/srv.ts": "export const srv = 1;\n",
  "src/components/Card.tsx": "export default function Card() {}\n",
  "src/shared/s.ts": 'import type { X } from "@/modules/a/domain/x";\nexport const s = 1, t = 2;\n',
  "src/app/page.tsx": 'import { ui } from "@/modules/b/ui";\nimport { srv } from "../server/srv";\n',
  "src/lib/l.ts": 'import { x } from "@/modules/a/domain/x";\n',
  "src/lib/sideEffect.ts": 'import "./l";\nimport type { B } from "@/modules/b";\nimport "./l";\n',
  "src/lib/swallowed.ts": 'export const load = () => import("@/server/srv");\nexport { x } from "./l";\n',
  "src/lib/commented.ts": '// import { ui } from "@/modules/b/ui";\n',
};

describe("граф импортов", () => {
  let root = "";
  let edges: ImportEdge[] = [];
  beforeAll(() => {
    root = mkdtempSync(path.join(os.tmpdir(), "import-graph-"));
    for (const [file, text] of Object.entries(FIXTURE)) {
      mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
      writeFileSync(path.join(root, file), text);
    }
    edges = importGraph(root).edges;
  });
  afterAll(() => rmSync(root, { recursive: true, force: true }));

  const importsOf = (file: string) => edges.filter((e) => e.from === file).map(({ to, typeOnly, dynamic }) => ({ to, typeOnly, dynamic }));
  const imp = (to: string, flags: Partial<ImportEdge> = {}) => ({ to, typeOnly: false, dynamic: false, ...flags });

  it("import type помечается type, «@/модуль» ведёт в index.ts", () => {
    expect(importsOf("src/modules/a/typeOnly.ts")).toEqual([imp("src/modules/b/index.ts", { typeOnly: true })]);
  });

  it("export * from и export { x } from: относительные пути, index.tsx", () => {
    expect(importsOf("src/modules/a/reexports.ts")).toEqual([imp("src/modules/a/domain/x.ts"), imp("src/modules/b/ui/index.tsx")]);
  });

  it("import() помечается dynamic", () => {
    expect(importsOf("src/modules/a/dynamic.ts")).toEqual([imp("src/server/srv.ts", { dynamic: true })]);
  });

  it("многострочный импорт и .tsx; пакеты в граф не попадают", () => {
    expect(importsOf("src/modules/a/multiline.ts")).toEqual([imp("src/shared/s.ts"), imp("src/components/Card.tsx")]);
  });

  it("нарушения по категориям", () => {
    // Внутри модуля, модуль → shared, lib и app → модули и server — не нарушения.
    const pairs = (list: ImportEdge[]) => list.map(pair).sort();
    const v = violations(edges);
    expect(pairs(v.crossModule)).toEqual([
      "src/modules/a/reexports.ts -> src/modules/b/ui/index.tsx",
      "src/modules/a/typeOnly.ts -> src/modules/b/index.ts",
    ]);
    expect(pairs(v.moduleOutward)).toEqual([
      "src/modules/a/dynamic.ts -> src/server/srv.ts",
      "src/modules/a/multiline.ts -> src/components/Card.tsx",
    ]);
    expect(pairs(v.sharedToModules)).toEqual(["src/shared/s.ts -> src/modules/a/domain/x.ts"]);
  });

  // Баги регулярки ниже не меняют нарушений в текущем src/ (сверено с TypeScript AST), но оставляют дыры в храповике.
  it("баг: побочный import \"…\" перед импортом с from теряется, а следующий импорт теряет пометку type", () => {
    // Ленивое [\s\S]*? дотягивается до from следующего импорта. Последний побочный импорт в файле виден.
    expect(importsOf("src/lib/sideEffect.ts")).toEqual([imp("src/modules/b/index.ts"), imp("src/lib/l.ts")]);
  });

  it("баг: import() между export и следующим from \"…\" не попадает в граф", () => {
    expect(importsOf("src/lib/swallowed.ts")).toEqual([imp("src/lib/l.ts")]);
  });

  it("баг: закомментированный импорт попадает в граф", () => {
    expect(importsOf("src/lib/commented.ts")).toEqual([imp("src/modules/b/ui/index.tsx")]);
  });
});
