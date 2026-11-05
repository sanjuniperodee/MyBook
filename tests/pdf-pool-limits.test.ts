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
