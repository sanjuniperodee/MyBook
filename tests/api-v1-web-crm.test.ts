import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createWebApiClient, v1WebRead } from "@/server/v1-web-client";
import { decodeWire, encodeWire } from "@/shared/wire";
import { anna, fake, owner, resetContainer, resetRequest, signIn, vera } from "./doubles/web";

vi.mock("next/headers", async () => (await import("./doubles/web")).nextHeaders);
vi.mock("next/navigation", async () => (await import("./doubles/web")).nextNavigation);
vi.mock("next/cache", async () => (await import("./doubles/web")).nextCache);
vi.mock("@/server/container", async () => (await import("./doubles/web")).containerModule);

const { createApp } = await import("../apps/api/src/app");
const { handlers } = await import("../apps/api/src/routes");
const { siteAuthenticator } = await import("../apps/api/src/auth");
const { handleSiteRoute, siteRoutePaths } = await import("../apps/api/src/site-routes");
const { localStaffAccess } = await import("@/server/access");
const { crmStaffAccess } = await import("@/server/v1-local-bridge-crm");
const { Redirect } = await import("./doubles/web");

const app = createApp(handlers, siteAuthenticator, handleSiteRoute);
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
    [...readFileSync(path.join(__dirname, "..", file), "utf8").matchAll(/^import\s+(type\s+)?[^;]*?from\s+"([^"]+)"/gm)].filter((m) => !m[1]).map((m) => m[2]);

  it("мост и реестры не тянут модули с БД статически", () => {
    for (const f of ["src/server/v1-local-bridge-crm.ts", "src/server/crm-actions/index.ts"]) {
      expect(statics(f).filter((s) => /container|@\/modules\/|^pg$|drizzle/.test(s))).toEqual([]);
    }
  });

  it("server actions в src/app/admin — только обёртки crmAction (код — в src/server/crm-actions)", () => {
    const walk = (dir: string): string[] =>
      readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(dir, e.name)) : /\.tsx?$/.test(e.name) ? [path.join(dir, e.name)] : []));
    for (const f of walk("src/app/admin")) {
      const src = readFileSync(f, "utf8");
      if (!/^["']use server["']/m.test(src) || !src.includes("crmAction")) continue;
      expect(src, f).not.toMatch(/container\(\)|@\/modules\//);
    }
  });

  it("site-routes знает маршруты CRM; статические адреса раньше параметрических", () => {
    for (const p of ["/api/admin/live", "/api/admin/notifications", "/api/admin/chats/{id}/messages", "/api/admin/export/vcard", "/api/mobile/me", "/api/integrations/gowa", "/api/support/release", "/api/admin/support/{id}/files/{att}"]) {
      expect(siteRoutePaths).toContain(p);
    }
    expect(siteRoutePaths.indexOf("/api/admin/calls/whatsapp/live")).toBeLessThan(siteRoutePaths.indexOf("/api/admin/calls/whatsapp/{id}"));
    expect(siteRoutePaths.indexOf("/api/admin/calls/whatsapp/audio-auth")).toBeLessThan(siteRoutePaths.indexOf("/api/admin/calls/whatsapp/{id}"));
    expect(new Set(siteRoutePaths).size).toBe(siteRoutePaths.length);
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

  it("crmStaffAccess без БД берёт права из API", async () => {
    signIn(anna);
    vi.stubGlobal("fetch", fetchViaApp);
    vi.stubEnv("WEB_USE_API_V1", "crm");
    const dto = await crmStaffAccess(async () => {
      throw new Error("local не должен вызываться");
    });
    expect(dto.staff?.roleName).toBe("Менеджер");
  });

  it("server action через API v1: те же права, zod и журнал, что локально", async () => {
    const { moderateReviewAction } = await import("@/app/admin/reviews/actions");
    const id = "4a1b2c3d-1111-4222-8333-444444444444";
    signIn(owner);
    await moderateReviewAction(id, "publish");
    vi.stubGlobal("fetch", fetchViaApp);
    vi.stubEnv("WEB_USE_API_V1", "crm");
    await moderateReviewAction(id, "hide");
    expect(moderated).toEqual([
      [id, "publish"],
      [id, "hide"],
    ]);
    expect(audited).toEqual(["review.publish", "review.hide"]);
    await expect(moderateReviewAction("мусор", "hide")).rejects.toMatchObject({ status: 400 });
    signIn(anna);
    await expect(moderateReviewAction(id, "hide")).rejects.toMatchObject({ status: 403 });
    expect(moderated).toHaveLength(2);
  });

  it("redirect() действия в mybook-api повторяется на сайте", async () => {
    fake.sales = {
      deals: {
        findById: async (dealId: string) => ({ id: dealId, number: 7, title: "Книга", amount: 1000, assigneeId: null, clientId: null }),
        delete: async () => {},
      },
    };
    const { deleteDealAction } = await import("@/app/admin/deals/actions");
    signIn(owner);
    vi.stubGlobal("fetch", fetchViaApp);
    vi.stubEnv("WEB_USE_API_V1", "crm");
    const err = await deleteDealAction("4a1b2c3d-1111-4222-8333-444444444444").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(Redirect);
    expect((err as InstanceType<typeof Redirect>).url).toBe("/admin/deals");
    expect(audited).toEqual(["deal.delete"]);
  });
});
