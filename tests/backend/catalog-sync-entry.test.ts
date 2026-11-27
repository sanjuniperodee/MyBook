import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// 27.11: API на Nest потерял startCatalogSync при переезде с mybook-api — счёт в CRM брал заводские 30 000 ₸ за
// твёрдую обложку вместо цены из «Цены и тарифы». Цены из настроек обязаны подгружаться в обоих процессах.
describe("каталог из настроек в процессах бэкенда", () => {
  it("API (main.ts) подгружает цены до приёма запросов и держит их в синхроне", () => {
    const src = readFileSync("apps/backend/src/main.ts", "utf8");
    expect(src).toMatch(/await ensureCatalog\(\);\s*\n\s*startCatalogSync\(\);/);
    expect(src.indexOf("startCatalogSync()")).toBeLessThan(src.indexOf("app.listen("));
  });

  it("воркер тоже держит каталог в синхроне", () => {
    expect(readFileSync("src/worker/run.ts", "utf8")).toContain("startCatalogSync()");
  });
});
