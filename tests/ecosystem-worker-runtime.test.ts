import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";

/**
 * С ADR 0014 (шаг 6) фон mybook-worker запускает процесс на Nest (backend-worker.mjs), если он есть в релизе; прежний
 * worker.mjs — запасной: файл-флаг ~/mybook-flags/worker-runtime со словом legacy или MYBOOK_WORKER_RUNTIME=legacy.
 */
const dir = mkdtempSync(path.join(tmpdir(), "mybook-worker-runtime-"));
const releases = path.join(dir, "releases");
const flags = path.join(dir, "flags");
const current = path.join(releases, "current");
mkdirSync(current, { recursive: true });
mkdirSync(flags, { recursive: true });
writeFileSync(path.join(current, "worker.mjs"), "");
afterAll(() => rmSync(dir, { recursive: true, force: true }));

function workerScript(env: Record<string, string> = {}): string | null {
  const out = execFileSync(
    process.execPath,
    ["-e", 'const w = require("./deploy/ecosystem.config.cjs").apps.find((a) => a.name === "mybook-worker"); console.log(JSON.stringify(w ? w.script : null))'],
    { env: { NODE_ENV: "test", PATH: process.env.PATH ?? "", MYBOOK_RELEASES_DIR: releases, MYBOOK_FLAGS_DIR: flags, ...env }, encoding: "utf8" },
  );
  return JSON.parse(out) as string | null;
}

describe("процесс фона mybook-worker в PM2-конфиге", () => {
  it("в релизе нет backend-worker.mjs — прежний worker.mjs", () => {
    expect(workerScript()).toBe("worker.mjs");
  });

  it("есть backend-worker.mjs — воркер на Nest", () => {
    writeFileSync(path.join(current, "backend-worker.mjs"), "");
    expect(workerScript()).toBe("backend-worker.mjs");
  });

  it("откат флагом worker-runtime = legacy или MYBOOK_WORKER_RUNTIME=legacy — прежний worker.mjs", () => {
    expect(workerScript({ MYBOOK_WORKER_RUNTIME: "legacy" })).toBe("worker.mjs");
    writeFileSync(path.join(flags, "worker-runtime"), "legacy\n");
    try {
      expect(workerScript()).toBe("worker.mjs");
    } finally {
      rmSync(path.join(flags, "worker-runtime"));
    }
  });

  it("MYBOOK_WORKER=off — фона в отдельном процессе нет вовсе", () => {
    expect(workerScript({ MYBOOK_WORKER: "off" })).toBe(null);
  });

  it("прежний mybook-api по умолчанию не запускается (весь API — mybook-backend на Nest), MYBOOK_API=on — запускается", () => {
    writeFileSync(path.join(current, "api.mjs"), "");
    const names = (env: Record<string, string> = {}) =>
      JSON.parse(
        execFileSync(process.execPath, ["-e", 'console.log(JSON.stringify(require("./deploy/ecosystem.config.cjs").apps.map((a) => a.name)))'], {
          env: { NODE_ENV: "test", PATH: process.env.PATH ?? "", MYBOOK_RELEASES_DIR: releases, MYBOOK_FLAGS_DIR: flags, ...env },
          encoding: "utf8",
        }),
      ) as string[];
    expect(names()).not.toContain("mybook-api");
    expect(names({ MYBOOK_API: "on" })).toContain("mybook-api");
  });
});
