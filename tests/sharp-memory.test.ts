import { createRequire } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";
import { configureSharpMemory } from "@/shared/infrastructure/sharpMemory";

// ADR 0010: кэш libvips выключен для обеих сборок sharp — более поздняя загрузка любой из них его не включит.
type Stats = { memory: { max: number }; items: { max: number } };
type SharpCache = { cache(options?: boolean): Stats };

describe("память sharp", () => {
  it("после настройки кэш libvips выключен в обеих сборках (CommonJS и ES-модуль)", async () => {
    const req = createRequire(path.join(process.cwd(), "package.json"));
    const cjs = req("sharp") as SharpCache;
    const esm = ((await import(pathToFileURL(path.join(path.dirname(req.resolve("sharp")), "index.mjs")).href)) as { default: SharpCache }).default;
    cjs.cache(true);
    expect(esm.cache().items.max).toBe(100);
    await configureSharpMemory();
    expect(cjs.cache().items.max).toBe(0);
    expect(esm.cache().memory.max).toBe(0);
  });

  it("нет sharp рядом — тихо ничего не делает", async () => {
    await expect(configureSharpMemory("/")).resolves.toBeUndefined();
  });
});
