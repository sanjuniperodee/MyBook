import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Вебхук шлюза WhatsApp (GOWA) в бэкенде на Nest — настоящий обработчик сайта src/server/site-handlers/integrations/gowa.ts
 * через мост site-ops. 27.11 после переезда на Nest он падал на after() (фото профиля нового клиента): «вызов прокладки
 * next/* вне HTTP-запроса» → статусы, правки и удаления той же пачки не применялись, шлюзу уходил 500.
 */
const calls: string[] = [];
const messaging = {
  verifyGowaWebhook: vi.fn(async (_raw: string, sig: string | null) => sig === "sha256=ok"),
  kickAvatars: vi.fn(async () => void calls.push("kickAvatars")),
  chats: {
    ingest: vi.fn(async (m: { externalId: string }) => void calls.push(`ingest:${m.externalId}`)),
    applyStatus: vi.fn(async () => void calls.push("status")),
    applyExternalEdit: vi.fn(async () => void calls.push("edit")),
    applyExternalRevoke: vi.fn(async () => void calls.push("revoke")),
  },
};
vi.mock("@/server/container", () => ({ container: () => ({ messaging }) }));


const { nestApi } = await import("./api");
const api = await nestApi();

const device = "77001112233@s.whatsapp.net";
const message = (payload: Record<string, unknown>) => ({ event: "message", device_id: device, payload: { id: "3EB0A1", chat_id: "77011234567@s.whatsapp.net", from: "77011234567@s.whatsapp.net", from_name: "Айгерим", timestamp: "2026-10-13T10:30:00Z", is_from_me: false, ...payload } });
const post = (body: unknown, sig = "sha256=ok") =>
  api(new Request("http://127.0.0.1:3044/api/integrations/gowa", { method: "POST", headers: { "content-type": "application/json", "x-hub-signature-256": sig }, body: JSON.stringify(body) }));
const settle = () => new Promise((r) => setImmediate(() => setImmediate(r)));

beforeEach(() => {
  calls.length = 0;
  vi.clearAllMocks();
});

describe("вебхук GOWA через бэкенд на Nest", () => {
  it("входящее от клиента: сообщение принято, 200, фото профиля — после ответа (after), без ошибки", async () => {
    const err = vi.spyOn(console, "error");
    const res = await post(message({ body: "Здравствуйте! Хочу книгу маме" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(calls).toEqual(["ingest:3EB0A1"]);
    await settle();
    expect(calls).toEqual(["ingest:3EB0A1", "kickAvatars"]);
    expect(err).not.toHaveBeenCalled();
    err.mockRestore();
  });

  it("эхо с телефона магазина — без фото профиля; оба префикса адреса", async () => {
    for (const url of ["/api/integrations/gowa", "/api/v1/site/integrations/gowa"]) {
      calls.length = 0;
      const res = await api(
        new Request(`http://127.0.0.1:3044${url}`, { method: "POST", headers: { "content-type": "application/json", "x-hub-signature-256": "sha256=ok" }, body: JSON.stringify(message({ body: "Добрый день!", is_from_me: true, from: device })) }),
      );
      expect(res.status, url).toBe(200);
      await settle();
      expect(calls, url).toEqual(["ingest:3EB0A1"]);
    }
  });

  it("сбой задачи после ответа — только в лог, ответ шлюзу уже 200", async () => {
    messaging.kickAvatars.mockRejectedValueOnce(new Error("WhatsApp недоступен"));
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    expect((await post(message({ body: "Привет" }))).status).toBe(200);
    await settle();
    expect(err).toHaveBeenCalledWith("[site-ops] after()", expect.any(Error));
    err.mockRestore();
  });

  it("чужая подпись — 403, ничего не принято", async () => {
    expect((await post(message({ body: "Привет" }), "sha256=bad")).status).toBe(403);
    await settle();
    expect(calls).toEqual([]);
  });
});
