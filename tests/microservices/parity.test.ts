import { afterEach, describe, expect, it, vi } from "vitest";
import { ParityError, createHttpTransport, createInProcessTransport, parityCall, parityMode, resolveMethod } from "@/server/parity";
import { diffValues, normalize } from "@/shared/parity/normalize";

describe("normalize", () => {
  it("Date → ISO, ключи по алфавиту, массивы сохраняют порядок", () => {
    const value = normalize({ b: 1, a: new Date("2026-11-05T05:00:00.000Z"), list: [{ z: 1, y: 2 }] });
    expect(JSON.stringify(value)).toBe('{"a":"2026-11-05T05:00:00.000Z","b":1,"list":[{"y":2,"z":1}]}');
  });

  it("BigInt и нечисловые числа приводятся к строкам", () => {
    expect(normalize({ n: 10n, inf: Infinity })).toEqual({ inf: "Infinity", n: "10" });
  });
});

describe("diffValues", () => {
  it("равные значения — без отличий", () => {
    expect(diffValues({ a: [1, 2] }, { a: [1, 2] })).toEqual([]);
  });

  it("находит вложенное поле и длину массива", () => {
    const diffs = diffValues({ a: [{ b: 1 }] }, { a: [{ b: 2 }, { b: 3 }] });
    expect(diffs.map((d) => d.path)).toContain("$.a[0].b");
    expect(diffs.map((d) => d.path)).toContain("$.a.length");
  });
});

describe("in-process transport", () => {
  const root = {
    value: 2,
    get() {
      return this.value;
    },
    math: {
      add(a: number, b: number) {
        return a + b;
      },
      nested: { double: (x: number) => x * 2 },
    },
  };

  it("вызывает вложенный метод с правильным this", async () => {
    const transport = createInProcessTransport(root);
    expect(await transport.call("math.add", [2, 3])).toBe(5);
    expect(await transport.call("get", [])).toBe(2);
    expect(await transport.call("math.nested.double", [4])).toBe(8);
  });

  it("понятно падает на несуществующем пути", () => {
    expect(() => resolveMethod(root, "math.nope")).toThrow(/not found/);
    expect(() => resolveMethod(root, "value")).toThrow(/not a function/);
  });
});

describe("parityCall", () => {
  const logger = { warn: vi.fn() };

  afterEach(() => {
    vi.unstubAllEnvs();
    logger.warn.mockClear();
  });

  it("parityMode понимает только off/shadow/strict", () => {
    expect(parityMode(undefined)).toBe("off");
    expect(parityMode("shadow")).toBe("shadow");
    expect(parityMode("strict")).toBe("strict");
    expect(parityMode("garbage")).toBe("off");
  });

  it("off не зовёт remote", async () => {
    vi.stubEnv("PARITY_MODE", "off");
    const remote = { call: vi.fn() };
    await expect(parityCall("x", [], async () => 1, remote, logger)).resolves.toBe(1);
    expect(remote.call).not.toHaveBeenCalled();
  });

  it("shadow возвращает локальный ответ и пишет расхождение", async () => {
    vi.stubEnv("PARITY_MODE", "shadow");
    const remote = { call: vi.fn(async () => ({ a: 2 })) };
    const result = await parityCall("reporting.dealCard", [], async () => ({ a: 1 }), remote, logger);
    expect(result).toEqual({ a: 1 });
    expect(logger.warn).toHaveBeenCalledTimes(1);
    expect(String(logger.warn.mock.calls[0][0])).toContain("1 mismatch");
  });

  it("shadow не шумит, если ответы совпали", async () => {
    vi.stubEnv("PARITY_MODE", "shadow");
    const remote = { call: vi.fn(async () => ({ a: 1, d: "2026-11-05T05:00:00.000Z" })) };
    const result = await parityCall("x", [], async () => ({ a: 1, d: new Date("2026-11-05T05:00:00.000Z") }), remote, logger);
    expect(result).toEqual({ a: 1, d: new Date("2026-11-05T05:00:00.000Z") });
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it("strict падает ParityError при расхождении", async () => {
    vi.stubEnv("PARITY_MODE", "strict");
    const remote = { call: async () => ({ a: 2 }) };
    await expect(parityCall("x", [], async () => ({ a: 1 }), remote, logger)).rejects.toSatisfy((err) => ParityError.is(err));
  });

  it("shadow переживает падение remote, strict — нет", async () => {
    const remote = { call: async () => Promise.reject(new Error("http down")) };
    vi.stubEnv("PARITY_MODE", "shadow");
    await expect(parityCall("x", [], async () => 1, remote, logger)).resolves.toBe(1);
    vi.stubEnv("PARITY_MODE", "strict");
    await expect(parityCall("x", [], async () => 1, remote, logger)).rejects.toThrow("http down");
  });
});

describe("http transport", () => {
  it("собирается и умеет вызывать endpoint", () => {
    const transport = createHttpTransport({ baseUrl: "http://127.0.0.1:1/", token: "t" });
    expect(typeof transport.call).toBe("function");
  });
});
