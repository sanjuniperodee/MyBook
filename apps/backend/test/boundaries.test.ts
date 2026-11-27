import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Правила ADR 0014 для apps/backend/src: без Next и React (бэкенд — не веб), без сервис-локатора старого бэкенда
 * (src/server) — кроме переходного слоя legacy/; предметная область (src/modules/*) — без декораторов Nest. Прежнего
 * mybook-api (apps/api) нет — шаг 7 ADR 0014.
 */
const ROOT = path.join(__dirname, "..", "..", "..");
const SRC = path.join(ROOT, "apps/backend/src");

const walk = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(dir, e.name)) : e.name.endsWith(".ts") ? [path.join(dir, e.name)] : []));

const importsOf = (file: string) => [...readFileSync(file, "utf8").matchAll(/(?:from\s+|import\s*\(\s*|import\s+)["']([^"']+)["']/g)].map((m) => m[1]);

describe("границы бэкенда на Nest (ADR 0014)", () => {
  const files = walk(SRC);

  it("без next/*, react и server-only", () => {
    const bad = files.flatMap((f) => importsOf(f).filter((s) => /^(next|react|react-dom|server-only)(\/|$)/.test(s)).map((s) => `${path.relative(ROOT, f)} → ${s}`));
    expect(bad).toEqual([]);
  });

  it("старый бэкенд (src/server) — только из legacy/", () => {
    const bad = files
      .filter((f) => !f.startsWith(path.join(SRC, "legacy") + path.sep))
      .flatMap((f) => importsOf(f).filter((s) => /^@\/server(\/|$)/.test(s)).map((s) => `${path.relative(ROOT, f)} → ${s}`));
    expect(bad).toEqual([]);
  });

  it("прежнего mybook-api (apps/api) нет, и никто его не импортирует", () => {
    expect(existsSync(path.join(ROOT, "apps/api"))).toBe(false);
    const code = ["src", "apps", "tests", "scripts", "packages"].flatMap((d) => walk(path.join(ROOT, d)).filter((f) => !f.includes(`${path.sep}node_modules${path.sep}`)));
    const bad = code.flatMap((f) => importsOf(f).filter((s) => /(^|\/)apps\/api(\/|$)/.test(s)).map((s) => `${path.relative(ROOT, f)} → ${s}`));
    expect(bad).toEqual([]);
  });

  it("предметная область и общий код — без Nest", () => {
    const shared = ["src/modules", "src/shared", "src/lib", "src/i18n", "packages/contracts/src"].flatMap((d) => walk(path.join(ROOT, d)));
    const bad = shared.flatMap((f) => importsOf(f).filter((s) => s.startsWith("@nestjs/")).map((s) => `${path.relative(ROOT, f)} → ${s}`));
    expect(bad).toEqual([]);
  });

  it("зависимости внедряются явными токенами: у каждого параметра конструктора — @Inject", () => {
    // Сборка esbuild и vitest не пишут метаданные типов (emitDecoratorMetadata), без @Inject Nest подставит undefined.
    const bad = files.filter((f) => {
      const src = readFileSync(f, "utf8");
      const ctor = src.match(/constructor\(([^)]*)\)/);
      if (!ctor || !/@(Injectable|Controller)\(/.test(src)) return false;
      return ctor[1].split(/,\s*(?=@|private|readonly|public)/).some((p) => p.trim() && !p.includes("@Inject("));
    });
    expect(bad.map((f) => path.relative(ROOT, f))).toEqual([]);
  });
});
