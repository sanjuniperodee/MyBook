import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { ANSWER_MAX, SECTION_PROMPT_MAX, SECTION_TITLE_MAX } from "@/lib/content/kinds";
import { MAX_MEDIA } from "@/lib/book/answer-media";

// API v1 (ADR 0012): контракт первым (packages/contracts), сервер — apps/api.
vi.mock("@/i18n/server", async () => ({ getMessages: async () => ({ api: (await import("@/i18n/messages/ru/api")).api }), getLocale: async () => "ru" }));

const { v1, QuestionPatch, openapi } = await import("@mybook/contracts");
const { createApp } = await import("../apps/api/src/app");
const { createRouter } = await import("../apps/api/src/http/router");
const { handlers } = await import("../apps/api/src/routes");
const { generated } = await import("../scripts/contracts/files");
const { HttpError } = await import("@/server/api");

const BOOK = "3f2b8c1e-7a4d-4e5f-9b6c-1d2e3f4a5b6c";
const QUESTION = "8a7b6c5d-4e3f-4a1b-8c9d-0e1f2a3b4c5d";
const user = { id: "11111111-2222-4333-8444-555555555555", name: "Анна", email: "a@x.kz", phone: null, locale: "ru", role: "user", staffDisabled: false } as never;

const fakeAuth = (who: unknown = user) => ({
  user: async () => {
    if (!who) throw new HttpError(401, "unauthorized");
    return who as never;
  },
  staff: async () => {
    throw new HttpError(403, "forbidden");
  },
});

function appWith(over: Partial<typeof handlers>, who?: unknown) {
  return createApp({ ...handlers, ...over } as typeof handlers, fakeAuth(who));
}

const call = (app: ReturnType<typeof createApp>, method: string, path: string, body?: unknown) =>
  app(new Request(`http://127.0.0.1:3044${path}`, { method, headers: body ? { "content-type": "application/json" } : {}, body: body ? JSON.stringify(body) : undefined }));

describe("контракт", () => {
  it("OpenAPI и Dart-клиент сгенерированы из текущего контракта (npx tsx scripts/contracts/generate.ts)", () => {
    for (const [file, text] of Object.entries(generated())) expect(readFileSync(file, "utf8"), file).toBe(text);
  });

  it("у каждого маршрута есть обработчик, и только у них", () => {
    expect(Object.keys(handlers).sort()).toEqual(Object.keys(v1).sort());
  });

  it("лимиты автосохранения — те же, что у сайта", () => {
    const ok = (body: Record<string, unknown>) => QuestionPatch.safeParse(body).success;
    expect(ok({ answer: "а".repeat(ANSWER_MAX) })).toBe(true);
    expect(ok({ answer: "а".repeat(ANSWER_MAX + 1) })).toBe(false);
    expect(ok({ title: "а".repeat(SECTION_TITLE_MAX) })).toBe(true);
    expect(ok({ title: "а".repeat(SECTION_TITLE_MAX + 1) })).toBe(false);
    expect(ok({ prompt: "а".repeat(SECTION_PROMPT_MAX) })).toBe(true);
    expect(ok({ prompt: "а".repeat(SECTION_PROMPT_MAX + 1) })).toBe(false);
    const media = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `m${i}`, kind: "video", url: "https://youtu.be/x", title: "", anchor: null }));
    expect(ok({ media: media(MAX_MEDIA) })).toBe(true);
    expect(ok({ media: media(MAX_MEDIA + 1) })).toBe(false);
    expect(ok({ unknown: 1 })).toBe(false);
  });

  it("OpenAPI: каждая операция с operationId, телом ответа-компонентом и схемой ошибки", () => {
    const spec = openapi() as { paths: Record<string, Record<string, { operationId: string; responses: Record<string, { content: Record<string, { schema: { $ref: string } }> }> }>> };
    const ops = Object.values(spec.paths).flatMap((p) => Object.values(p));
    expect(ops.map((o) => o.operationId).sort()).toEqual(Object.keys(v1).sort());
    for (const o of ops) {
      expect(o.responses["200"].content["application/json"].schema.$ref).toMatch(/^#\/components\/schemas\//);
      expect(o.responses.default.content["application/json"].schema.$ref).toBe("#/components/schemas/ApiError");
    }
  });
});

describe("маршрутизация", () => {
  const router = createRouter(v1);

  it("путь с параметрами → маршрут контракта; другой метод — 405 со списком", () => {
    expect(router.match("PATCH", `/api/v1/books/${BOOK}/questions/${QUESTION}`)).toMatchObject({ name: "questionSave", params: { bookId: BOOK, questionId: QUESTION } });
    expect(router.match("GET", `/api/v1/books/${BOOK}/questions/${QUESTION}`)).toEqual({ allowed: ["PATCH"] });
    expect(router.match("GET", "/api/v1/nope")).toBeNull();
    expect(router.match("GET", `/api/v1/books/${BOOK}/editor/x`)).toBeNull();
  });
});

describe("приложение", () => {
  it("health и openapi.json — без входа", async () => {
    const app = appWith({}, null);
    expect((await call(app, "GET", "/api/v1/health")).status).toBe(200);
    const spec = await (await call(app, "GET", "/api/v1/openapi.json")).json();
    expect(spec.openapi).toBe("3.1.0");
  });

  it("без входа — 401 в формате сайта, обработчик не вызывается", async () => {
    const booksList = vi.fn();
    const res = await call(appWith({ booksList }, null), "GET", "/api/v1/books");
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ code: "unauthorized" });
    expect(booksList).not.toHaveBeenCalled();
  });

  it("параметры и тело разбираются схемой контракта: чужой uuid и лишнее поле — 400", async () => {
    const questionSave = vi.fn(async () => ({ ok: true as const, updatedAt: new Date().toISOString() }));
    const app = appWith({ questionSave });
    expect((await call(app, "PATCH", `/api/v1/books/not-a-uuid/questions/${QUESTION}`, { answer: "x" })).status).toBe(400);
    expect((await call(app, "PATCH", `/api/v1/books/${BOOK}/questions/${QUESTION}`, { answer: "x", hack: 1 })).status).toBe(400);
    const ok = await call(app, "PATCH", `/api/v1/books/${BOOK}/questions/${QUESTION}`, { answer: "Привет" });
    expect(ok.status).toBe(200);
    expect(questionSave).toHaveBeenCalledWith(expect.objectContaining({ user, input: { bookId: BOOK, questionId: QUESTION, body: { answer: "Привет" } } }));
  });

  it("ответ не по контракту — 500 (вне прода), а не тихо сломанный клиент", async () => {
    const booksList = vi.fn(async () => ({ books: [{ id: BOOK }] }) as never);
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect((await call(appWith({ booksList }), "GET", "/api/v1/books")).status).toBe(500);
    errSpy.mockRestore();
  });

  it("ошибка домена (HttpError) — её статус и код", async () => {
    const bookEditor = vi.fn(async () => {
      throw new HttpError(404, "bookNotFound");
    });
    const res = await call(appWith({ bookEditor }), "GET", `/api/v1/books/${BOOK}/editor`);
    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ code: "bookNotFound" });
  });

  it("виды книг: каталог сайта на нужном языке, ответ по контракту (без входа)", async () => {
    const res = await call(createApp(handlers, fakeAuth(null)), "GET", "/api/v1/themes?locale=kk");
    expect(res.status).toBe(200);
    const { themes } = await res.json();
    const { getThemes } = await import("@/lib/content/themes");
    expect(themes.map((t: { id: string }) => t.id)).toEqual(getThemes("kk").map((t) => t.id));
    expect(themes.find((t: { kind: string }) => t.kind === "blank")).toMatchObject({ recipient: "optional" });
  });
});
