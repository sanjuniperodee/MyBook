import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { legacyAuth, nestApi, siteRouteMissing, type ApiFetch } from "./api";
import { v1SiteProxy, v1SiteTargetUrl } from "@/server/v1-proxy";
import { runInApiServer } from "@/server/v1-web-client";
import { HttpError } from "@/server/api";

vi.mock("@/server/auth", () => ({
  getCurrentUser: async () => null,
  sessionToken: async () => null,
  isStaff: () => false,
}));
vi.mock("@/i18n/server", async (orig) => ({
  ...(await orig<object>()),
  getMessages: async () => ({ api: (await import("@/i18n/messages/ru/api")).api }),
  getLocale: async () => "ru",
}));

const ID1 = "11111111-2222-4333-8444-555555555555";
const ID2 = "22222222-3333-4444-8555-666666666666";

const fakeAuth = {
  user: async () => {
    throw new HttpError(401, "unauthorized");
  },
  staff: async () => {
    throw new HttpError(403, "forbidden");
  },
};

describe("потоковый прокси Next → API (src/server/v1-proxy.ts)", () => {
  beforeEach(() => {
    vi.stubEnv("DATABASE_URL", "postgres://test/mybook");
    vi.stubEnv("WEB_API_ONLY", "");
    vi.stubEnv("WEB_USE_API_V1", "");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("строит адрес /api/v1/site/... с сохранением query и нормализацией API_INTERNAL_URL", () => {
    expect(v1SiteTargetUrl(`https://mybooks.kz/api/books/${ID1}/photos?foo=1`, "http://127.0.0.1:3044")).toBe(
      `http://127.0.0.1:3044/api/v1/site/books/${ID1}/photos?foo=1`,
    );
    expect(v1SiteTargetUrl(`https://preview.vercel.app/api/photos/${ID1}?size=full`, "https://mybooks.kz/api/v1")).toBe(
      `https://mybooks.kz/api/v1/site/photos/${ID1}?size=full`,
    );
    expect(v1SiteTargetUrl("https://preview.vercel.app/api/covers/blossom-a5.svg", "https://mybooks.kz/api/v1/")).toBe(
      "https://mybooks.kz/api/v1/site/covers/blossom-a5.svg",
    );
  });

  it("при выключенном флаге вызывает localLoader без сетевого fetch", async () => {
    const fetchSpy = vi.fn();
    const localLoader = vi.fn(async () => Response.json({ src: "local" }));
    const req = new Request(`https://mybooks.kz/api/books/${ID1}`, { method: "PATCH", body: "{}" });

    const res = await v1SiteProxy("book", req, localLoader, { fetch: fetchSpy, flag: "0" });
    expect(await res.json()).toEqual({ src: "local" });
    expect(localLoader).toHaveBeenCalledTimes(1);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("внутри runInApiServer не делает сетевого проксирования и не зацикливается даже при WEB_API_ONLY=1", async () => {
    vi.stubEnv("WEB_API_ONLY", "1");
    const fetchSpy = vi.fn();
    const localLoader = vi.fn(async () => Response.json({ inside: true }));
    const req = new Request(`http://127.0.0.1:3044/api/books/${ID1}/build`);

    const res = await runInApiServer(() => v1SiteProxy("book", req, localLoader, { fetch: fetchSpy }));
    expect(await res.json()).toEqual({ inside: true });
    expect(localLoader).toHaveBeenCalledTimes(1);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("проксирует POST/PUT строго потоком (body: req.body, duplex: half) без req.arrayBuffer() и req.formData()", async () => {
    const chunks = [new TextEncoder().encode("chunk-1-"), new TextEncoder().encode("chunk-2")];
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        for (const c of chunks) controller.enqueue(c);
        controller.close();
      },
    });
    const req = new Request(`https://preview.vercel.app/api/books/${ID1}/files/${ID2}?offset=0`, {
      method: "PUT",
      headers: {
        host: "preview.vercel.app",
        origin: "https://preview.vercel.app",
        cookie: "mb_session=tok_stream_123; mb_locale=kk",
        "content-type": "application/octet-stream",
        "content-length": "15",
        "accept-language": "kk",
        "x-forwarded-for": "1.2.3.4, 91.201.214.5",
      },
      body: stream,
      // @ts-expect-error duplex обязателен для потокового тела в Node
      duplex: "half",
    });

    const arrayBufferSpy = vi.spyOn(req, "arrayBuffer");
    const formDataSpy = vi.spyOn(req, "formData");
    const textSpy = vi.spyOn(req, "text");

    let capturedUrl = "";
    let capturedInit: (RequestInit & { duplex?: string }) | undefined;
    let receivedText = "";

    const fakeFetch: typeof fetch = async (input, init) => {
      capturedUrl = String(input);
      capturedInit = init as RequestInit & { duplex?: string };
      expect(init?.body).toBe(req.body);
      // Читаем поток на стороне upstream (как это делает API).
      receivedText = await new Response(init?.body).text();
      return new Response(JSON.stringify({ received: 15 }), {
        status: 200,
        headers: {
          "content-type": "application/json",
          "transfer-encoding": "chunked",
          connection: "keep-alive, x-custom-hop",
          "keep-alive": "timeout=5",
          "x-custom-hop": "drop-me",
          "x-preserved": "ok",
        },
      });
    };

    const localLoader = vi.fn(async () => Response.json({ local: true }));
    const res = await v1SiteProxy("book", req, localLoader, {
      baseUrl: "https://mybooks.kz/api/v1",
      fetch: fakeFetch,
      flag: "book",
    });

    expect(localLoader).not.toHaveBeenCalled();
    expect(arrayBufferSpy).not.toHaveBeenCalled();
    expect(formDataSpy).not.toHaveBeenCalled();
    expect(textSpy).not.toHaveBeenCalled();

    expect(capturedUrl).toBe(`https://mybooks.kz/api/v1/site/books/${ID1}/files/${ID2}?offset=0`);
    expect(capturedInit?.duplex).toBe("half");
    expect(receivedText).toBe("chunk-1-chunk-2");

    const sentHeaders = new Headers(capturedInit?.headers);
    expect(sentHeaders.get("cookie")).toBe("mb_session=tok_stream_123; mb_locale=kk");
    expect(sentHeaders.get("authorization")).toBe("Bearer tok_stream_123");
    expect(sentHeaders.get("content-type")).toBe("application/octet-stream");
    expect(sentHeaders.get("content-length")).toBe("15");
    expect(sentHeaders.get("accept-language")).toBe("kk");
    expect(sentHeaders.get("x-real-ip")).toBe("91.201.214.5");
    // Origin проверяется на границе Next и не пробрасывается на другой домен API.
    expect(sentHeaders.get("origin")).toBeNull();

    expect(res.status).toBe(200);
    expect(res.headers.get("transfer-encoding")).toBeNull();
    expect(res.headers.get("connection")).toBeNull();
    expect(res.headers.get("keep-alive")).toBeNull();
    expect(res.headers.get("x-custom-hop")).toBeNull();
    expect(res.headers.get("x-preserved")).toBe("ok");
    expect(await res.json()).toEqual({ received: 15 });
  });

  it("пробрасывает Range / If-None-Match и корректно возвращает 206 и 304", async () => {
    const fakeFetch: typeof fetch = async (_input, init) => {
      const h = new Headers(init?.headers);
      if (h.get("if-none-match") === '"etag-1"') {
        return new Response(null, { status: 304, headers: { etag: '"etag-1"', "cache-control": "private, no-cache" } });
      }
      expect(h.get("range")).toBe("bytes=0-3");
      return new Response("abcd", {
        status: 206,
        headers: { "content-type": "image/jpeg", "content-range": "bytes 0-3/10", etag: '"etag-1"' },
      });
    };

    const res206 = await v1SiteProxy(
      "book",
      new Request(`https://mybooks.kz/api/photos/${ID1}?size=full`, { headers: { range: "bytes=0-3", cookie: "mb_session=tok_1" } }),
      async () => new Response("local"),
      { fetch: fakeFetch, flag: "book" },
    );
    expect(res206.status).toBe(206);
    expect(res206.headers.get("content-range")).toBe("bytes 0-3/10");
    expect(await res206.text()).toBe("abcd");

    const res304 = await v1SiteProxy(
      "book",
      new Request(`https://mybooks.kz/api/photos/${ID1}?size=full`, { headers: { "if-none-match": '"etag-1"' } }),
      async () => new Response("local"),
      { fetch: fakeFetch, flag: "book" },
    );
    expect(res304.status).toBe(304);
    expect(res304.headers.get("etag")).toBe('"etag-1"');
  });

  it("блокирует чужой Origin на изменяющем запросе (403) до обращения к API", async () => {
    const fetchSpy = vi.fn();
    const res = await v1SiteProxy(
      "book",
      new Request(`https://mybooks.kz/api/books/${ID1}`, {
        method: "PATCH",
        headers: { host: "mybooks.kz", origin: "https://evil.example", "content-type": "application/json" },
        body: "{}",
      }),
      async () => Response.json({ local: true }),
      { fetch: fetchSpy, flag: "book" },
    );
    expect(res.status).toBe(403);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("в режиме webApiOnly() (без DATABASE_URL) проксирует даже без WEB_USE_API_V1", async () => {
    vi.stubEnv("DATABASE_URL", "");
    const localLoader = vi.fn(async () => Response.json({ local: true }));
    const fakeFetch: typeof fetch = async () => Response.json({ viaApi: true });

    const res = await v1SiteProxy("book", new Request(`https://preview.vercel.app/api/books/${ID1}/build`), localLoader, {
      fetch: fakeFetch,
    });
    expect(await res.json()).toEqual({ viaApi: true });
    expect(localLoader).not.toHaveBeenCalled();
  });
});

describe("маршрутизация /api/v1/site/* в бэкенде на Nest", () => {
  let app: ApiFetch;
  beforeAll(async () => {
    app = await nestApi({ auth: legacyAuth(fakeAuth) });
  });

  it("регистрирует все маршруты Раздела 2 (книга и медиа) по обоим префиксам; статика сильнее параметров (Fastify)", () => {
    const paths = [
      "/api/books/{id}",
      "/api/books/{id}/build",
      "/api/books/{id}/build-progress",
      "/api/books/{id}/chapters",
      "/api/books/{id}/chapters/order",
      "/api/books/{id}/chapters/move",
      "/api/books/{id}/chapters/{key}",
      "/api/books/{id}/questions",
      "/api/books/{id}/questions/order",
      "/api/books/{id}/questions/{qid}/move",
      "/api/books/{id}/questions/{qid}",
      "/api/books/{id}/photos",
      "/api/books/{id}/photos/order",
      "/api/books/{id}/photos/batch",
      "/api/books/{id}/photos/{pid}/edit",
      "/api/books/{id}/photos/{pid}/rotate",
      "/api/books/{id}/photos/{pid}",
      "/api/books/{id}/layout",
      "/api/books/{id}/letters/invite",
      "/api/books/{id}/letters/order",
      "/api/books/{id}/letters/{lid}",
      "/api/books/{id}/files",
      "/api/books/{id}/files/packs",
      "/api/books/{id}/files/{fileId}",
      "/api/books/{id}/export",
      "/api/books/{id}/preview",
      "/api/books/{id}/pages/{fp}/{n}",
      "/api/books/{id}/pages-image",
      "/api/books/{id}/cover-image",
      "/api/books/{id}/cover-thumb/{template}",
      "/api/books/{id}/help",
      "/api/books/{id}/design-ai",
      "/api/books/{id}/proofread/ai",
      "/api/books/{id}/proofread/spell",
      "/api/books/{id}/write/ai",
      "/api/photos/{id}",
      "/api/covers/{file}",
      "/api/cover-photos/{key}",
    ];
    expect(siteRouteMissing(app, paths)).toEqual([]);
  });

  it("бэкенд отвечает на /api/v1/site/* маршрутами сайта без бесконечной рекурсии", async () => {
    const coverRes = await app(new Request("http://127.0.0.1:3044/api/v1/site/covers/blossom-a5.svg"));
    expect(coverRes.status).toBe(200);
    expect(coverRes.headers.get("content-type")).toContain("image/svg+xml");

    const missingCover = await app(new Request("http://127.0.0.1:3044/api/v1/site/covers/nope-a5.svg"));
    expect(missingCover.status).toBe(404);

    const bookRes = await app(new Request(`http://127.0.0.1:3044/api/v1/site/books/${ID1}/files/packs`, { method: "POST", body: "{}" }));
    expect(bookRes.status).toBe(401);

    const editRes = await app(new Request(`http://127.0.0.1:3044/api/v1/site/books/${ID1}/photos/${ID2}/edit`, { method: "GET" }));
    expect(editRes.status).toBe(401);

    const unknownRes = await app(new Request("http://127.0.0.1:3044/api/v1/site/not-a-real-route"));
    expect(unknownRes.status).toBe(404);
  });

  it("сквозной прокси v1SiteProxy → бэкенд (/api/v1/site/covers/...) возвращает обложку без петли", async () => {
    const res = await v1SiteProxy(
      "book",
      new Request("https://preview.vercel.app/api/covers/blossom-a5.svg"),
      async () => {
        throw new Error("localLoader must not be called when proxying");
      },
      {
        flag: "book",
        baseUrl: "http://127.0.0.1:3044",
        fetch: async (input, init) => app(new Request(String(input), init)),
      },
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("image/svg+xml");
    expect(await res.text()).toContain("<svg");
  });
});
