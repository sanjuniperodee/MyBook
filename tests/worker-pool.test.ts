import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * Проходы планировщика держат соединение из общего пула под advisory-блокировку весь проход, а их шаги берут
 * соединения из того же пула. Пул воркера не больше числа таких проходов — взаимная блокировка: фон стоит, ошибок нет
 * (24.11.2026, пул 4).
 */
describe("пул БД воркера", () => {
  it("больше числа проходов, держащих соединение под блокировку, с запасом на шаги", () => {
    const scheduler = readFileSync("src/server/scheduler.ts", "utf8");
    const held = (scheduler.match(/await pool\.connect\(\)/g) ?? []).length;
    const ecosystem = readFileSync("deploy/ecosystem.config.cjs", "utf8");
    const size = Number(/MYBOOK_WORKER_POOL \|\| "(\d+)"/.exec(ecosystem)?.[1]);
    expect(held).toBeGreaterThan(0);
    expect(size).toBeGreaterThanOrEqual(held + 4);
  });
});
