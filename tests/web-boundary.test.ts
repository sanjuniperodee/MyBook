import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { sharedRoots, sharedSources } from "../scripts/packages/shared-sources.mjs";

/**
 * ADR 0013: веб (mybook-web) не содержит кода бэкенда. Общий код он получает пакетом @sanjuniperodee/mybook-shared
 * (scripts/packages/build-shared.mjs): src/lib, src/i18n, src/config, src/shared без infrastructure, domain/ui модулей и
 * всё, до чего они доходят импортами значений. Здесь — что этот обход не доходит до кода бэкенда (src/server, src/worker,
 * apps, src/shared/infrastructure, application/infrastructure модулей) и не тянет БД. Импорт
 * типов можно: их даёт пакет объявлений.
 *
 * С 27.11 копии сайта в этом репозитории нет (страницы, компоненты, src/web — только в mybook-web).
 */
const ROOT = path.join(__dirname, "..");

describe("общий код для веба (пакет mybook-shared, ADR 0013)", () => {
  const { sources, violations } = sharedSources(ROOT);

  it("не доходит до кода бэкенда", () => {
    expect(violations).toEqual([]);
  });

  it("включает все корни общего кода и только их окрестность", () => {
    expect(sources).toEqual(expect.arrayContaining(sharedRoots(ROOT)));
    expect(sources.filter((f) => !/^src\/(lib|i18n|config|shared|modules|types)\//.test(f))).toEqual([]);
  });

  it("не тянет БД и Redis", () => {
    const offenders = sources.filter((f) => {
      const src = readFileSync(path.join(ROOT, f), "utf8");
      return /^import\s+(?!type\b)[^;]*?from\s+["'](pg|drizzle-orm[^"']*|ioredis)["']/m.test(src);
    });
    expect(offenders).toEqual([]);
  });

  it("копии сайта в бэкенде нет", () => {
    for (const dir of ["src/app", "src/components", "src/hooks", "src/web", "public"]) expect(existsSync(path.join(ROOT, dir)), dir).toBe(false);
  });
});
