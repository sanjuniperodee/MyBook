import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createWebApiClient, v1WebRead } from "@/server/v1-web-client";
import { decodeWire, encodeWire } from "@/shared/wire";
import { anna, fake, owner, resetContainer, resetRequest, signIn, vera } from "../doubles/web";

vi.mock("next/headers", async () => (await import("../doubles/web")).nextHeaders);
vi.mock("next/navigation", async () => (await import("../doubles/web")).nextNavigation);
vi.mock("next/cache", async () => (await import("../doubles/web")).nextCache);
vi.mock("@/server/container", async () => (await import("../doubles/web")).containerModule);

const { nestApi, registeredPaths, siteRouteMissing } = await import("./api");
const { localStaffAccess } = await import("@/server/access");
const { runCrmOp } = await import("@/server/crm-ops/registry");

// Бэкенд на Nest: вход и права — по сессиям и ролям двойника container() (как у сайта).
const app = await nestApi();
const fetchViaApp: typeof fetch = (input, init) => app(new Request(String(input), init));

const at = new Date("2026-11-20T10:00:00.000Z");

describe("обёртка wire: значения CRM через JSON без потерь", () => {
  it("Date, Map, Set, BigInt, байты, undefined в массиве и объект, похожий на метку", async () => {
    const value = {
      at,
      bad: new Date(Number.NaN),
      map: new Map<string, unknown>([["a", { at }]]),
      set: new Set([1, 2]),
      big: 12n,
      bytes: new Uint8Array([1, 2, 3]),
      list: [1, undefined, "x"],
      skip: undefined,
      inf: Number.POSITIVE_INFINITY,
      tricky: { "~wire": "date", v: "2020-01-01T00:00:00.000Z" },
    };
    const back = decodeWire<typeof value>(JSON.parse(JSON.stringify(await encodeWire(value))));
    expect(back.at).toEqual(at);
    expect(Number.isNaN(back.bad.getTime())).toBe(true);
    expect(back.map.get("a")).toEqual({ at });
    expect([...back.set]).toEqual([1, 2]);
    expect(back.big).toBe(12n);
    expect([...back.bytes]).toEqual([1, 2, 3]);
    expect(back.list).toEqual([1, undefined, "x"]);
    expect("skip" in back).toBe(false);
    expect(back.inf).toBe(Number.POSITIVE_INFINITY);
    expect(back.tricky).toEqual({ "~wire": "date", v: "2020-01-01T00:00:00.000Z" });
  });

  it("FormData с файлом и аргументы server action", async () => {
    const form = new FormData();
    form.append("title", "Свадьба");
    form.append("file", new File([new Uint8Array([7, 8])], "чек.pdf", { type: "application/pdf" }));
    const [state, back] = decodeWire<[unknown, FormData]>(JSON.parse(JSON.stringify(await encodeWire([null, form]))));
    expect(state).toBeNull();
    expect(back.get("title")).toBe("Свадьба");
    const file = back.get("file") as File;
    expect(file.name).toBe("чек.pdf");
    expect(file.type).toBe("application/pdf");
    expect([...new Uint8Array(await file.arrayBuffer())]).toEqual([7, 8]);
  });
});

describe("архитектура Раздела 5 (crm)", () => {
  const statics = (file: string) =>
    [...readFileSync(path.join(__dirname, "..", "..", file), "utf8").matchAll(/^import\s+(type\s+)?[^;]*?from\s+"([^"]+)"/gm)].filter((m) => !m[1]).map((m) => m[2]);

  it("мост и реестры не тянут модули с БД статически", () => {
    for (const f of ["src/server/v1-local-bridge-crm.ts", "src/server/crm-actions/index.ts"]) {
      expect(statics(f).filter((s) => /container|@\/modules\/|^pg$|drizzle/.test(s))).toEqual([]);
    }
  });

  it("бэкенд знает маршруты сайта CRM (оба префикса); статический адрес сильнее параметрического", async () => {
    const paths = ["/api/admin/live", "/api/admin/notifications", "/api/admin/chats/{id}/messages", "/api/admin/export/vcard", "/api/mobile/me", "/api/integrations/gowa", "/api/support/release", "/api/admin/support/{id}/files/{att}"];
    expect(siteRouteMissing(app, paths)).toEqual([]);
    expect(siteRouteMissing(app, ["/api/admin/calls/whatsapp/live", "/api/admin/calls/whatsapp/audio-auth", "/api/admin/calls/whatsapp/{id}"])).toEqual([]);
    // Статика не уходит в {id}: без входа и статический, и параметрический — 401 своего маршрута, а не 405/404 чужого.
    for (const url of ["/api/admin/calls/whatsapp/live", "/api/admin/calls/whatsapp/audio-auth"]) expect((await app(new Request(`http://127.0.0.1:3044${url}`))).status, url).not.toBe(404);
  });

  it("доски — остаток пути; мобильные адреса и раздача iPhone-приложения — на месте", () => {
    expect(siteRouteMissing(app, ["/api/mobile/tasks", "/api/mobile/deals/{id}", "/api/admin/ios-app/status", "/api/ios-app/manifest", "/api/admin/boards/{path*}"])).toEqual([]);
    expect(registeredPaths(app).has("/api/admin/boards")).toBe(true);
  });

  it("доски через API получают путь после /api/admin/boards", async () => {
    const seen: string[][] = [];
    vi.doMock("@/server/boards-api", () => ({ boardsApi: async (_req: Request, path: string[]) => (seen.push(path), Response.json({ ok: true })) }));
    vi.resetModules();
    const { GET } = await import("@/server/site-handlers/admin/boards");
    await GET(new Request("http://x/api/v1/site/admin/boards/b1/cards/%D0%B0"));
    await GET(new Request("http://x/api/admin/boards"));
    expect(seen).toEqual([["b1", "cards", "а"], []]);
    vi.doUnmock("@/server/boards-api");
  });
});

describe("API v1 Раздел 5 (crm): права сотрудника и server actions — strict parity", () => {
  let moderated: [string, string][];
  let audited: string[];

  beforeEach(() => {
    resetRequest();
    resetContainer();
    vi.stubEnv("WEB_API_ONLY", "");
    vi.stubEnv("WEB_USE_API_V1", "");
    moderated = [];
    audited = [];
    fake.feedback = { reviews: { moderate: async (id: string, action: string) => void moderated.push([id, action]) } };
    fake.access.audit = { record: async (e: { action: string }) => void audited.push(e.action) };
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  const strictStaff = (user: typeof owner) =>
    v1WebRead({
      name: "crm.staff",
      section: "crm",
      flag: "crm",
      parity: "strict",
      client: createWebApiClient({ baseUrl: "http://127.0.0.1:3044", sessionCookie: user.id, fetch: fetchViaApp }),
      local: () => localStaffAccess(user),
      viaApi: (api) => api.webCrmStaff({}),
    });

  it("webCrmStaff: руководитель, роль «только свои», не сотрудник — как локально", async () => {
    signIn(owner);
    const boss = await strictStaff(owner);
    expect(boss.staff).toMatchObject({ roleName: "Руководитель", scope: "all", isOwner: true });
    expect(boss.gate).toBeNull();
    signIn(anna);
    expect((await strictStaff(anna)).staff).toMatchObject({ roleKey: "manager", scope: "own", isOwner: false, permissions: ["deals.view", "orders.edit"] });
    signIn(vera);
    expect((await strictStaff(vera)).staff?.permissions).toEqual(["clients.view"]);
  });

});

describe("API v1 Раздел 5.2 (crm): сборщики страниц — strict parity и права", () => {
  beforeEach(() => {
    resetRequest();
    resetContainer();
    vi.stubEnv("WEB_API_ONLY", "");
    vi.stubEnv("WEB_USE_API_V1", "");
  });
  afterEach(() => vi.unstubAllEnvs());

  const strictOp = (user: typeof owner, op: string, args: unknown) =>
    v1WebRead({
      name: `crm.${op}`,
      section: "crm",
      flag: "crm",
      parity: "strict",
      client: createWebApiClient({ baseUrl: "http://127.0.0.1:3044", sessionCookie: user.id, fetch: fetchViaApp }),
      local: () => runCrmOp(op, args),
      viaApi: async (api) => decodeWire((await api.webCrmRead({ op, body: { args: await encodeWire(args) } })).data),
    });

  it("промокоды, отзывы, задачи-доски и упаковочный лист — одинаково локально и через API (даты, Map)", async () => {
    fake.ordering = {
      queries: {
        promoStats: async () => [{ promo: { code: "MAMA10", active: true, usedCount: 2, expiresAt: at, kind: "percent", value: 10 }, paid: 1, revenue: 29000 }],
        orderDetails: async (id: string) => ({ id, number: 12, createdAt: at, desiredDate: null, addons: [], book: { title: "Мама" } }),
      },
    };
    fake.feedback = { queries: { list: async () => [{ id: "r1", createdAt: at }], counts: async () => ({ new: 1 }), summary: async () => ({ count: 1, average: 5 }) } };
    fake.marketing = {
      service: { report: async () => ({ total: {}, channels: [] }), shopWhatsapp: async () => "77010000000", target: async (l: { slug: string }) => `https://mybooks.kz/?utm=${l.slug}` },
      links: { all: async () => [{ id: "l1", slug: "ig", archived: false, createdAt: at }] },
      spend: { recent: async () => [] },
    };
    signIn(owner);
    expect(await strictOp(owner, "pages.promo", {})).toMatchObject([{ promo: { expiresAt: at } }]);
    expect(await strictOp(owner, "pages.reviews", { filter: "new" })).toMatchObject({ counts: { new: 1 } });
    const m = (await strictOp(owner, "pages.marketing", { period: 30, archived: false })) as { targets: Map<string, string> };
    expect(m.targets.get("l1")).toBe("https://mybooks.kz/?utm=ig");
    expect(await strictOp(owner, "pages.packingSlip", { id: "4a1b2c3d-1111-4222-8333-444444444444" })).toMatchObject({ number: 12, createdAt: at });
  });

  it("нет права страницы — 403 и локально, и через API; кривой вход — 400; неизвестная операция — 404", async () => {
    signIn(anna);
    await expect(runCrmOp("pages.promo", {})).rejects.toThrow();
    await expect(strictOp(anna, "pages.promo", {})).rejects.toMatchObject({ status: 403 });
    signIn(owner);
    await expect(strictOp(owner, "pages.reviews", { filter: "drop table" })).rejects.toMatchObject({ status: 400 });
    await expect(strictOp(owner, "pages.nothing", {})).rejects.toMatchObject({ status: 404 });
    await expect(strictOp(owner, "toString.call", {})).rejects.toMatchObject({ status: 404 });
  });
});

describe("API v1 Раздел 5.3 (crm): деньги, каркас и «Мой день»", () => {
  beforeEach(() => {
    resetRequest();
    resetContainer();
    vi.stubEnv("WEB_API_ONLY", "");
    vi.stubEnv("WEB_USE_API_V1", "");
  });
  afterEach(() => vi.unstubAllEnvs());

  const strictOp = (user: typeof owner, op: string, args: unknown) =>
    v1WebRead({
      name: `crm.${op}`,
      section: "crm",
      flag: "crm",
      parity: "strict",
      client: createWebApiClient({ baseUrl: "http://127.0.0.1:3044", sessionCookie: user.id, fetch: fetchViaApp }),
      local: () => runCrmOp(op, args),
      viaApi: async (api) => decodeWire((await api.webCrmRead({ op, body: { args: await encodeWire(args) } })).data),
    });

  it("каркас: значки и телефония; расходы за период — одинаково локально и через API", async () => {
    let expensesArgs: unknown[] = [];
    fake.reporting = {
      live: async () => ({ chats: 2, at }),
      expenses: async (...a: unknown[]) => ((expensesArgs = a), [{ id: "e1", amount: 500, day: "2026-11-02", createdAt: at }]),
    };
    fake.access.queries = { allStaff: async () => [{ id: "boss", name: "Руководитель", email: "boss@mybooks.kz" }] };
    fake.telephony = { phone: { webphoneAvailable: async () => true, currentProvider: async () => "zadarma" }, whatsapp: { enabled: async () => false } };
    signIn(owner);
    expect(await strictOp(owner, "shell.layout", {})).toEqual({ live: { chats: 2, at }, phone: true, waCalls: false, pbx: false });
    const { rows } = (await strictOp(owner, "money.expenses", { p: "month" })) as { rows: { createdAt: Date }[] };
    expect(rows[0].createdAt).toEqual(at);
    expect(expensesArgs).toHaveLength(2);
    signIn(anna);
    await expect(strictOp(anna, "money.expenses", {})).rejects.toMatchObject({ status: 403 });
  });
});

describe("API v1 Раздел 5.4 (crm): чаты, задачи и настройки", () => {
  beforeEach(() => {
    resetRequest();
    resetContainer();
    vi.stubEnv("WEB_API_ONLY", "");
    vi.stubEnv("WEB_USE_API_V1", "");
  });
  afterEach(() => vi.unstubAllEnvs());

  const strictOp = (user: typeof owner, op: string, args: unknown) =>
    v1WebRead({
      name: `crm.${op}`,
      section: "crm",
      flag: "crm",
      parity: "strict",
      client: createWebApiClient({ baseUrl: "http://127.0.0.1:3044", sessionCookie: user.id, fetch: fetchViaApp }),
      local: () => runCrmOp(op, args),
      viaApi: async (api) => decodeWire((await api.webCrmRead({ op, body: { args: await encodeWire(args) } })).data),
    });

  it("задачи: роль «только свои» не видит чужие, даже если просит who=all", async () => {
    const asked: unknown[] = [];
    fake.reporting = { taskList: async (viewer: unknown, filter: unknown) => (asked.push([viewer, filter]), [{ id: "t1", dueAt: at }]) };
    fake.access.queries = { allStaff: async () => [] };
    signIn(anna);
    expect(await strictOp(anna, "tasks.list", { who: "all", done: false, kind: "", q: "" })).toMatchObject({ rows: [{ dueAt: at }] });
    expect(asked[0]).toEqual([{ userId: "anna", seesAll: false }, { who: "mine", done: false, kind: "", q: "" }]);
  });

  it("настройки: без права «Настройки» — 403; секреты уходят только маской", async () => {
    signIn(anna);
    await expect(strictOp(anna, "settings.telephony", {})).rejects.toMatchObject({ status: 403 });
  });
});
