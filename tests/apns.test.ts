import { generateKeyPairSync, verify } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { APNS_ORIGIN, apnsBody, apnsConfig, apnsJwt, collapseKey, sendApns, type ApnsTransport } from "@/modules/workspace/infrastructure/apns";

const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
const pem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
const cfg = { keyId: "ABC123DEFG", teamId: "TEAM123456", privateKey: pem, topic: "kz.workdesk.mobile", clientTopic: "kz.mybooks.app" };

function transport(status: number, body = ""): ApnsTransport & { calls: { origin: string; path: string; headers: Record<string, string>; body: string }[] } {
  const calls: { origin: string; path: string; headers: Record<string, string>; body: string }[] = [];
  return { calls, post: async (origin, path, headers, b) => (calls.push({ origin, path, headers, body: b }), { status, body }) };
}

describe("push на iPhone: APNs", () => {
  it("настройки: без ключа — выключено; ключ из переменной с \\n или из файла", () => {
    expect(apnsConfig({})).toBeNull();
    expect(apnsConfig({ APNS_KEY_ID: "K", APNS_TEAM_ID: "T" })).toBeNull();
    const c = apnsConfig({ APNS_KEY_ID: "K", APNS_TEAM_ID: "T", APNS_KEY_P8: "-----BEGIN PRIVATE KEY-----\\nabc\\n-----END PRIVATE KEY-----" });
    expect(c?.privateKey).toContain("\nabc\n");
    expect(c?.topic).toBe("kz.workdesk.mobile");
    expect(c?.clientTopic).toBe("kz.mybooks.app");
    expect(apnsConfig({ APNS_KEY_ID: "K", APNS_TEAM_ID: "T", APNS_KEY_P8: "x", APNS_CLIENT_TOPIC: "kz.other.app" })?.clientTopic).toBe("kz.other.app");
    expect(apnsConfig({ APNS_KEY_ID: "K", APNS_TEAM_ID: "T", APNS_KEY_FILE: "/нет/такого/файла.p8" })).toBeNull();
  });

  it("JWT: ES256, kid и iss из настроек, подпись проверяется открытым ключом", () => {
    const jwt = apnsJwt(cfg, 1_800_000_000);
    const [head, claims, sig] = jwt.split(".");
    expect(JSON.parse(Buffer.from(head, "base64url").toString())).toEqual({ alg: "ES256", kid: "ABC123DEFG" });
    expect(JSON.parse(Buffer.from(claims, "base64url").toString())).toEqual({ iss: "TEAM123456", iat: 1_800_000_000 });
    expect(verify("sha256", Buffer.from(`${head}.${claims}`), { key: publicKey, dsaEncoding: "ieee-p1363" }, Buffer.from(sig, "base64url"))).toBe(true);
  });

  it("тело: заголовок, текст, значок, ссылка в payload и служебные ключи плагина уведомлений", () => {
    const b = apnsBody({ title: "Новое сообщение", body: "Здравствуйте", link: "/admin/chats?c=1", badge: 3 });
    expect(b.aps).toMatchObject({ alert: { title: "Новое сообщение", body: "Здравствуйте" }, sound: "default", badge: 3 });
    expect(b.payload).toBe("/admin/chats?c=1");
    expect(b).toMatchObject({ presentAlert: false, presentSound: false, presentBadge: false });
    expect(typeof b.NotificationId).toBe("number");
  });

  it("отправка: окружение выбирает адрес, заголовки APNs, 200 — отправлено", async () => {
    const t = transport(200);
    expect(await sendApns(cfg, { token: "ab".repeat(32), environment: "sandbox" }, { title: "Привет" }, t)).toBe("sent");
    expect(await sendApns(cfg, { token: "cd".repeat(32), environment: "production" }, { title: "Привет" }, t)).toBe("sent");
    expect(t.calls[0].origin).toBe(APNS_ORIGIN.sandbox);
    expect(t.calls[1].origin).toBe(APNS_ORIGIN.production);
    expect(t.calls[0].path).toBe(`/3/device/${"ab".repeat(32)}`);
    expect(t.calls[0].headers).toMatchObject({ "apns-topic": "kz.workdesk.mobile", "apns-push-type": "alert", "apns-priority": "10" });
    // Клиентское «MyBooks» — свой bundle id: токен его устройства с topic продажника Apple отклоняет.
    expect(await sendApns(cfg, { token: "ef".repeat(32), environment: "production", app: "client" }, { title: "Заказ" }, t)).toBe("sent");
    expect(t.calls.at(-1)!.headers).toMatchObject({ "apns-topic": "kz.mybooks.app" });
    expect(t.calls[0].headers.authorization).toMatch(/^bearer [\w-]+\.[\w-]+\.[\w-]+$/);
  });

  it("токен недействителен (410, BadDeviceToken) — gone, чтобы его удалили; прочие отказы и сбои сети — failed", async () => {
    const dev = { token: "ef".repeat(32), environment: "production" };
    expect(await sendApns(cfg, dev, { title: "x" }, transport(410, '{"reason":"Unregistered"}'))).toBe("gone");
    expect(await sendApns(cfg, dev, { title: "x" }, transport(400, '{"reason":"BadDeviceToken"}'))).toBe("gone");
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await sendApns(cfg, dev, { title: "x" }, transport(403, '{"reason":"InvalidProviderToken"}'))).toBe("failed");
    expect(await sendApns(cfg, dev, { title: "x" }, { post: async () => Promise.reject(new Error("socket hang up")) })).toBe("failed");
    log.mockRestore();
  });
});

describe("push на iPhone: значок и одно уведомление на чат", () => {
  it("только значок — без текста и звука, низкий приоритет", async () => {
    expect(apnsBody({ title: "", badge: 3, badgeOnly: true })).toEqual({ aps: { badge: 3 } });
    const t = transport(200);
    await sendApns(cfg, { token: "ab", environment: "production" }, { title: "", badge: 0, badgeOnly: true }, t);
    expect(t.calls[0].headers["apns-priority"]).toBe("5");
    expect(t.calls[0].headers["apns-collapse-id"]).toBeUndefined();
  });

  it("collapse-id — тег уведомления, длинный сворачивается в хеш до 64 байт", async () => {
    const t = transport(200);
    await sendApns(cfg, { token: "ab", environment: "production" }, { title: "Айгерим", collapseId: "message:/admin/chats?c=20bc2e0b-885b-4d12-a10c-c984d0d5630b" }, t);
    expect(t.calls[0].headers["apns-collapse-id"]).toBe("message:/admin/chats?c=20bc2e0b-885b-4d12-a10c-c984d0d5630b");
    expect(collapseKey("x".repeat(65)).length).toBeLessThanOrEqual(64);
    expect(collapseKey("x".repeat(65))).toBe(collapseKey("x".repeat(65)));
  });
});
