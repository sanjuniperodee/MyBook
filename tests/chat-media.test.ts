import { beforeEach, describe, expect, it, vi } from "vitest";
import { gowaMediaUrl, isGowaMediaPath, parseGowaWebhook } from "@/modules/messaging/domain/gowa";
import { GET as proxyRoute } from "@/app/api/admin/whatsapp/media/route";
import { fake, owner, resetContainer, resetRequest, signIn } from "./doubles/web";

vi.mock("next/headers", async () => (await import("./doubles/web")).nextHeaders);
vi.mock("next/navigation", async () => (await import("./doubles/web")).nextNavigation);
vi.mock("next/cache", async () => (await import("./doubles/web")).nextCache);
vi.mock("@/server/container", async () => (await import("./doubles/web")).containerModule);
vi.mock("@/shared/infrastructure/database", () => ({ rootDb: {}, executor: () => ({}) }));

const VOICE = "statics/media/77011234567/2026-10-14/3EB0C127D7BACC83D6A1.oga";

describe("Вложения WhatsApp: путь к файлу шлюза", () => {
  it("statics/media/<файл> и вложенные каталоги — да; выход из каталога, точки, пустые сегменты и чужие каталоги — нет", () => {
    expect(isGowaMediaPath("statics/media/1-a.jpeg")).toBe(true);
    expect(isGowaMediaPath(VOICE)).toBe(true);
    expect(isGowaMediaPath("statics/media/251556368777322_lid/2026-10-14/a_b-c.ogg")).toBe(true);
    for (const bad of [
      "statics/media/../../etc/passwd",
      "statics/media/77011234567/../../storages/whatsapp.db",
      "statics/media/./x.ogg",
      "statics/media/.hidden",
      "statics/media/a/..",
      "statics/media//x.ogg",
      "statics/media/",
      "statics/media",
      "/statics/media/x.ogg",
      "statics/images/qrcode/scan.png",
      "storages/whatsapp.db",
      "statics/media/a%2F..%2Fb",
      "statics/media/a\\..\\b",
      "statics/media/фото.jpg",
      "statics/media/x.ogg?y=1",
      `statics/media/${"a/".repeat(10)}x`,
      "",
    ])
      expect(isGowaMediaPath(bad), bad).toBe(false);
  });

  it("вебхук принимает вложенный путь, отбрасывает выход из каталога", () => {
    const hook = (payload: Record<string, unknown>) => parseGowaWebhook({ event: "message", payload: { id: "3EB0A1", chat_id: "77011234567@s.whatsapp.net", timestamp: "2026-10-13T10:30:00Z", ...payload } }, gowaMediaUrl).messages[0];
    expect(hook({ audio: { path: VOICE } })).toMatchObject({ type: "audio", mediaUrl: `/api/admin/whatsapp/media?path=${encodeURIComponent(VOICE)}` });
    expect(hook({ audio: "statics/media/77011234567/../../../storages/whatsapp.db" })).toMatchObject({ type: "audio", mediaUrl: null });
  });
});

describe("GET /api/admin/whatsapp/media: прокси файла шлюза", () => {
  beforeEach(() => {
    resetRequest();
    resetContainer();
    signIn(owner);
    fake.messaging = { gowa: { media: async () => new Response("OggS", { headers: { "Content-Type": "application/ogg" } }) } };
  });
  const get = (path: string) => proxyRoute(new Request(`http://localhost/api/admin/whatsapp/media?path=${encodeURIComponent(path)}`), {});

  it("вложенный путь — отдаётся; выход из каталога — 404", async () => {
    expect((await get(VOICE)).status).toBe(200);
    expect((await get("statics/media/77011234567/../../storages/whatsapp.db")).status).toBe(404);
  });
});
