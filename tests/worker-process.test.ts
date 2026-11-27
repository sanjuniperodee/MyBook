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
  // Релиз со старым сайтом (server.js): с 27.11 бэкенд собирается без Next, и без server.js процесса сайта нет.
  mkdirSync(path.join(dir, "current"), { recursive: true });
  writeFileSync(path.join(dir, "current", "server.js"), "");

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

  it("релиз с bin/mybook-files (пилот G3) — отдельный mybook-files; MYBOOK_FILES=off — без него", () => {
    mkdirSync(path.join(dir, "current", "bin"), { recursive: true });
    writeFileSync(path.join(dir, "current", "bin", "mybook-files"), "");
    expect(apps({}).map((a) => a.name)).toEqual(["mybook", "mybook-worker", "mybook-files"]);
    expect(apps({ MYBOOK_FILES: "off" }).map((a) => a.name)).toEqual(["mybook", "mybook-worker"]);
    rmSync(path.join(dir, "current", "bin"), { recursive: true, force: true });
  });

  const preload = (env: Record<string, string>) => {
    const out = execFileSync(
      process.execPath,
      ["-e", 'const c = require("./deploy/ecosystem.config.cjs"); console.log(JSON.stringify(c.apps.filter((a) => a.name.startsWith("mybook")).map((a) => [a.name, a.env.LD_PRELOAD || null, a.env.MALLOC_CONF || null])))'],
      { env: { PATH: process.env.PATH, MYBOOK_RELEASES_DIR: dir, MYBOOK_SIDECARS_DIR: path.join(dir, "none"), ...env } as unknown as NodeJS.ProcessEnv, encoding: "utf8" },
    );
    return JSON.parse(out) as [string, string | null, string | null][];
  };

  it("jemalloc (ADR 0010): есть библиотека — сайт и воркер с LD_PRELOAD, нет или off — обычный malloc", () => {
    const lib = path.join(dir, "libjemalloc.so.2");
    writeFileSync(lib, "");
    const on = preload({ MYBOOK_JEMALLOC: lib });
    expect(on.map(([name]) => name)).toEqual(["mybook", "mybook-worker"]);
    for (const [, ld, conf] of on) {
      expect(ld).toBe(lib);
      expect(conf).toMatch(/background_thread:true/);
    }
    expect(preload({ MYBOOK_JEMALLOC: path.join(dir, "missing.so") }).every(([, ld]) => ld === null)).toBe(true);
    expect(preload({ MYBOOK_JEMALLOC: "off" }).every(([, ld]) => ld === null)).toBe(true);
  });
});

describe("задача после ответа вне запроса", () => {
  it("after() вне HTTP-запроса бросает — runInBackground выполняет задачу сразу (воркер, планировщик)", async () => {
    const { after } = await import("@/shared/infrastructure/http/request");
    expect(() => after(() => {})).toThrow(/outside an HTTP request/);
    const { runInBackground } = await import("@/shared/infrastructure/background");
    const task = vi.fn(async () => {});
    runInBackground(task);
    expect(task).toHaveBeenCalledTimes(1);
  });
});
