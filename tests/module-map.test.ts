import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
// @ts-expect-error -- .mjs без типов
import { renderModuleMap } from "../scripts/microservices/module-map.mjs";

// Карта модулей для агентов и людей (ADR 0009, P3) должна совпадать с кодом.
describe("docs/modules.md", () => {
  const root = path.join(__dirname, "..");
  const map: string = renderModuleMap(root);

  it("свежая: изменили модуль — node scripts/microservices/module-map.mjs", () => {
    expect(readFileSync(path.join(root, "docs/modules.md"), "utf8")).toBe(map);
  });

  it("у каждого модуля есть описание, фасад и тесты", () => {
    const sections = map.split("\n## ").slice(1);
    expect(sections.length).toBeGreaterThan(10);
    for (const s of sections) {
      const [name, , about] = s.split("\n");
      expect(about, `${name}: нет описания`).toBeTruthy();
      expect(s, `${name}: нет тестов`).not.toMatch(/- Тесты \(0\)/);
    }
  });
});
