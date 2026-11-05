import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it, vi } from "vitest";
import { backgroundInWorker } from "@/server/background";

// Процесс mybook-worker (ADR 0009): кто запускает фон и как PM2-конфиг включает/выключает воркер.

describe("фон сайта: здесь или в mybook-worker", () => {
  it("сайт запускает фон сам, пока PM2 не сказал, что есть воркер", () => {
    expect(backgroundInWorker({})).toBe(false);
    expect(backgroundInWorker({ MYBOOK_BACKGROUND: "inline" })).toBe(false);
    expect(backgroundInWorker({ MYBOOK_BACKGROUND: "worker" })).toBe(true);
  });
});

describe("deploy/ecosystem.config.cjs", () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "mybook-eco-"));
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  const apps = (env: Record<string, string>) => {
    const out = execFileSync(
      process.execPath,
      ["-e", 'const c = require("./deploy/ecosystem.config.cjs"); console.log(JSON.stringify(c.apps.map((a) => ({ name: a.name, bg: a.env && a.env.MYBOOK_BACKGROUND }))))'],
      { env: { PATH: process.env.PATH, MYBOOK_RELEASES_DIR: dir, MYBOOK_SIDECARS_DIR: path.join(dir, "none"), ...env } as unknown as NodeJS.ProcessEnv, encoding: "utf8" },
    );
    return JSON.parse(out) as { name: string; bg?: string }[];
  };

  it("релиз без worker.mjs (откат на старый релиз) — всё в одном процессе, как раньше", () => {
    expect(apps({})).toEqual([{ name: "mybook" }]);
  });

  it("релиз с worker.mjs — сайт без фона и отдельный mybook-worker", () => {
    mkdirSync(path.join(dir, "current"), { recursive: true });
    writeFileSync(path.join(dir, "current", "worker.mjs"), "");
    expect(apps({})).toEqual([{ name: "mybook", bg: "worker" }, { name: "mybook-worker" }]);
  });

  it("MYBOOK_WORKER=off — фон возвращается в процесс сайта", () => {
    expect(apps({ MYBOOK_WORKER: "off" })).toEqual([{ name: "mybook" }]);
  });
});

describe("заглушка next/* в воркере", () => {
  it("after() бросает, как Next вне запроса, — runInBackground выполняет задачу сразу", async () => {
    // @ts-expect-error -- .mjs без типов
    const shim = await import("../scripts/worker-next-shim.mjs");
    expect(() => shim.after(() => {})).toThrow(/mybook-worker/);
    vi.doMock("next/server", () => shim);
    const { runInBackground } = await import("@/shared/infrastructure/background");
    const task = vi.fn(async () => {});
    runInBackground(task);
    expect(task).toHaveBeenCalledTimes(1);
    vi.doUnmock("next/server");
  });
});
