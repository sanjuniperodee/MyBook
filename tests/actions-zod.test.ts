import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";

/**
 * Каждое экспортированное server action бэкенда (src/server/crm-actions и др.; обёртки страниц — в mybook-web) с аргументами проверяет вход zod — напрямую, через общие схемы
 * server/input (uuid, formText, textForm) или в локальном помощнике (решение 7, E5). Проверка — тем же
 * разбором TypeScript, что scripts/refactor/actions.mjs.
 */
describe("server actions: вход через zod", () => {
  const report = execFileSync(process.execPath, ["scripts/refactor/actions.mjs"], { encoding: "utf8" });

  it("действий с аргументами без zod нет", () => {
    expect(report.split("\n").filter((l) => l.startsWith("  без zod:"))).toEqual([]);
  });

  it("без проверок прав и лимитов действий нет (обёртки сайта — в mybook-web, здесь — сами действия src/server)", () => {
    expect(report.split("\n").filter((l) => l.startsWith("  без проверок:"))).toEqual([]);
  });
});
