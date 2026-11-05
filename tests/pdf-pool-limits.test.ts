import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it, vi } from "vitest";

// Поток вёрстки PDF с пределом кучи (ADR 0009, P4): переполнение роняет поток и задачу, а не процесс сайта.

const dir = mkdtempSync(path.join(os.tmpdir(), "pdf-pool-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

// Поддельный воркер: задача "boom" съедает память до предела, остальные отвечают сразу.
const file = path.join(dir, "fake-pdf-worker.mjs");
writeFileSync(
  file,
  `import { parentPort } from "node:worker_threads";
parentPort.on("message", ({ id, job }) => {
  if (job.kind === "boom") { const hog = []; for (;;) hog.push(new Array(1e6).fill(Math.random())); }
  parentPort.postMessage({ id, ok: true, result: job.kind });
});
`,
);

describe("поток вёрстки PDF", () => {
  it("предел кучи: по умолчанию 2048 МБ, PDF_WORKER_HEAP_MB меняет", async () => {
    const { pdfWorkerHeapMb } = await import("@/modules/production/infrastructure/pdf/pool");
    expect(pdfWorkerHeapMb(undefined)).toBe(2048);
    expect(pdfWorkerHeapMb("")).toBe(2048);
    expect(pdfWorkerHeapMb("abc")).toBe(2048);
    expect(pdfWorkerHeapMb("3")).toBe(2048);
    expect(pdfWorkerHeapMb("1536")).toBe(1536);
  });

  it("простой: по умолчанию 10 мин, PDF_WORKER_IDLE_MIN меняет, 0 — не закрывать", async () => {
    const { pdfWorkerIdleMs } = await import("@/modules/production/infrastructure/pdf/pool");
    expect(pdfWorkerIdleMs(undefined)).toBe(600_000);
    expect(pdfWorkerIdleMs("")).toBe(600_000);
    expect(pdfWorkerIdleMs("abc")).toBe(600_000);
    expect(pdfWorkerIdleMs("-1")).toBe(600_000);
    expect(pdfWorkerIdleMs("0")).toBe(0);
    expect(pdfWorkerIdleMs("0.01")).toBe(600);
  });

  it("после простоя поток закрывается, следующая задача поднимает новый", async () => {
    vi.resetModules();
    vi.stubEnv("PDF_WORKER_FILE", file);
    vi.stubEnv("PDF_WORKER_IDLE_MIN", "0.005"); // 300 мс
    vi.stubEnv("PDF_WORKER", "");
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const { inPdfThread } = await import("@/modules/production/infrastructure/pdf/pool");
    const run = inPdfThread as unknown as (job: { kind: string }) => Promise<unknown>;
    await expect(run({ kind: "one" })).resolves.toBe("one");
    await expect(run({ kind: "two" })).resolves.toBe("two");
    const said = () => log.mock.calls.map((c) => String(c[0]));
    expect(said().filter((m) => m.includes("запущен"))).toHaveLength(1);
    await new Promise((r) => setTimeout(r, 700));
    expect(said().some((m) => m.includes("закрыт после простоя"))).toBe(true);
    await expect(run({ kind: "three" })).resolves.toBe("three");
    expect(said().filter((m) => m.includes("запущен"))).toHaveLength(2);
    log.mockRestore();
    vi.unstubAllEnvs();
  }, 30_000);

  it("переполнение кучи — ошибка задачи, процесс жив, следующая задача идёт в новом потоке", async () => {
    vi.resetModules();
    vi.stubEnv("PDF_WORKER_FILE", file);
    vi.stubEnv("PDF_WORKER_HEAP_MB", "32");
    vi.stubEnv("PDF_WORKER", "");
    const { inPdfThread } = await import("@/modules/production/infrastructure/pdf/pool");
    const run = inPdfThread as unknown as (job: { kind: string }) => Promise<unknown>;
    await expect(run({ kind: "boom" })).rejects.toThrow(/memory|exited/i);
    await expect(run({ kind: "after" })).resolves.toBe("after");
    vi.unstubAllEnvs();
  }, 60_000);
});
