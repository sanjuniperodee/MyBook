import { generateKeyPairSync, verify } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fcmAssertion, fcmBody, fcmClientOptions, fcmConfig, sendFcm } from "@/modules/workspace/infrastructure/fcm";

const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const pem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
const account = JSON.stringify({ project_id: "mybooks-crm", client_email: "push@mybooks-crm.iam.gserviceaccount.com", private_key: pem });
const env = { FCM_SERVICE_ACCOUNT: account, FCM_ANDROID_APP_ID: "1:1234567890:android:abc", FCM_API_KEY: "AIzaTest" };

describe("push на Android: FCM", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("настройки: без сервисного аккаунта или данных приложения — выключено; номер проекта — из app id", () => {
    expect(fcmConfig({})).toBeNull();
    expect(fcmConfig({ FCM_SERVICE_ACCOUNT: account })).toBeNull();
    expect(fcmConfig({ ...env, FCM_SERVICE_ACCOUNT: "{не json" })).toBeNull();
    expect(fcmConfig({ ...env, FCM_SERVICE_ACCOUNT: undefined, FCM_SERVICE_ACCOUNT_FILE: "/нет/такого.json" })).toBeNull();
    const c = fcmConfig(env)!;
    expect(c.projectId).toBe("mybooks-crm");
    expect(c.senderId).toBe("1234567890");
    // Телефону — только то, что и так лежит в любом APK: без закрытого ключа.
    expect(fcmClientOptions(c)).toEqual({ apiKey: "AIzaTest", appId: "1:1234567890:android:abc", projectId: "mybooks-crm", senderId: "1234567890" });
    expect(JSON.stringify(fcmClientOptions(c))).not.toContain("PRIVATE");
    expect(fcmClientOptions(null)).toBeNull();
  });

  it("JWT сервисного аккаунта: RS256, scope FCM, подпись проверяется", () => {
    const jwt = fcmAssertion(fcmConfig(env)!, 1_800_000_000);
    const [head, claims, sig] = jwt.split(".");
    const c = JSON.parse(Buffer.from(claims, "base64url").toString());
    expect(c).toMatchObject({ iss: "push@mybooks-crm.iam.gserviceaccount.com", scope: "https://www.googleapis.com/auth/firebase.messaging", exp: 1_800_003_600 });
    expect(verify("RSA-SHA256", Buffer.from(`${head}.${claims}`), publicKey, Buffer.from(sig, "base64url"))).toBe(true);
  });

  it("тело: только data (уведомление рисует приложение), высокий приоритет, ключ схлопывания — тег", () => {
    const b = fcmBody("tok", { title: "Айгерим · WhatsApp", body: "Здравствуйте", link: "/admin/chats?c=1", tag: "message:/admin/chats?c=1", badge: 2 });
    expect(b.message.data).toEqual({ title: "Айгерим · WhatsApp", body: "Здравствуйте", link: "/admin/chats?c=1", tag: "message:/admin/chats?c=1", kind: "", badge: "2" });
    expect(b.message.android).toMatchObject({ priority: "HIGH", collapse_key: "message:/admin/chats?c=1" });
    expect("notification" in b.message).toBe(false);
  });

  it("отправка: токен доступа один на час, удалённое приложение — gone", async () => {
    const calls: string[] = [];
    const fetcher = (async (url: string) => {
      calls.push(url);
      if (url.includes("oauth2")) return new Response(JSON.stringify({ access_token: "ya29", expires_in: 3600 }));
      if (calls.filter((u) => u.includes("messages:send")).length === 1) return new Response("{}");
      return new Response(JSON.stringify({ error: { status: "NOT_FOUND", details: [{ errorCode: "UNREGISTERED" }] } }), { status: 404 });
    }) as unknown as typeof fetch;
    const cfg = fcmConfig(env)!;
    expect(await sendFcm(cfg, "tok", { title: "t" }, fetcher)).toBe("sent");
    expect(await sendFcm(cfg, "tok", { title: "t" }, fetcher)).toBe("gone");
    expect(calls.filter((u) => u.includes("oauth2"))).toHaveLength(1);
    expect(calls.at(-1)).toBe("https://fcm.googleapis.com/v1/projects/mybooks-crm/messages:send");
  });
});
