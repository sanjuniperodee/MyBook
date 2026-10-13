import { describe, expect, it } from "vitest";
import { createHmac } from "node:crypto";
import { gowaChatId, gowaJid, parseGowaWebhook } from "@/modules/messaging/domain/gowa";
import type { Conversation } from "@/modules/messaging/domain";
import { GowaClient, GowaError, verifyGowaSignature } from "@/modules/messaging/infrastructure/gowa";
import { whatsappTransport } from "@/modules/messaging/infrastructure/adapters";

const media = (path: string) => `/media?path=${path}`;
const device = "77001112233@s.whatsapp.net";
const message = (payload: Record<string, unknown>) => ({ event: "message", device_id: device, payload: { id: "3EB0A1", chat_id: "77011234567@s.whatsapp.net", from: "77011234567@s.whatsapp.net", from_name: "Айгерим", timestamp: "2026-10-13T10:30:00Z", is_from_me: false, ...payload } });

describe("GOWA: протокол вебхуков", () => {
  it("входящий текст → сообщение инбокса в формате WhatsApp", () => {
    const { messages, statuses } = parseGowaWebhook(message({ body: "Здравствуйте! Хочу книгу маме" }), media);
    expect(statuses).toEqual([]);
    expect(messages).toEqual([
      { externalId: "3EB0A1", channelId: "gowa", chatType: "whatsapp", chatId: "77011234567", at: new Date("2026-10-13T10:30:00Z"), isEcho: false, type: "text", text: "Здравствуйте! Хочу книгу маме", mediaUrl: null, contactName: "Айгерим", avatarUrl: null, status: null },
    ]);
  });

  it("ответ с телефона магазина — эхо, без переименования контакта", () => {
    const [m] = parseGowaWebhook(message({ body: "Добрый день!", is_from_me: true, from: device, from_name: "MyBooks" }), media).messages;
    expect(m).toMatchObject({ isEcho: true, contactName: "", chatId: "77011234567" });
  });

  it("вложения: путь от шлюза → ссылка нашего прокси, подпись — в тексте", () => {
    expect(parseGowaWebhook(message({ image: "statics/media/1-a.jpeg" }), media).messages[0]).toMatchObject({ type: "image", text: "📷 Фото", mediaUrl: "/media?path=statics/media/1-a.jpeg" });
    expect(parseGowaWebhook(message({ body: "Вот фото", image: { path: "statics/media/2-b.jpeg", caption: "Вот фото" } }), media).messages[0]).toMatchObject({ type: "image", text: "Вот фото", mediaUrl: "/media?path=statics/media/2-b.jpeg" });
    expect(parseGowaWebhook(message({ audio: "statics/media/3.ogg" }), media).messages[0]).toMatchObject({ type: "audio", text: "🎤 Голосовое сообщение" });
    expect(parseGowaWebhook(message({ document: { path: "statics/media/report.pdf", caption: "Отчёт" }, body: "Отчёт" }), media).messages[0]).toMatchObject({ type: "document" });
    // Без автоскачивания шлюз отдаёт зашифрованную ссылку WhatsApp — она бесполезна, вложение без файла.
    expect(parseGowaWebhook(message({ image: { url: "https://mmg.whatsapp.net/x" } }), media).messages[0]).toMatchObject({ type: "image", mediaUrl: null });
    // Путь с выходом из каталога не принимаем.
    expect(parseGowaWebhook(message({ image: "statics/media/../../etc/passwd" }), media).messages[0].mediaUrl).toBeNull();
    expect(parseGowaWebhook(message({ location: { degreesLatitude: 43.2, degreesLongitude: 76.9 } }), media).messages[0]).toMatchObject({ type: "geo", text: "📍 Геопозиция" });
  });

  it("группы, рассылки, опросы и пустые служебные сообщения не попадают в CRM", () => {
    expect(parseGowaWebhook(message({ chat_id: "120363402106@g.us", body: "Всем привет" }), media).messages).toEqual([]);
    expect(parseGowaWebhook(message({ chat_id: "status@broadcast", body: "статус" }), media).messages).toEqual([]);
    expect(parseGowaWebhook(message({ body: "Poll: Lunch?", poll: { type: "creation" } }), media).messages).toEqual([]);
    expect(parseGowaWebhook(message({}), media).messages).toEqual([]);
    expect(parseGowaWebhook({ event: "message.reaction", payload: { id: "r", chat_id: "1@s.whatsapp.net", reaction: "👍" } }, media)).toEqual({ messages: [], statuses: [] });
    expect(parseGowaWebhook("мусор", media)).toEqual({ messages: [], statuses: [] });
  });

  it("скрытый номер (LID) хранится целиком — на него можно ответить", () => {
    expect(parseGowaWebhook(message({ chat_id: "251556368777322@lid", body: "Привет" }), media).messages[0].chatId).toBe("251556368777322@lid");
    expect(gowaChatId("77011234567:12@s.whatsapp.net")).toBe("77011234567");
    expect(gowaJid("77011234567")).toBe("77011234567@s.whatsapp.net");
    expect(gowaJid("+7 701 123-45-67")).toBe("77011234567@s.whatsapp.net");
    expect(gowaJid("251556368777322@lid")).toBe("251556368777322@lid");
  });

  it("статусы доставки: доставлено и прочитано клиентом; свои отметки о прочтении — мимо", () => {
    const ack = (from: string, receipt: string) => ({ event: "message.ack", device_id: device, payload: { ids: ["m1", "m2"], chat_id: "77011234567@s.whatsapp.net", from, receipt_type: receipt } });
    expect(parseGowaWebhook(ack("77011234567@s.whatsapp.net", "delivered"), media).statuses).toEqual([
      { externalId: "m1", status: "delivered", error: null },
      { externalId: "m2", status: "delivered", error: null },
    ]);
    expect(parseGowaWebhook(ack("77011234567@s.whatsapp.net", "read"), media).statuses.map((s) => s.status)).toEqual(["read", "read"]);
    expect(parseGowaWebhook(ack(device, "read"), media).statuses).toEqual([]);
    expect(parseGowaWebhook(ack("77011234567@s.whatsapp.net", "played"), media).statuses).toEqual([]);
  });

  it("подпись вебхука: X-Hub-Signature-256 = sha256=<hex HMAC>", () => {
    const body = JSON.stringify(message({ body: "hi" }));
    const sig = `sha256=${createHmac("sha256", "secret").update(body).digest("hex")}`;
    expect(verifyGowaSignature(body, sig, "secret")).toBe(true);
    expect(verifyGowaSignature(body, sig.replace("sha256=", ""), "secret")).toBe(true);
    expect(verifyGowaSignature(body, sig, "other")).toBe(false);
    expect(verifyGowaSignature(body, "sha256=zz", "secret")).toBe(false);
    expect(verifyGowaSignature(body, null, "secret")).toBe(false);
  });
});

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const config = async () => ({ baseUrl: "http://gowa:3000/", basicAuth: "admin:pass" });

describe("GOWA: клиент шлюза", () => {
  it("отправка текста: JID, логин шлюза, id сообщения для статусов", async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    const client = new GowaClient(config, async (url, init) => {
      calls.push({ url: String(url), init: init! });
      return json({ code: "SUCCESS", results: { message_id: "3EB0B4", status: "ok" } });
    });
    expect(await client.sendText("77011234567", "Добрый день!")).toBe("3EB0B4");
    expect(calls[0].url).toBe("http://gowa:3000/send/message");
    expect(calls[0].init.headers).toMatchObject({ Authorization: `Basic ${Buffer.from("admin:pass").toString("base64")}`, "Content-Type": "application/json" });
    expect(JSON.parse(String(calls[0].init.body))).toEqual({ phone: "77011234567@s.whatsapp.net", message: "Добрый день!" });
  });

  it("состояние: привязанный номер; шлюз недоступен — reachable=false, без исключения", async () => {
    const ok = new GowaClient(config, async () => json({ results: { is_connected: true, is_logged_in: true, jid: "77001112233:5@s.whatsapp.net" } }));
    expect(await ok.status()).toEqual({ reachable: true, connected: true, loggedIn: true, phone: "77001112233" });
    const down = new GowaClient(config, async () => {
      throw new TypeError("fetch failed");
    });
    expect(await down.status()).toEqual({ reachable: false, connected: false, loggedIn: false, phone: "" });
  });

  it("QR: картинку со шлюза забираем сервером и отдаём data-URL", async () => {
    const paths: string[] = [];
    const client = new GowaClient(config, async (url) => {
      const u = new URL(String(url));
      paths.push(u.pathname);
      if (u.pathname === "/app/login") return json({ results: { qr_link: "http://localhost:3000/statics/images/qrcode/scan-qr-1.png", qr_duration: 30 } });
      return new Response(new Uint8Array([137, 80, 78, 71]), { status: 200 });
    });
    const qr = await client.loginQr();
    expect(paths).toEqual(["/app/login", "/statics/images/qrcode/scan-qr-1.png"]);
    expect(qr).toEqual({ image: "data:image/png;base64,iVBORw==", seconds: 30 });
  });

  it("ошибки шлюза — понятным текстом; файл — только из каталога вложений", async () => {
    const unauthorized = new GowaClient(config, async () => json({ code: "UNAUTHORIZED" }, 401));
    await expect(unauthorized.sendText("77011234567", "x")).rejects.toThrow("Шлюз WhatsApp не принял логин и пароль");
    const bad = new GowaClient(config, async () => json({ code: "INVALID_JID", message: "phone is not on whatsapp" }, 400));
    const err = await bad.sendText("77011234567", "x").catch((e) => e);
    expect(GowaError.is(err)).toBe(true);
    expect(err.message).toBe("WhatsApp: phone is not on whatsapp");
    await expect(bad.media("../storages/whatsapp.db")).rejects.toThrow("Неверный путь к файлу");
  });
});

describe("GOWA: транспорт исходящих", () => {
  const conv = (p: Partial<Conversation>): Conversation => ({ id: "c1", channel: "whatsapp", channelId: "gowa", chatId: "77011234567", contactName: "", avatarUrl: null, clientId: null, dealId: null, assigneeId: null, botStep: null, meta: {}, ...p });
  const gowa = (sent: string[]) => new GowaClient(config, async (_url, init) => (sent.push(String(init?.body)), json({ results: { message_id: "g1" } })));

  it("диалоги шлюза и все WhatsApp-диалоги при выбранном GOWA уходят через шлюз", async () => {
    const sent: string[] = [];
    const transport = whatsappTransport(gowa(sent), async () => "gowa");
    expect(await transport.send(conv({}), "m1", "Привет")).toEqual({ ok: true, externalId: "g1" });
    // Диалог, начатый при Wazzup, после перехода на шлюз продолжается через шлюз.
    expect(await transport.send(conv({ channelId: "wazzup-channel" }), "m2", "Ещё")).toEqual({ ok: true, externalId: "g1" });
    expect(sent).toHaveLength(2);
  });

  it("чат на сайте и прочие каналы — как раньше", async () => {
    const sent: string[] = [];
    const transport = whatsappTransport(gowa(sent), async () => "gowa");
    expect(await transport.send(conv({ channel: "site", channelId: "" }), "m1", "Ответ")).toEqual({ ok: true, externalId: null });
    expect(sent).toEqual([]);
  });

  it("ошибка шлюза — текстом в статус сообщения", async () => {
    const transport = whatsappTransport(new GowaClient(config, async () => json({ message: "not logged in" }, 500)), async () => "gowa");
    expect(await transport.send(conv({}), "m1", "Привет")).toEqual({ ok: false, error: "WhatsApp: not logged in" });
  });
});
