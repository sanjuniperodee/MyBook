import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";

/**
 * Каждое экспортированное server action с аргументами проверяет вход zod — напрямую, через общие схемы
 * server/input (uuid, formText, textForm) или в локальном помощнике (решение 7, E5). Проверка — тем же
 * разбором TypeScript, что scripts/refactor/actions.mjs.
 */
describe("server actions: вход через zod", () => {
  const report = execFileSync(process.execPath, ["scripts/refactor/actions.mjs"], { encoding: "utf8" });

  it("действий с аргументами без zod нет", () => {
    expect(report.split("\n").filter((l) => l.startsWith("  без zod:"))).toEqual([]);
  });

  it("без проверок прав и лимитов — только выход и сброс пароля по токену из письма", () => {
    expect(report.split("\n").filter((l) => l.startsWith("  без проверок:"))).toEqual([
      "  без проверок: src/app/(auth)/actions.ts::logoutAction",
      "  без проверок: src/app/(auth)/actions.ts::resetAction",
    ]);
  });
});
