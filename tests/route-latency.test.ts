import { describe, expect, it } from "vitest";
// @ts-expect-error -- .mjs без типов
import { routeOf, summarize } from "../scripts/perf/route-latency.mjs";

// Замер скорости по логу nginx (ADR 0009, P7).
describe("scripts/perf/route-latency.mjs", () => {
  it("идентификаторы в пути сводятся к шаблону маршрута", () => {
    expect(routeOf("/books/0b9a7c1e-2f3d-4a5b-8c6d-7e8f9a0b1c2d/questions")).toBe("/books/:id/questions");
    expect(routeOf("/admin/deals/1234")).toBe("/admin/deals/:n");
    expect(routeOf("/pay/a1B2c3D4e5F6g7H8i9")).toBe("/pay/:token");
    expect(routeOf("/_next/static/chunks/app.js")).toBe("(статика)");
    expect(routeOf("/")).toBe("/");
  });

  it("p50/p95 по маршруту, 5xx считаются, чужие строки и долгие потоки (SSE) пропускаются", () => {
    const lines = [
      ...Array.from({ length: 19 }, (_, i) => `2026-11-05T00:00:${String(i).padStart(2, "0")}+00:00 200 GET "/admin" 0.0${i < 10 ? "1" : "2"}0 "0.010" 100`),
      `2026-11-05T00:01:00+00:00 502 GET "/admin" 1.500 "-" 0`,
      `2026-11-05T00:02:00+00:00 200 GET "/api/admin/live/stream" 463.296 "463.296" 4000`,
      "мусор",
    ].join("\n");
    const { rows, skipped, total } = summarize(lines, { min: 5 });
    expect(skipped).toBe(1);
    expect(total).toBe(20);
    expect(rows).toEqual([{ route: "GET /admin", count: 20, p50: 0.01, p95: 0.02, p99: 1.5, max: 1.5, errors5xx: 1 }]);
  });
});
