import { Body, Controller, Headers, Module, Param } from "@nestjs/common";
import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import { createHmac } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { LOCALE_HEADER, type Locale } from "@/i18n/config";
import { StaffContext } from "@/modules/access/domain/StaffContext";
import { isPhoneEmail, type CurrentUser as AuthUser } from "@/modules/identity";
import { loadConfig } from "../src/core/config/app-config";
import { CurrentUser } from "../src/core/auth/current-user.decorator";
import { STAFF_ACCESS, type StaffAccessPort, type StaffMember } from "../src/core/auth/staff";
import { CurrentStaff, Permissions } from "../src/core/auth/staff.decorators";
import { RequestLocale, SessionToken } from "../src/core/http/decorators";
import { Endpoint } from "../src/core/http/endpoint";
import { RawBody, SiteRoute } from "../src/core/http/site-route";
import { bootTestApp, sessionOf, testUser } from "./app";

const HMAC_SECRET = "kaspi-test-secret";
const ORIGIN = loadConfig().appUrl;
const sign = (raw: Buffer) => createHmac("sha256", HMAC_SECRET).update(raw).digest("hex");

@Controller()
class TestSiteController {
  @SiteRoute("POST", "/api/payments/kaspi/webhook", { auth: "none" })
  kaspiWebhook(@RawBody() raw: Buffer, @Headers("x-signature") sig: string | undefined, @Body() parsed: unknown) {
    return {
      raw: raw.toString("utf8"),
      validSig: sig === sign(raw),
      parsedOk: parsed !== undefined,
    };
  }

  @SiteRoute("POST", "/api/payments/cloudpayments/pay", { auth: "none" })
  cpForm(@RawBody() raw: Buffer, @Body() parsed: Record<string, string>) {
    return { raw: raw.toString("utf8"), parsed };
  }

  @SiteRoute("GET", "/api/site-test/boards/{path*}", { auth: "staff" })
  boards(@Param("*") tail: string | undefined, @CurrentStaff() staff: StaffMember) {
    return { tail: tail ?? "", role: staff.roleKey };
  }

  @SiteRoute("GET", "/api/orders/{id}/file", { auth: "user" })
  orderFile(@Param("id") id: string, @Headers("range") range: string | undefined) {
    const data = new TextEncoder().encode(`pdf-${id}`);
    if (range === "bytes=0-2") {
      return new Response(data.slice(0, 3), {
        status: 206,
        headers: {
          "content-type": "application/octet-stream",
          "content-range": `bytes 0-2/${data.length}`,
          "accept-ranges": "bytes",
          etag: '"file-v1"',
        },
      });
    }
    return new Response(data, { status: 200, headers: { "content-type": "application/pdf", etag: '"file-v1"' } });
  }

  @SiteRoute("GET", "/api/public/chat/events", { auth: "none" })
  chatStream() {
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode("event: ping\ndata: 1\n\n"));
        controller.enqueue(encoder.encode("event: msg\ndata: ok\n\n"));
        controller.close();
      },
    });
    return new Response(stream, {
      status: 200,
      headers: { "content-type": "text/event-stream", "cache-control": "no-cache" },
    });
  }

  @SiteRoute("POST", "/api/auth/session-check", { auth: "user", csrf: false })
  loginCookies(@CurrentUser() user: AuthUser) {
    const headers = new globalThis.Headers({ "content-type": "application/json" });
    headers.append("set-cookie", "mb_a=1; Path=/; HttpOnly");
    headers.append("set-cookie", "mb_b=2; Path=/; HttpOnly");
    return new Response(JSON.stringify({ userId: user.id }), { status: 200, headers });
  }

  @SiteRoute("GET", "/api/public/config", { auth: "none", etag: true })
  publicConfig() {
    return { currency: "KZT", version: 2 };
  }

  @SiteRoute("POST", "/api/public/csrf-check", { auth: "none", csrf: true })
  csrfAnon() {
    return { ok: true };
  }

  @SiteRoute("GET", "/api/crm/orders-export", { auth: "staff" })
  @Permissions("orders.edit")
  ordersExport(@CurrentStaff() staff: StaffMember) {
    return { staffId: staff.user.id };
  }

  @SiteRoute("POST", "/api/crm/security/2fa/enroll", { auth: "staff", allowUnconfigured2fa: true })
  enroll2fa(@CurrentStaff() staff: StaffMember, @RequestLocale() locale: Locale) {
    return { gate: staff.gate, locale };
  }

  @SiteRoute("GET", "/api/legacy/http-err", { auth: "none" })
  throwHttpErr() {
    throw Object.assign(new Error("boom"), { [Symbol.for("mybook.http-error")]: true, status: 404, code: "orderNotFound" });
  }

  @SiteRoute("GET", "/api/legacy/next-not-found", { auth: "none" })
  throwNextNotFound() {
    throw Object.assign(new Error("NEXT_NOT_FOUND"), { digest: "NEXT_NOT_FOUND" });
  }

  @Endpoint("webOrdersList")
  probeWebResponse(@SessionToken() token: string | null) {
    return Response.json({ seenToken: token !== null }, { status: 202, headers: { "cache-control": "no-store" } });
  }
}

@Module({ controllers: [TestSiteController] })
class TestSiteModule {}

describe("@SiteRoute и rawBody (NestJS ↔ сайт)", () => {
  let app: NestFastifyApplication | undefined;

  afterEach(async () => {
    await app?.close();
    app = undefined;
  });

  const boot = async (users: AuthUser[] = [], overrides: [unknown, unknown][] = []) => {
    const booted = await bootTestApp({ users, overrides, extraModules: [TestSiteModule] });
    app = booted.app;
    return booted.app;
  };

  it("работает одинаково по /api/... и /api/v1/site/..., в т.ч. {path*} пустой и вложенный", async () => {
    const staff = testUser("staff-1", { role: "admin" });
    const access: StaffAccessPort = {
      async resolve(user) {
        return { context: new StaffContext(user.id, "Менеджер", "sales", "all", new Set(["orders.edit"]), false, { isPhoneEmail }), gate: null };
      },
    };
    const nest = await boot([staff], [[STAFF_ACCESS, access]]);
    const headers = { cookie: `mb_session=${sessionOf(staff)}` };

    for (const url of ["/api/site-test/boards", "/api/v1/site/site-test/boards"]) {
      const res = await nest.inject({ method: "GET", url, headers });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ tail: "", role: "sales" });
    }
    for (const url of ["/api/site-test/boards/col/42", "/api/v1/site/site-test/boards/col/42"]) {
      const res = await nest.inject({ method: "GET", url, headers });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ tail: "col/42", role: "sales" });
    }
  });

  it("сохраняет точные байты rawBody для HMAC на JSON и form-urlencoded и не ломает битый JSON вебхуков", async () => {
    const nest = await boot();
    const exactJson = '{  "txn":   "123", "amount": 500 }';
    const sig = sign(Buffer.from(exactJson, "utf8"));

    for (const url of ["/api/payments/kaspi/webhook", "/api/v1/site/payments/kaspi/webhook"]) {
      const res = await nest.inject({
        method: "POST",
        url,
        headers: { "content-type": "application/json", "x-signature": sig },
        payload: exactJson,
      });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ raw: exactJson, validSig: true, parsedOk: true });
    }

    const badJson = "{not-valid-json";
    const badSite = await nest.inject({
      method: "POST",
      url: "/api/payments/kaspi/webhook",
      headers: { "content-type": "application/json", "x-signature": sign(Buffer.from(badJson, "utf8")) },
      payload: badJson,
    });
    expect(badSite.statusCode).toBe(200);
    expect(badSite.json()).toEqual({ raw: badJson, validSig: true, parsedOk: false });

    const badContract = await nest.inject({
      method: "PUT",
      url: "/api/v1/orders/ord-1/review",
      headers: { "content-type": "application/json" },
      payload: badJson,
    });
    expect(badContract.statusCode).toBe(400);

    const formBody = "TransactionId=99&Amount=1500.00&Status=Completed";
    const formRes = await nest.inject({
      method: "POST",
      url: "/api/payments/cloudpayments/pay",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      payload: formBody,
    });
    expect(formRes.statusCode).toBe(200);
    expect(formRes.json()).toEqual({
      raw: formBody,
      parsed: { TransactionId: "99", Amount: "1500.00", Status: "Completed" },
    });
  });

  it("стримит Web Response (Range 206, бинарное, SSE, несколько Set-Cookie) и считает ETag/304", async () => {
    const user = testUser("u-1");
    const nest = await boot([user]);
    const auth = { authorization: `Bearer ${sessionOf(user)}` };

    const range = await nest.inject({ method: "GET", url: "/api/orders/ord-9/file", headers: { ...auth, range: "bytes=0-2" } });
    expect(range.statusCode).toBe(206);
    expect(range.headers["content-range"]).toBe("bytes 0-2/9");
    expect(range.headers.etag).toBe('"file-v1"');
    expect(range.body).toBe("pdf");

    const sse = await nest.inject({ method: "GET", url: "/api/public/chat/events" });
    expect(sse.statusCode).toBe(200);
    expect(sse.headers["content-type"]).toContain("text/event-stream");
    expect(sse.body).toBe("event: ping\ndata: 1\n\nevent: msg\ndata: ok\n\n");

    const cookies = await nest.inject({ method: "POST", url: "/api/auth/session-check", headers: auth });
    expect(cookies.statusCode).toBe(200);
    expect(cookies.headers["set-cookie"]).toEqual(["mb_a=1; Path=/; HttpOnly", "mb_b=2; Path=/; HttpOnly"]);
    expect(cookies.json()).toEqual({ userId: "u-1" });

    const cfg1 = await nest.inject({ method: "GET", url: "/api/public/config" });
    expect(cfg1.statusCode).toBe(200);
    expect(cfg1.headers.etag).toBeTruthy();
    const cfg304 = await nest.inject({
      method: "GET",
      url: "/api/v1/site/public/config",
      headers: { "if-none-match": String(cfg1.headers.etag) },
    });
    expect(cfg304.statusCode).toBe(304);
    expect(cfg304.body).toBe("");

    const webResp = await nest.inject({
      method: "GET",
      url: "/api/v1/web/orders",
      headers: { cookie: `mb_session=${sessionOf(user)}` },
    });
    expect(webResp.statusCode).toBe(202);
    expect(webResp.headers["cache-control"]).toBe("no-store");
    expect(webResp.headers.etag).toBeUndefined();
    expect(webResp.json()).toEqual({ seenToken: true });
  });

  it("отдаёт 405 с Allow для маршрутов сайта и переводит HttpError / NEXT_NOT_FOUND в формат сайта", async () => {
    const nest = await boot();

    for (const url of ["/api/payments/kaspi/webhook", "/api/v1/site/payments/kaspi/webhook"]) {
      const res = await nest.inject({ method: "GET", url });
      expect(res.statusCode).toBe(405);
      expect(res.headers.allow).toBe("POST");
    }

    const missing = await nest.inject({ method: "GET", url: "/api/no-such-route" });
    expect(missing.statusCode).toBe(404);
    expect(missing.json()).toEqual({ error: "Not found", code: "notFound" });

    const routesList = await nest.inject({ method: "GET", url: "/api/v1/__nest/routes" });
    expect(routesList.statusCode).toBe(200);
    expect(routesList.json().routes).toContainEqual({ method: "POST", path: "/api/payments/kaspi/webhook" });
    expect(routesList.json().routes).toContainEqual({ method: "POST", path: "/api/v1/site/payments/kaspi/webhook" });

    const httpErr = await nest.inject({ method: "GET", url: "/api/legacy/http-err" });
    expect(httpErr.statusCode).toBe(404);
    expect(httpErr.json().code).toBe("orderNotFound");

    const next404 = await nest.inject({ method: "GET", url: "/api/legacy/next-not-found" });
    expect(next404.statusCode).toBe(404);
    expect(next404.json().code).toBe("notFound");
  });

  it("проверяет CSRF, сессию, StaffGuard, 2FA и @Permissions на @SiteRoute", async () => {
    const staff = testUser("staff-2", { role: "admin" });
    const need2fa: StaffAccessPort = {
      async resolve(user) {
        return { context: new StaffContext(user.id, "Менеджер", "sales", "all", new Set(["chats.view"]), false, { isPhoneEmail }), gate: "2fa" };
      },
    };
    const nest = await boot([staff], [[STAFF_ACCESS, need2fa]]);
    const headers = { cookie: `mb_session=${sessionOf(staff)}` };

    const csrfAnon = await nest.inject({ method: "POST", url: "/api/public/csrf-check", headers: { origin: "https://evil.example" } });
    expect(csrfAnon.statusCode).toBe(403);

    const noSession = await nest.inject({ method: "GET", url: "/api/crm/orders-export" });
    expect(noSession.statusCode).toBe(401);

    const no2faDenied = await nest.inject({ method: "GET", url: "/api/crm/orders-export", headers });
    expect(no2faDenied.statusCode).toBe(403);

    const enroll = await nest.inject({
      method: "POST",
      url: "/api/crm/security/2fa/enroll",
      headers: { ...headers, origin: ORIGIN, [LOCALE_HEADER]: "kk" },
    });
    expect(enroll.statusCode).toBe(200);
    expect(enroll.json()).toEqual({ gate: "2fa", locale: "kk" });

    await nest.close();
    const okAccess: StaffAccessPort = {
      async resolve(user) {
        return { context: new StaffContext(user.id, "Менеджер", "sales", "all", new Set(["chats.view"]), false, { isPhoneEmail }), gate: null };
      },
    };
    const nest2 = await boot([staff], [[STAFF_ACCESS, okAccess]]);
    const noPerm = await nest2.inject({ method: "GET", url: "/api/crm/orders-export", headers });
    expect(noPerm.statusCode).toBe(403);
  });
});
