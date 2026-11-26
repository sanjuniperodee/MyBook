import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { IdentityError } from "@/modules/identity/domain";
import {
  apiInternalUrl,
  createWebApiClient,
  v1WebAction,
  v1WebRead,
  webApiClient,
  webApiOnly,
  webUseApiV1,
} from "@/server/v1-web-client";
import { hasTwoFactorTicket, issueTwoFactorTicket, setTwoFactorTicket } from "@/server/auth";
import { anna, client, fake, request, resetContainer, resetRequest, signIn } from "./doubles/web";

vi.mock("next/headers", async () => (await import("./doubles/web")).nextHeaders);
vi.mock("next/navigation", async () => (await import("./doubles/web")).nextNavigation);
vi.mock("next/cache", async () => (await import("./doubles/web")).nextCache);
vi.mock("@/server/container", async () => (await import("./doubles/web")).containerModule);
vi.mock("@/server/catalog", () => ({ ensureCatalog: vi.fn(async () => {}) }));

const { createApp } = await import("../apps/api/src/app");
const { handlers } = await import("../apps/api/src/routes");
const { HttpError } = await import("@/server/api");

const BOOK_ID = "3f2b8c1e-7a4d-4e5f-9b6c-1d2e3f4a5b6c";
const ORDER_ID = "7a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d";
const DEAL_ID = "9b8c7d6e-5f4a-4b3c-8d2e-1f0a9b8c7d6e";
const USER_ID = "11111111-2222-4333-8444-555555555555";

const apiUserRow = {
  id: USER_ID,
  email: "client@mybooks.kz",
  passwordHash: "secret-hash",
  name: "Айгерим",
  phone: "+77001112233",
  role: "user" as const,
  tags: ["vip"],
  lastSeenAt: new Date("2026-11-25T10:00:00.000Z"),
  remindedAt: null,
  emailOptOut: false,
  locale: "ru" as const,
  source: { utm_source: "ig" },
  crmRoleId: null,
  managerId: null,
  sipExtension: null,
  notifyPrefs: {},
  onShift: true,
  extraPhones: [],
  customFields: {},
  staffDisabled: false,
  totpSecret: "encrypted-secret",
  totpEnabledAt: new Date("2026-11-20T10:00:00.000Z"),
  totpBackup: ["h1", "h2"],
  deletedAt: null,
  purgedAt: null,
  createdAt: new Date("2026-11-01T00:00:00.000Z"),
  updatedAt: new Date("2026-11-25T10:00:00.000Z"),
};

const fakeAuth = (who: unknown = apiUserRow) => ({
  user: async () => {
    if (!who) throw new HttpError(401, "unauthorized");
    return who as never;
  },
  staff: async () => {
    throw new HttpError(403, "forbidden");
  },
});

const call = (app: ReturnType<typeof createApp>, method: string, path: string, body?: unknown) =>
  app(
    new Request(`http://127.0.0.1:3044${path}`, {
      method,
      headers: body ? { "content-type": "application/json" } : {},
      body: body ? JSON.stringify(body) : undefined,
    }),
  );

beforeEach(() => {
  resetRequest();
  resetContainer();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("v1-web-client: webApiOnly, v1WebAction, Bearer + Cookie", () => {
  it("webApiOnly(): true при WEB_API_ONLY=1 или отсутствии DATABASE_URL; false при заданной БД без флага", () => {
    expect(webApiOnly("1", "postgres://db/mybook")).toBe(true);
    expect(webApiOnly("", "")).toBe(true);
    expect(webApiOnly("0", "postgres://db/mybook")).toBe(false);
    expect(webApiOnly("", "postgres://db/mybook")).toBe(false);

    vi.stubEnv("WEB_API_ONLY", "");
    vi.stubEnv("DATABASE_URL", "");
    expect(webApiOnly()).toBe(true);

    vi.stubEnv("WEB_API_ONLY", "1");
    vi.stubEnv("DATABASE_URL", "postgres://db/mybook");
    expect(webApiOnly()).toBe(true);

    vi.stubEnv("WEB_API_ONLY", "");
    vi.stubEnv("DATABASE_URL", "postgres://db/mybook");
    expect(webApiOnly()).toBe(false);
  });

  it("webUseApiV1(): при webApiOnly() === true всегда возвращает true, даже если WEB_USE_API_V1=0", () => {
    vi.stubEnv("WEB_API_ONLY", "1");
    vi.stubEnv("DATABASE_URL", "postgres://db/mybook");
    expect(webUseApiV1("cabinet", "0")).toBe(true);
    expect(webUseApiV1(undefined, "off")).toBe(true);

    vi.stubEnv("WEB_API_ONLY", "");
    vi.stubEnv("DATABASE_URL", "");
    expect(webUseApiV1("cabinet", "0")).toBe(true);
  });

  it("v1WebRead(): при webApiOnly() === true трактует parity как off и никогда не вызывает local() даже при ошибке API", async () => {
    const local = vi.fn(async () => ({ src: "local" }));
    const viaApi = vi.fn(async () => ({ src: "api" }));
    const clientStub = createWebApiClient({ fetch: async () => Response.json({}) });

    const ok = await v1WebRead({
      name: "cabinet.test",
      section: "cabinet",
      local,
      viaApi,
      flag: "0",
      parity: "strict",
      apiOnly: true,
      client: clientStub,
    });
    expect(ok).toEqual({ src: "api" });
    expect(viaApi).toHaveBeenCalledTimes(1);
    expect(local).not.toHaveBeenCalled();

    await expect(
      v1WebRead({
        name: "cabinet.fail",
        section: "cabinet",
        local,
        viaApi: async () => {
          throw new Error("ECONNREFUSED");
        },
        flag: "0",
        parity: "shadow",
        apiOnly: true,
        client: clientStub,
      }),
    ).rejects.toThrow("ECONNREFUSED");
    expect(local).not.toHaveBeenCalled();
  });

  it("v1WebAction(): при выключенном флаге зовёт только local(), при включённом или webApiOnly() — только viaApi() (без двойного вызова)", async () => {
    vi.stubEnv("DATABASE_URL", "postgres://test/mybook");
    vi.stubEnv("WEB_API_ONLY", "");
    vi.stubEnv("PARITY_MODE", "shadow");
    const clientStub = createWebApiClient({ fetch: async () => Response.json({}) });

    const local1 = vi.fn(async () => "local-res");
    const api1 = vi.fn(async () => "api-res");
    expect(await v1WebAction({ section: "cabinet", local: local1, viaApi: api1, flag: "0", apiOnly: false, client: clientStub })).toBe("local-res");
    expect(local1).toHaveBeenCalledTimes(1);
    expect(api1).not.toHaveBeenCalled();

    const local2 = vi.fn(async () => "local-res");
    const api2 = vi.fn(async () => "api-res");
    expect(await v1WebAction({ section: "cabinet", local: local2, viaApi: api2, flag: "cabinet", apiOnly: false, client: clientStub })).toBe("api-res");
    expect(api2).toHaveBeenCalledTimes(1);
    expect(local2).not.toHaveBeenCalled();

    const local3 = vi.fn(async () => "local-res");
    const api3 = vi.fn(async () => "api-res");
    expect(await v1WebAction({ section: "cabinet", local: local3, viaApi: api3, flag: "0", apiOnly: true, client: clientStub })).toBe("api-res");
    expect(api3).toHaveBeenCalledTimes(1);
    expect(local3).not.toHaveBeenCalled();
  });

  it("createWebApiClient(): отправляет токен одновременно в Cookie: mb_session и Authorization: Bearer", async () => {
    const seen: { url: string; headers: Headers }[] = [];
    const api = createWebApiClient({
      baseUrl: "https://mybooks.kz/api/v1/",
      sessionCookie: "tok_vercel_1234567890",
      locale: "kk",
      clientIp: "198.51.100.42",
      fetch: async (input, init) => {
        seen.push({ url: String(input), headers: new Headers(init?.headers) });
        return Response.json({ user: null });
      },
    });
    const res = await api.meWebSession({});
    expect(res).toEqual({ user: null });
    expect(seen).toHaveLength(1);
    expect(seen[0].url).toBe("https://mybooks.kz/api/v1/web/session");
    expect(seen[0].headers.get("cookie")).toBe("mb_session=tok_vercel_1234567890");
    expect(seen[0].headers.get("authorization")).toBe("Bearer tok_vercel_1234567890");
    expect(seen[0].headers.get("accept-language")).toBe("kk");
    expect(seen[0].headers.get("x-real-ip")).toBe("198.51.100.42");
  });

  it("apiInternalUrl(): срезает хвостовой /api/v1 и слэши, чтобы не было /api/v1/api/v1", () => {
    expect(apiInternalUrl("https://mybooks.kz/api/v1", undefined)).toBe("https://mybooks.kz");
    expect(apiInternalUrl("https://mybooks.kz/api/v1/", undefined)).toBe("https://mybooks.kz");
    expect(apiInternalUrl("https://mybooks.kz/API/V1", undefined)).toBe("https://mybooks.kz");
    expect(apiInternalUrl("http://127.0.0.1:3044/", undefined)).toBe("http://127.0.0.1:3044");
  });

  it("webApiClient(): пробрасывает клиентский IP из x-real-ip / x-forwarded-for в mybook-api для rate-limit", async () => {
    const seen: Headers[] = [];
    const fakeFetch: typeof fetch = async (_input, init) => {
      seen.push(new Headers(init?.headers));
      return Response.json({ user: null });
    };

    request.headers.set("x-real-ip", "203.0.113.10");
    const c1 = await webApiClient({ baseUrl: "http://127.0.0.1:3044", fetch: fakeFetch });
    await c1.meWebSession({});
    expect(seen[0].get("x-real-ip")).toBe("203.0.113.10");

    request.headers.delete("x-real-ip");
    request.headers.set("x-forwarded-for", "198.51.100.1, 203.0.113.25");
    const c2 = await webApiClient({ baseUrl: "http://127.0.0.1:3044", fetch: fakeFetch });
    await c2.meWebSession({});
    expect(seen[1].get("x-real-ip")).toBe("203.0.113.25");

    request.headers.delete("x-forwarded-for");
    const c3 = await webApiClient({ baseUrl: "http://127.0.0.1:3044", fetch: fakeFetch });
    await c3.meWebSession({});
    expect(seen[2].get("x-real-ip")).toBeNull();
  });

  it("hasTwoFactorTicket(): в API-режиме (Vercel без секрета) проверяет наличие cookie mb_2fa, локально — подпись", async () => {
    // API-режим: чужая подпись от mybook-api не проверяется локально, но cookie должна существовать.
    vi.stubEnv("WEB_API_ONLY", "1");
    expect(await hasTwoFactorTicket()).toBe(false);
    await setTwoFactorTicket("signed-by-api-server.foreign-sig");
    expect(await hasTwoFactorTicket()).toBe(true);

    // Локальный режим: невалидная подпись отклоняется, валидная — принимается.
    vi.stubEnv("WEB_API_ONLY", "");
    vi.stubEnv("WEB_USE_API_V1", "0");
    vi.stubEnv("DATABASE_URL", "postgres://test/mybook");
    expect(await hasTwoFactorTicket()).toBe(false);
    await issueTwoFactorTicket(USER_ID);
    expect(await hasTwoFactorTicket()).toBe(true);
  });
});

describe("API v1 web-cabinet маршруты", () => {
  it("GET /api/v1/web/session: без токена → { user: null }, с валидной сессией → безопасная проекция без секретов", async () => {
    const app = createApp(handlers, fakeAuth(null));
    const empty = await call(app, "GET", "/api/v1/web/session");
    expect(empty.status).toBe(200);
    expect(await empty.json()).toEqual({ user: null });

    signIn(apiUserRow as never);
    const active = await call(app, "GET", "/api/v1/web/session");
    expect(active.status).toBe(200);
    const body = await active.json();
    expect(body.user).toMatchObject({
      id: USER_ID,
      email: "client@mybooks.kz",
      name: "Айгерим",
      hasTotpSecret: true,
      totpBackupCount: 2,
    });
    expect(body.user.passwordHash).toBeUndefined();
    expect(body.user.totpSecret).toBeUndefined();
    expect(body.user.totpBackup).toBeUndefined();
  });

  it("POST /api/v1/web/auth/register: успешная регистрация, конфликт email (409 exists) и лимит (429)", async () => {
    const app = createApp(handlers, fakeAuth(null));
    const expiresAt = new Date("2026-12-25T00:00:00.000Z");
    fake.identity.auth = {
      register: vi.fn(async () => ({ token: "new_session_tok_1234567890", expiresAt })),
    };

    const ok = await call(app, "POST", "/api/v1/web/auth/register", {
      name: "Айгерим",
      email: "new@mybooks.kz",
      password: "password123",
      locale: "ru",
      source: { utm_source: "ads" },
    });
    expect(ok.status).toBe(200);
    expect(await ok.json()).toEqual({ token: "new_session_tok_1234567890", expiresAt: expiresAt.toISOString() });

    fake.identity.auth = {
      register: vi.fn(async () => {
        throw new IdentityError("exists");
      }),
    };
    const conflict = await call(app, "POST", "/api/v1/web/auth/register", {
      name: "Айгерим",
      email: "dup@mybooks.kz",
      password: "password123",
    });
    expect(conflict.status).toBe(409);
    expect(await conflict.json()).toMatchObject({ code: "exists" });

    fake.rateLimiter = { hit: async () => false };
    const limited = await call(app, "POST", "/api/v1/web/auth/register", {
      name: "Айгерим",
      email: "lim@mybooks.kz",
      password: "password123",
    });
    expect(limited.status).toBe(429);
    expect(await limited.json()).toMatchObject({ code: "tooMany" });
  });

  it("POST /api/v1/web/auth/forgot: вызывает requestPasswordReset и соблюдает rateLimit", async () => {
    const app = createApp(handlers, fakeAuth(null));
    const reqReset = vi.fn(async () => {});
    fake.identity.auth = { requestPasswordReset: reqReset };

    const res = await call(app, "POST", "/api/v1/web/auth/forgot", { email: "user@mybooks.kz", locale: "kk" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(reqReset).toHaveBeenCalledWith("user@mybooks.kz", "kk");

    fake.rateLimiter = { hit: async () => false };
    const limited = await call(app, "POST", "/api/v1/web/auth/forgot", { email: "user@mybooks.kz" });
    expect(limited.status).toBe(429);
    expect(await limited.json()).toMatchObject({ code: "tooManyForgot" });
  });

  it("GET /api/v1/web/auth/reset/{token} и POST /api/v1/web/auth/reset: проверка и погашение ссылок reset/access + 2FA", async () => {
    const app = createApp(handlers, fakeAuth(null));
    const token = "abcdefghijklmnopqrstuvwx1234";
    const expiresAt = new Date("2026-12-25T00:00:00.000Z");

    fake.marketing = { service: { shopWhatsapp: async () => "77001234567" } };
    fake.identity.auth = {
      linkInfo: async () => ({ purpose: "access", valid: true }),
      redeemAccessLink: vi.fn(async () => ({ token: "sess_tok_1234567890123456", expiresAt })),
    };

    const infoRes = await call(app, "GET", `/api/v1/web/auth/reset/${token}`);
    expect(infoRes.status).toBe(200);
    expect(await infoRes.json()).toEqual({ valid: true, purpose: "access", shopWhatsappDigits: "77001234567" });

    const redeemRes = await call(app, "POST", "/api/v1/web/auth/reset", { token, password: "newpassword123" });
    expect(redeemRes.status).toBe(200);
    expect(await redeemRes.json()).toEqual({
      kind: "session",
      token: "sess_tok_1234567890123456",
      expiresAt: expiresAt.toISOString(),
      secondFactorTicket: null,
      access: true,
    });

    fake.identity.auth = {
      linkInfo: async () => ({ purpose: "reset", valid: true }),
      resetPassword: async () => ({ kind: "second_factor", userId: anna.id }),
    };
    const staffReset = await call(app, "POST", "/api/v1/web/auth/reset", { token, password: "newpassword123" });
    expect(staffReset.status).toBe(200);
    const staffBody = await staffReset.json();
    expect(staffBody.kind).toBe("second_factor");
    expect(staffBody.secondFactorTicket).toBeTruthy();
    expect(staffBody.token).toBeNull();
  });

  it("GET /api/v1/web/shelf: возвращает полку с полями обложки, статусом заказа и договорённостью-бронью", async () => {
    const app = createApp(handlers, fakeAuth(apiUserRow));
    const updatedAt = new Date("2026-11-25T12:00:00.000Z");
    fake.authoring = {
      queries: {
        userBooks: async () => [
          {
            book: {
              id: BOOK_ID,
              title: "Книга о маме",
              subtitle: "С любовью",
              theme: "mom",
              status: "ordered",
              format: "a5",
              coverTemplate: "peony",
              coverLines: true,
              coverPhotoId: null,
              coverPhotoExtra: null,
              coverDesign: null,
              authorName: "Айгерим",
              recipientName: "Мама",
              hideRecipientOnCover: false,
              namesOnCover: "",
              occasion: null,
              occasionDate: null,
              updatedAt,
            },
            answered: 10,
            total: 20,
            words: 1500,
            photos: 3,
          },
        ],
        questions: async () => [],
      },
    };
    fake.ordering = {
      queries: {
        userOrders: async () => [{ id: ORDER_ID, bookId: BOOK_ID, number: 42, status: "paid", plan: "hardcover" }],
      },
      orders: {
        agreementFor: async () => ({
          dealId: DEAL_ID,
          dealNumber: 15,
          agreedTotal: 35000,
          prepaid: 10000,
          plan: "hardcover",
          gifts: ["giftwrap"],
          deadline: "2026-12-31",
          batch: null,
          recipient: "Мама",
        }),
      },
    };

    const res = await call(app, "GET", "/api/v1/web/shelf?locale=ru");
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.books).toHaveLength(1);
    expect(data.books[0]).toMatchObject({
      ordered: true,
      progress: 50,
      order: { id: ORDER_ID, number: 42, status: "paid", printed: true, statusTone: "success" },
    });
    expect(data.books[0].order.statusLabel).toBeTruthy();
    expect(data.agreement).toMatchObject({ dealId: DEAL_ID, dealNumber: 15, agreedTotal: 35000, prepaid: 10000 });
    expect(data.agreementBooks).toEqual([{ id: BOOK_ID, status: "ordered", theme: "mom", answered: 10, total: 20, words: 1500 }]);
  });

  it("POST /api/v1/web/books и DELETE /api/v1/web/books/{bookId}: создание (с uz/en) и удаление книги", async () => {
    const startMock = vi.fn(async () => ({ id: BOOK_ID }));
    const deleteMock = vi.fn(async () => {});
    fake.authoring = { books: { start: startMock, delete: deleteMock } };
    signIn(apiUserRow as never);

    const app = createApp(handlers, fakeAuth(apiUserRow));
    const created = await call(app, "POST", "/api/v1/web/books", {
      theme: "mom",
      language: "uz",
      authorName: "Айгерим",
      authorGender: "f",
      recipientName: "Она",
      recipientGender: "f",
    });
    expect(created.status).toBe(200);
    expect(await created.json()).toEqual({ id: BOOK_ID });
    expect(startMock).toHaveBeenCalledTimes(1);

    const deleted = await call(app, "DELETE", `/api/v1/web/books/${BOOK_ID}`);
    expect(deleted.status).toBe(200);
    expect(await deleted.json()).toEqual({ ok: true });
    expect(deleteMock).toHaveBeenCalledWith(BOOK_ID, expect.objectContaining({ userId: USER_ID }));
  });

  it("GET /api/v1/web/invite: возвращает код, ссылку, проценты и награды", async () => {
    const app = createApp(handlers, fakeAuth(apiUserRow));
    const createdAt = new Date("2026-11-20T00:00:00.000Z");
    const expiresAt = new Date("2027-05-20T00:00:00.000Z");
    fake.referrals = {
      service: {
        invite: async () => "AIGERIM-7K2Q",
        summary: async () => ({
          code: "AIGERIM-7K2Q",
          friends: 1,
          rewards: [{ code: "THANKS-9X4M", orderNumber: 101, chat: false, createdAt, used: false, expiresAt }],
        }),
      },
    };

    const res = await call(app, "GET", "/api/v1/web/invite?locale=kk");
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toMatchObject({
      code: "AIGERIM-7K2Q",
      friendPercent: 10,
      rewardPercent: 10,
      friends: 1,
      rewards: [
        {
          code: "THANKS-9X4M",
          orderNumber: 101,
          chat: false,
          createdAt: createdAt.toISOString(),
          used: false,
          expiresAt: expiresAt.toISOString(),
        },
      ],
    });
    expect(data.link).toContain("/kk/r/AIGERIM-7K2Q");
  });

  it("GET /api/v1/web/health: отдаёт статус БД, хранилища, Redis и outbox без входа", async () => {
    const app = createApp(handlers, fakeAuth(null));
    fake.databaseHealthy = (async () => true) as never;
    fake.storageHealthy = (async () => true) as never;
    fake.infraHealth = (async () => ({ redis: true, outbox: { pending: 0, failed: 0, oldestPendingSec: null } })) as never;

    const res = await call(app, "GET", "/api/v1/web/health");
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(await res.json()).toMatchObject({
      ok: true,
      db: true,
      storage: true,
      redis: true,
      outbox: { pending: 0, failed: 0, oldestPendingSec: null },
    });
  });

  it("защищённые маршруты web-cabinet возвращают 401 без входа", async () => {
    const app = createApp(handlers, fakeAuth(null));
    expect((await call(app, "GET", "/api/v1/web/shelf")).status).toBe(401);
    expect((await call(app, "GET", "/api/v1/web/invite")).status).toBe(401);
    expect((await call(app, "DELETE", `/api/v1/web/books/${BOOK_ID}`)).status).toBe(401);
  });

  it("meWebSession не вызывает повторного HTTP-цикла внутри createApp даже при WEB_USE_API_V1=1", async () => {
    vi.stubEnv("WEB_USE_API_V1", "1");
    signIn(client);
    const app = createApp(handlers, fakeAuth(null));
    const res = await call(app, "GET", "/api/v1/web/session");
    expect(res.status).toBe(200);
    // client.id в doubles/web.ts не UUID, проверяем через валидный UUID
    request.cookies.clear();
    signIn(apiUserRow as never);
    const res2 = await call(app, "GET", "/api/v1/web/session");
    expect(res2.status).toBe(200);
    expect((await res2.json()).user.id).toBe(USER_ID);
  });
});
