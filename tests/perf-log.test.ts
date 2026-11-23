import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

// Журнал замеров G1 (docs/microservices/10-go-plan-2026-11-24.md): папка, строки, счётчики файлов.

const dir = mkdtempSync(path.join(os.tmpdir(), "perf-log-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe("журнал замеров", () => {
  beforeEach(() => vi.resetModules());

  it("папка: PERF_LOG_DIR, иначе в проде рядом с хранилищем; в разработке и с PERF_LOG=off — выключен", async () => {
    const { perfLogDir } = await import("@/shared/infrastructure/perfLog");
    expect(perfLogDir({ NODE_ENV: "production", STORAGE_DIR: "/home/srv/mybook-storage" })).toBe("/home/srv/mybook-logs");
    expect(perfLogDir({ NODE_ENV: "development", STORAGE_DIR: "/x/storage" })).toBeNull();
    expect(perfLogDir({ NODE_ENV: "test" })).toBeNull();
    expect(perfLogDir({ PERF_LOG_DIR: "/tmp/p", NODE_ENV: "test" })).toBe("/tmp/p");
    expect(perfLogDir({ PERF_LOG: "off", PERF_LOG_DIR: "/tmp/p", NODE_ENV: "production", STORAGE_DIR: "/s" })).toBeNull();
  });

  it("имя процесса — из PM2 (name), иначе по порту", async () => {
    const { perfProc } = await import("@/shared/infrastructure/perfLog");
    expect(perfProc({ name: "mybook" })).toBe("mybook");
    expect(perfProc({ PORT: "3041" })).toBe("node:3041");
    expect(perfProc({ MYBOOK_PERF_PROC: "pdf", name: "mybook" })).toBe("pdf");
  });

  it("строка JSON в perf-ГГГГ-ММ.jsonl", async () => {
    vi.stubEnv("PERF_LOG_DIR", path.join(dir, "logs"));
    const { perfLog } = await import("@/shared/infrastructure/perfLog");
    perfLog("pdf", { task: "reading", ms: 1800 });
    const month = new Date().toISOString().slice(0, 7);
    const file = path.join(dir, "logs", `perf-${month}.jsonl`);
    await vi.waitFor(() => expect(readFileSync(file, "utf8")).toContain('"task":"reading"'));
    const row = JSON.parse(readFileSync(file, "utf8").trim());
    expect(row).toMatchObject({ kind: "pdf", task: "reading", ms: 1800, pid: process.pid });
    vi.unstubAllEnvs();
  });

  it("счётчики копятся и обнуляются при сбросе", async () => {
    const { countPerf, takeCounters } = await import("@/shared/infrastructure/perfLog");
    countPerf("route:photo", 1048576, 10, 200);
    countPerf("route:photo", 0, 30, 304);
    expect(takeCounters()).toEqual({ "route:photo": { n: 2, bytes: 1048576, mb: 1, ms: 40, maxMs: 30, statuses: { 200: 1, 304: 1 } } });
    expect(takeCounters()).toEqual({});
  });

  it("обёртка маршрута файла отдаёт ответ как есть и считает его", async () => {
    const { takeCounters } = await import("@/shared/infrastructure/perfLog");
    const { fileRoute } = await import("@/server/file-route");
    const GET = fileRoute("answer-file", async (req: Request) => new Response(req.method === "GET" ? "abc" : "", { status: 206, headers: { "Content-Length": "3" } }));
    const res = await GET(new Request("http://x/v/1"));
    expect(res.status).toBe(206);
    expect(await res.text()).toBe("abc");
    expect(takeCounters()["route:answer-file"]).toMatchObject({ n: 1, bytes: 3, statuses: { 206: 1 } });
  });

  it("счётчики общие для всех копий модуля в процессе (рантаймы Next)", async () => {
    const a = await import("@/shared/infrastructure/perfLog");
    vi.resetModules();
    const b = await import("@/shared/infrastructure/perfLog");
    expect(a).not.toBe(b);
    a.countPerf("route:photo", 10, 1, 200);
    expect(b.takeCounters()["route:photo"]).toMatchObject({ n: 1, bytes: 10 });
  });

  it("интервал замера: 5 минут по умолчанию, PERF_SAMPLE_MIN меняет", async () => {
    const { perfSampleMs } = await import("@/shared/infrastructure/perfLog");
    expect(perfSampleMs(undefined)).toBe(300_000);
    expect(perfSampleMs("1")).toBe(60_000);
    expect(perfSampleMs("x")).toBe(300_000);
  });
});
