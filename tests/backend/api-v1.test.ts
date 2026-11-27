import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { ANSWER_MAX, SECTION_PROMPT_MAX, SECTION_TITLE_MAX } from "@/lib/content/kinds";
import { MAX_MEDIA } from "@/lib/book/answer-media";
import { CROP_ZOOM_MAX } from "@/lib/book/photo-crop";
import { INVITE_TEXT_MAX } from "@/lib/content/letter-invite";
import { MAX_LETTERS } from "@/modules/authoring/domain";
import { CITY_MAX, NAME_MAX, RATING_MAX, TEXT_MAX } from "@/modules/feedback";
import { NAMES_ON_COVER_MAX } from "@/lib/book/cover-names";
import { MAX_EXTRA_PHOTOS } from "@/modules/authoring/domain/Book";

// API v1 (ADR 0012): контракт первым (packages/contracts), сервер — бэкенд на Nest (apps/backend, ADR 0014).
vi.mock("@/shared/infrastructure/http/locale", async (orig) => ({ ...(await orig<object>()), getMessages: async () => ({ api: (await import("@/i18n/messages/ru/api")).api }), getLocale: async () => "ru" }));

const { v1, QuestionPatch, PhotoPatch, LettersOrder, LetterInviteText, ReviewBody, CoverPatch, openapi } = await import("@mybook/contracts");
const { createRouter } = await import("@mybook/contracts");
const { nestApi, legacyAuth } = await import("./api");
const { ROUTE_REGISTRY } = await import("../../apps/backend/src/core/routes/route-registry");
const { ORDERS_API_PORTS } = await import("../../apps/backend/src/modules/orders/orders.tokens");
const { generated, dartClient } = await import("../../scripts/contracts/files");
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

/** Бэкенд на Nest с подменёнными портами контекстов (вместо прежних обработчиков apps/api) и входом `who`. */
const appWith = (overrides: [token: unknown, value: unknown][], who?: unknown) => nestApi({ auth: legacyAuth(fakeAuth(who)), overrides });

const call = (app: (req: Request) => Promise<Response>, method: string, path: string, body?: unknown) =>
  app(new Request(`http://127.0.0.1:3044${path}`, { method, headers: body ? { "content-type": "application/json" } : {}, body: body ? JSON.stringify(body) : undefined }));

describe("контракт", () => {
  // Dart-клиент живёт в mybook-mobile: его свежесть — scripts/contracts/check-dart.ts и PR из CI (ADR 0013).
  it("OpenAPI сгенерирован из текущего контракта (npx tsx scripts/contracts/generate.ts)", () => {
    for (const [file, text] of Object.entries(generated())) expect(readFileSync(file, "utf8"), file).toBe(text);
  });

  it("Dart: необязательное поле с null — в наборе nulls (обнулить), обязательное с null — всегда в JSON", () => {
    const dart = dartClient();
    expect(dart).toContain("if (questionId != null || nulls.contains('questionId')) 'questionId'");
    expect(dart).toContain("'anchor': anchor,");
  });

  it("каждый маршрут контракта зарегистрирован в бэкенде на Nest, и других адресов /api/v1 (кроме сайта) нет", async () => {
    const app = await appWith([], null);
    const nest = (p: string) => p.replace(/\{(\w+)\}/g, ":$1");
    const registered = app.app.get<{ list(): { method: string; path: string }[] }>(ROUTE_REGISTRY).list().map((r) => `${r.method} ${r.path}`);
    const contract = Object.values(v1 as Record<string, { method: string; path: string }>).map((r) => `${r.method} ${nest(r.path)}`);
    expect(contract.filter((r) => !registered.includes(r))).toEqual([]);
    expect(registered.filter((r) => / \/api\/v1\//.test(r) && !/ \/api\/v1\/site\//.test(r) && !contract.includes(r))).toEqual([]);
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
    const crop = (zoom: number) => PhotoPatch.safeParse({ crop: { x: 0.5, y: 0.5, zoom } }).success;
    expect(crop(CROP_ZOOM_MAX)).toBe(true);
    expect(crop(CROP_ZOOM_MAX + 0.01)).toBe(false);
    const ids = (n: number) => Array.from({ length: n }, () => BOOK);
    expect(LettersOrder.safeParse({ ids: ids(MAX_LETTERS) }).success).toBe(true);
    expect(LettersOrder.safeParse({ ids: ids(MAX_LETTERS + 1) }).success).toBe(false);
    expect(LetterInviteText.safeParse({ text: "а".repeat(INVITE_TEXT_MAX) }).success).toBe(true);
    expect(LetterInviteText.safeParse({ text: "а".repeat(INVITE_TEXT_MAX + 1) }).success).toBe(false);
    const review = (over: Record<string, unknown>) => ReviewBody.safeParse({ rating: 5, text: "", authorName: "Анна", city: "", consent: true, ...over }).success;
    expect(review({ rating: RATING_MAX })).toBe(true);
    expect(review({ rating: RATING_MAX + 1 })).toBe(false);
    expect(review({ text: "а".repeat(TEXT_MAX) })).toBe(true);
    expect(review({ text: "а".repeat(TEXT_MAX + 1) })).toBe(false);
    expect(review({ authorName: "а".repeat(NAME_MAX + 1) })).toBe(false);
    expect(review({ city: "а".repeat(CITY_MAX + 1) })).toBe(false);
    const cover = (body: Record<string, unknown>) => CoverPatch.safeParse(body).success;
    expect(cover({ namesOnCover: "а".repeat(NAMES_ON_COVER_MAX) })).toBe(true);
    expect(cover({ namesOnCover: "а".repeat(NAMES_ON_COVER_MAX + 1) })).toBe(false);
    expect(cover({ coverPhotoExtra: Array.from({ length: MAX_EXTRA_PHOTOS }, () => BOOK) })).toBe(true);
    expect(cover({ coverPhotoExtra: Array.from({ length: MAX_EXTRA_PHOTOS + 1 }, () => BOOK) })).toBe(false);
    expect(cover({ coverDesign: {} })).toBe(false);
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

describe("приложение (бэкенд на Nest)", () => {
  // Обработчики прежнего apps/api подменялись целиком; у Nest подменяем порт контекста — здесь «заказы и деньги»
  // (ORDERS_API_PORTS.run), маршруты cabinetOrders/cabinetOrder идут через него напрямую.
  const ordersPort = (run: (meta: unknown, name: string, input: unknown) => Promise<unknown>) => [ORDERS_API_PORTS, { run }] as [unknown, unknown];
  const ORDER = "4a1b2c3d-1111-4222-8333-444444444444";

  it("health — без входа (openapi.json бэкенд не раздаёт: спецификация — файл из scripts/contracts/generate.ts)", async () => {
    const app = await appWith([], null);
    expect((await call(app, "GET", "/api/v1/health")).status).toBe(200);
  });

  it("GET — с ETag: тот же ответ при If-None-Match — пустой 304 (кэш приложения)", async () => {
    const app = await appWith([], null);
    const first = await call(app, "GET", "/api/v1/app-config");
    const tag = first.headers.get("etag");
    expect(first.status).toBe(200);
    expect(tag).toBeTruthy();
    const again = await app(new Request("http://127.0.0.1:3044/api/v1/app-config", { headers: { "if-none-match": tag! } }));
    expect(again.status).toBe(304);
    expect(await again.text()).toBe("");
  });

  it("без входа — 401 в формате сайта, порт не вызывается", async () => {
    const run = vi.fn();
    const res = await call(await appWith([ordersPort(run)], null), "GET", "/api/v1/cabinet/orders");
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ code: "unauthorized" });
    expect(run).not.toHaveBeenCalled();
  });

  it("параметры и тело разбираются схемой контракта: кривой uuid и лишнее поле — 400, порт не вызывается", async () => {
    const run = vi.fn(async () => ({ ok: true }));
    const app = await appWith([ordersPort(run)]);
    expect((await call(app, "GET", "/api/v1/cabinet/orders/not-a-uuid")).status).toBe(400);
    expect((await call(app, "PATCH", `/api/v1/books/not-a-uuid/questions/${QUESTION}`, { answer: "x" })).status).toBe(400);
    expect((await call(app, "PATCH", `/api/v1/books/${BOOK}/questions/${QUESTION}`, { answer: "x", hack: 1 })).status).toBe(400);
    expect(run).not.toHaveBeenCalled();
    // Успешный разбор и автосохранение ответа — apps/backend/test/authoring.e2e.test.ts («PATCH /books/:id/questions/:qid»).
  });

  it("ответ не по контракту — 500 (вне прода), а не тихо сломанный клиент", async () => {
    const app = await appWith([ordersPort(async () => ({ orders: [{ id: ORDER }] }))]);
    expect((await call(app, "GET", "/api/v1/cabinet/orders")).status).toBe(500);
  });

  it("ошибка домена (HttpError) — её статус и код", async () => {
    const app = await appWith([
      ordersPort(async () => {
        throw new HttpError(404, "orderNotFound");
      }),
    ]);
    const res = await call(app, "GET", `/api/v1/cabinet/orders/${ORDER}`);
    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ code: "orderNotFound" });
  });

  it("виды книг: каталог сайта на нужном языке, ответ по контракту (без входа)", async () => {
    const res = await call(await appWith([], null), "GET", "/api/v1/themes?locale=kk");
    expect(res.status).toBe(200);
    const { themes } = await res.json();
    const { getThemes } = await import("@/lib/content/themes");
    expect(themes.map((t: { id: string }) => t.id)).toEqual(getThemes("kk").map((t) => t.id));
    expect(themes.find((t: { kind: string }) => t.kind === "blank")).toMatchObject({ recipient: "optional" });
  });

  // Загрузка multipart (поле files, пустые отброшены) — apps/backend/test/authoring.e2e.test.ts («POST /photos»);
  // вебхуки провайдеров вне /api/v1 без входа — site-route.e2e и site-ops.real.e2e.

  it("чужой адрес — 404", async () => {
    expect((await call(await appWith([], null), "POST", "/api/whatever")).status).toBe(404);
  });
});
