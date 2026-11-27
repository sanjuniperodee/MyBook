import { Test } from "@nestjs/testing";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WorkerModule } from "../src/worker/worker.module";
import { WORKER_PORTS, type WorkerPorts } from "../src/worker/worker.tokens";

/** Воркер на Nest (ADR 0014, шаг 6): тот же фон, что у прежнего mybook-worker, в жизненном цикле standalone-приложения. */
describe("процесс-воркер на Nest", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  async function boot(ports: WorkerPorts) {
    const ref = await Test.createTestingModule({ imports: [WorkerModule] }).overrideProvider(WORKER_PORTS).useValue(ports).compile();
    return ref;
  }

  it("при старте: подготовка → ждём миграции → запуск фона, по порядку и по разу", async () => {
    const calls: string[] = [];
    const ports: WorkerPorts = {
      prepare: async () => void calls.push("prepare"),
      waitForMigrations: async () => {
        await new Promise((r) => setTimeout(r, 5));
        calls.push("migrations");
      },
      start: async () => void calls.push("start"),
    };
    const ref = await boot(ports);
    await ref.init();
    expect(calls).toEqual(["prepare", "migrations", "start"]);
    const exit = vi.spyOn(process, "exit").mockImplementation((() => undefined) as never);
    vi.useFakeTimers();
    await ref.close();
    vi.advanceTimersByTime(2_000);
    expect(exit).toHaveBeenCalledWith(0);
  });

  it("сбой запуска фона — ошибка старта (PM2 перезапустит, выкатка вернёт прежний worker.mjs)", async () => {
    const ports: WorkerPorts = {
      prepare: async () => {},
      waitForMigrations: async () => {},
      start: async () => {
        throw new Error("db down");
      },
    };
    const ref = await boot(ports);
    await expect(ref.init()).rejects.toThrow("db down");
    vi.spyOn(process, "exit").mockImplementation((() => undefined) as never);
    await ref.close();
  });
});
