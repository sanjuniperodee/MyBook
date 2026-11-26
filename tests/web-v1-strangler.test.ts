import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ParityError } from "@/server/parity";
import { apiInternalUrl, createWebApiClient, v1WebRead, webUseApiV1 } from "@/server/v1-web-client";

/**
 * ADR 0012 §4 (A5, душитель): ни один НОВЫЙ файл в `src/app/**` не должен импортировать `@/server/container`
 * или `@/modules/*` напрямую — новые страницы, действия и маршруты работают через API v1.
 * Существующие файлы зафиксированы в `tests/web-v1-strangler-allowlist.json` — список только сокращается.
 * Обновить после переноса файла на API v1:
 *   UPDATE_V1_STRANGLER_ALLOWLIST=1 npx vitest run tests/web-v1-strangler.test.ts
 */

const APP_ROOT = "src/app";
const ALLOWLIST_PATH = path.join(__dirname, "web-v1-strangler-allowlist.json");
const DIRECT_BACKEND = /^(@\/server\/container|@\/modules\/)/;

function walkTs(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) return walkTs(p);
    return /\.(ts|tsx)$/.test(entry.name) ? [p] : [];
  });
}

/** Значения (не `import type`), импортированные напрямую из `@/server/container` или `@/modules/*`. */
export function directBackendImports(source: string): string[] {
  const found: string[] = [];
  for (const m of source.matchAll(/^import\s+(type\s+)?([^;]*?)\s+from\s+["']([^"']+)["']/gm)) {
    if (!m[1] && DIRECT_BACKEND.test(m[3])) found.push(m[3]);
  }
  for (const m of source.matchAll(/\bimport\(\s*["']([^"']+)["']\s*\)/g)) {
    if (DIRECT_BACKEND.test(m[1])) found.push(m[1]);
  }
  return found;
}

describe("храповик душителя web → API v1 (ADR 0012 §4)", () => {
  const current = walkTs(APP_ROOT)
    .filter((f) => directBackendImports(readFileSync(f, "utf8")).length > 0)
    .sort();

  if (process.env.UPDATE_V1_STRANGLER_ALLOWLIST === "1") {
    writeFileSync(ALLOWLIST_PATH, `${JSON.stringify(current, null, 2)}\n`);
  }

  const allowlist: string[] = JSON.parse(readFileSync(ALLOWLIST_PATH, "utf8"));

  it("в src/app/** не появился новый файл с прямым импортом @/server/container или @/modules/*", () => {
    const added = current.filter((f) => !allowlist.includes(f));
    expect(added).toEqual([]);
  });

  it("список исключений только сокращается: файлы без прямого импорта убраны из allowlist", () => {
    const stale = allowlist.filter((f) => !current.includes(f));
    expect(stale).toEqual([]);
  });

  it("детектор ловит статические, многострочные и динамические импорты, но игнорирует import type", () => {
    expect(directBackendImports('import "server-only";\nimport type { Book } from "@/modules/authoring";')).toEqual([]);
    expect(directBackendImports('import { container } from "@/server/container";')).toEqual(["@/server/container"]);
    expect(directBackendImports('import {\n  isBookEditableBy,\n} from "@/modules/authoring";')).toEqual(["@/modules/authoring"]);
    expect(directBackendImports('const mod = await import("@/server/container");')).toEqual(["@/server/container"]);
  });
});

describe("серверный TS-клиент API v1 (src/server/v1-web-client.ts)", () => {
  beforeEach(() => {
    vi.stubEnv("DATABASE_URL", "postgres://test/mybook");
    vi.stubEnv("WEB_API_ONLY", "");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("webUseApiV1: по умолчанию выключен, понимает 1/true/on и список разделов", () => {
    expect(webUseApiV1(undefined, undefined)).toBe(false);
    expect(webUseApiV1("cabinet", "0")).toBe(false);
    expect(webUseApiV1("cabinet", "off")).toBe(false);
    expect(webUseApiV1("cabinet", "1")).toBe(true);
    expect(webUseApiV1("shelf", "true")).toBe(true);
    expect(webUseApiV1("cabinet", "cabinet,shelf")).toBe(true);
    expect(webUseApiV1("shelf", "cabinet,shelf")).toBe(true);
    expect(webUseApiV1("orders", "cabinet,shelf")).toBe(false);
    expect(webUseApiV1(undefined, "cabinet")).toBe(false);
  });

  it("apiInternalUrl: берёт API_INTERNAL_URL или 127.0.0.1:API_PORT (3044)", () => {
    expect(apiInternalUrl("http://127.0.0.1:3099/", undefined)).toBe("http://127.0.0.1:3099");
    expect(apiInternalUrl(undefined, "3055")).toBe("http://127.0.0.1:3055");
    expect(apiInternalUrl(undefined, undefined)).toBe("http://127.0.0.1:3044");
  });

  it("createWebApiClient пробрасывает cookie mb_session и Accept-Language на API_INTERNAL_URL", async () => {
    const calls: { url: string; headers: Headers }[] = [];
    const fakeFetch: typeof fetch = async (input, init) => {
      calls.push({ url: String(input), headers: new Headers(init?.headers) });
      return Response.json({ books: [] });
    };
    const client = createWebApiClient({
      baseUrl: "http://127.0.0.1:3044",
      sessionCookie: "tok_abc123",
      locale: "kk",
      fetch: fakeFetch,
    });
    const out = await client.booksList({});
    expect(out).toEqual({ books: [] });
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("http://127.0.0.1:3044/api/v1/books");
    expect(calls[0].headers.get("cookie")).toBe("mb_session=tok_abc123");
    expect(calls[0].headers.get("authorization")).toBe("Bearer tok_abc123");
    expect(calls[0].headers.get("accept-language")).toBe("kk");
  });

  it("v1WebRead: при выключенном флаге и parity=off идёт только local() без сетевых вызовов", async () => {
    const local = vi.fn(async () => ({ items: ["a"] }));
    const viaApi = vi.fn(async () => ({ items: ["b"] }));
    const res = await v1WebRead({ name: "test.off", section: "cabinet", local, viaApi, flag: "0", parity: "off" });
    expect(res).toEqual({ items: ["a"] });
    expect(local).toHaveBeenCalledTimes(1);
    expect(viaApi).not.toHaveBeenCalled();
  });

  it("v1WebRead: при выключенном флаге и parity=shadow сверяет с API v1 и логирует расхождение, но возвращает local", async () => {
    const warn = vi.fn();
    const local = vi.fn(async () => ({ count: 1 }));
    const viaApi = vi.fn(async () => ({ count: 2 }));
    const client = createWebApiClient({ fetch: async () => Response.json({}) });
    const res = await v1WebRead({ name: "test.shadow", section: "cabinet", local, viaApi, flag: "0", parity: "shadow", client, logger: { warn } });
    expect(res).toEqual({ count: 1 });
    expect(viaApi).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalled();
  });

  it("v1WebRead: при включённом флаге читает через API v1, а при сбое в не-strict режиме безопасно откатывается на local", async () => {
    const warn = vi.fn();
    const client = createWebApiClient({ fetch: async () => Response.json({}) });

    const okRes = await v1WebRead({
      name: "test.on",
      section: "cabinet",
      local: async () => ({ src: "local" }),
      viaApi: async () => ({ src: "api" }),
      flag: "cabinet",
      parity: "off",
      client,
      logger: { warn },
    });
    expect(okRes).toEqual({ src: "api" });
    expect(warn).not.toHaveBeenCalled();

    const fallbackRes = await v1WebRead({
      name: "test.fallback",
      section: "cabinet",
      local: async () => ({ src: "local" }),
      viaApi: async () => {
        throw new Error("ECONNREFUSED");
      },
      flag: "1",
      parity: "off",
      client,
      logger: { warn },
    });
    expect(fallbackRes).toEqual({ src: "local" });
    expect(warn).toHaveBeenCalled();
  });

  it("v1WebRead: при включённом флаге и parity=strict бросает ParityError на расхождении и возвращает API при совпадении", async () => {
    const client = createWebApiClient({ fetch: async () => Response.json({}) });
    const warn = vi.fn();

    const matched = await v1WebRead({
      name: "test.strict.ok",
      section: "shelf",
      local: async () => ({ books: [{ id: "1" }] }),
      viaApi: async () => ({ books: [{ id: "1" }] }),
      flag: "shelf",
      parity: "strict",
      client,
      logger: { warn },
    });
    expect(matched).toEqual({ books: [{ id: "1" }] });
    expect(warn).not.toHaveBeenCalled();

    await expect(
      v1WebRead({
        name: "test.strict.diff",
        section: "shelf",
        local: async () => ({ books: [{ id: "1" }] }),
        viaApi: async () => ({ books: [{ id: "2" }] }),
        flag: "shelf",
        parity: "strict",
        client,
        logger: { warn },
      }),
    ).rejects.toSatisfy((err: unknown) => ParityError.is(err));
  });
});
