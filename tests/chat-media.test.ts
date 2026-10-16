import { beforeEach, describe, expect, it, vi } from "vitest";
import { gowaDownloadable, gowaDownloadPhone, gowaMediaPath, gowaMediaType, gowaMediaUrl, isGowaMediaPath, parseGowaWebhook } from "@/modules/messaging/domain/gowa";
import type { Conversation } from "@/modules/messaging/domain";
import { ChatMediaService, type MediaFile, type MediaGateway, type MessageMedia } from "@/modules/messaging/application";
import { GowaClient } from "@/modules/messaging/infrastructure/gowa";
import { gowaMediaGateway } from "@/modules/messaging/infrastructure/adapters";
import { GET as mediaRoute } from "@/app/api/admin/chats/messages/[id]/media/route";
import { GET as proxyRoute } from "@/app/api/admin/whatsapp/media/route";
import { GowaError } from "@/modules/messaging";
import { client, dina, fake, owner, resetContainer, resetRequest, signIn } from "./doubles/web";

vi.mock("next/headers", async () => (await import("./doubles/web")).nextHeaders);
vi.mock("next/navigation", async () => (await import("./doubles/web")).nextNavigation);
vi.mock("next/cache", async () => (await import("./doubles/web")).nextCache);
vi.mock("@/server/container", async () => (await import("./doubles/web")).containerModule);
vi.mock("@/shared/infrastructure/database", () => ({ rootDb: {}, executor: () => ({}) }));

const VOICE = "statics/media/77011234567/2026-10-14/3EB0C127D7BACC83D6A1.oga";
const conv = (p: Partial<Conversation> = {}): Conversation => ({ id: "c1", channel: "whatsapp", channelId: "gowa", chatId: "77011234567", contactName: "", avatarUrl: null, clientId: null, dealId: null, assigneeId: null, botStep: null, meta: {}, ...p });
const voice = (p: Partial<MessageMedia> = {}): MessageMedia => ({ id: "m1", conversationId: "c1", type: "audio", mediaUrl: null, externalId: "3EB0C127D7BACC83D6A1", ...p });
const body = (text: string) => new Response(text).body!;

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

  it("ссылка нашего прокси ↔ путь шлюза; ссылка Wazzup и подделанный путь — не файл шлюза", () => {
    expect(gowaMediaUrl(VOICE)).toBe(`/api/admin/whatsapp/media?path=${encodeURIComponent(VOICE)}`);
    expect(gowaMediaPath(gowaMediaUrl(VOICE))).toBe(VOICE);
    expect(gowaMediaPath("https://store.wazzup24.com/x.ogg")).toBeNull();
    expect(gowaMediaPath(gowaMediaUrl("statics/media/../x"))).toBeNull();
    expect(gowaMediaPath(null)).toBeNull();
  });

  it("вебхук принимает вложенный путь, отбрасывает выход из каталога", () => {
    const hook = (payload: Record<string, unknown>) => parseGowaWebhook({ event: "message", payload: { id: "3EB0A1", chat_id: "77011234567@s.whatsapp.net", timestamp: "2026-10-13T10:30:00Z", ...payload } }, gowaMediaUrl).messages[0];
    expect(hook({ audio: { path: VOICE } })).toMatchObject({ type: "audio", mediaUrl: gowaMediaUrl(VOICE) });
    expect(hook({ audio: "statics/media/77011234567/../../../storages/whatsapp.db" })).toMatchObject({ type: "audio", mediaUrl: null });
  });

  it("что можно скачать через шлюз: WhatsApp-диалог шлюза, вид с файлом, id сообщения шлюза, номер или LID", () => {
    expect(gowaDownloadPhone("77011234567")).toBe("77011234567");
    expect(gowaDownloadPhone("251556368777322@lid")).toBe("251556368777322@lid");
    for (const bad of ["120363402106@g.us", "a@b.kz", "7701&x=1", "+77011234567", ""]) expect(gowaDownloadPhone(bad), bad).toBeNull();
    expect(gowaDownloadable(conv(), false, voice())).toBe(true);
    expect(gowaDownloadable(conv(), false, voice({ type: "image" }))).toBe(true);
    // Уже есть файл, нет файла у вида, id Wazzup (UUID) или мусор — нет.
    expect(gowaDownloadable(conv(), false, voice({ mediaUrl: gowaMediaUrl(VOICE) }))).toBe(false);
    expect(gowaDownloadable(conv(), false, voice({ type: "geo" }))).toBe(false);
    expect(gowaDownloadable(conv(), false, voice({ externalId: "9f0e8a2c-1b2d-4c3e-8f9a-0b1c2d3e4f5a" }))).toBe(false);
    expect(gowaDownloadable(conv(), false, voice({ externalId: "../x" }))).toBe(false);
    expect(gowaDownloadable(conv(), false, voice({ externalId: null }))).toBe(false);
    // Диалог Wazzup — только когда WhatsApp теперь идёт через шлюз; не WhatsApp — никогда.
    expect(gowaDownloadable(conv({ channelId: "wz-channel" }), false, voice())).toBe(false);
    expect(gowaDownloadable(conv({ channelId: "wz-channel" }), true, voice())).toBe(true);
    expect(gowaDownloadable(conv({ channel: "telegram" }), true, voice())).toBe(false);
    expect(gowaDownloadable(conv({ chatId: "120363402106@g.us" }), false, voice())).toBe(false);
  });

  it("голосовые — audio/ogg вместо application/ogg; остальное как прислал шлюз", () => {
    expect(gowaMediaType("audio", "application/ogg")).toBe("audio/ogg");
    expect(gowaMediaType("audio", null)).toBe("audio/ogg");
    expect(gowaMediaType("audio", "audio/mpeg")).toBe("audio/mpeg");
    expect(gowaMediaType("image", "image/jpeg")).toBe("image/jpeg");
    expect(gowaMediaType("document", null)).toBe("application/octet-stream");
  });
});

describe("GowaClient: скачивание вложения по id сообщения", () => {
  const config = async () => ({ baseUrl: "http://gowa:3000/", basicAuth: "u:p" });
  const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });

  it("GET /message/:id/download?phone=… с устройством магазина; путь из ответа — проверенный", async () => {
    const calls: { url: string; headers: Record<string, string> }[] = [];
    const client = new GowaClient(config, async (url, init) => {
      calls.push({ url: String(url), headers: init?.headers as Record<string, string> });
      return json({ code: "SUCCESS", results: { file_path: VOICE, media_type: "audio", file_size: 5210 } });
    });
    expect(await client.download("3EB0C127D7BACC83D6A1", "77011234567")).toBe(VOICE);
    expect(calls[0].url).toBe("http://gowa:3000/message/3EB0C127D7BACC83D6A1/download?phone=77011234567");
    expect(calls[0].headers).toMatchObject({ "X-Device-Id": "mybooks", Authorization: `Basic ${Buffer.from("u:p").toString("base64")}` });
    await client.download("3EB0C127D7BACC83D6A1", "251556368777322@lid");
    expect(calls[1].url).toBe("http://gowa:3000/message/3EB0C127D7BACC83D6A1/download?phone=251556368777322%40lid");
  });

  it("мусор в id или номере — до запроса к шлюзу; путь вне каталога вложений — ошибка", async () => {
    let called = 0;
    const answer = { file_path: "statics/media/../../storages/whatsapp.db" };
    const client = new GowaClient(config, async () => (called++, json({ results: answer })));
    await expect(client.download("../../app/logout", "77011234567")).rejects.toThrow("Неверный id сообщения или номер");
    await expect(client.download("3EB0C127D7BACC83D6A1", "7701?x=1")).rejects.toThrow("Неверный id сообщения или номер");
    expect(called).toBe(0);
    await expect(client.download("3EB0C127D7BACC83D6A1", "77011234567")).rejects.toThrow("Шлюз вернул неверный путь к файлу");
    Object.assign(answer, { file_path: undefined });
    await expect(client.download("3EB0C127D7BACC83D6A1", "77011234567")).rejects.toThrow("Шлюз вернул неверный путь к файлу");
  });

  it("файл по вложенному пути отдаётся; нет файла в шлюзе — null, а не ошибка", async () => {
    const paths: string[] = [];
    const gateway = gowaMediaGateway(
      new GowaClient(config, async (url) => {
        paths.push(new URL(String(url)).pathname);
        return paths.length === 1 ? new Response("OggS", { headers: { "Content-Type": "application/ogg", "Content-Length": "4" } }) : new Response("not found", { status: 404 });
      }),
    );
    const file = await gateway.file(VOICE);
    expect(file).toMatchObject({ contentType: "application/ogg", size: "4" });
    expect(await new Response(file!.body).text()).toBe("OggS");
    expect(paths[0]).toBe(`/${VOICE}`);
    expect(await gateway.file(VOICE)).toBeNull();
  });
});

describe("ChatMediaService: файл открывается по id сообщения", () => {
  function setup(message: MessageMedia, c: Conversation = conv(), opts: { viaGowa?: boolean; files?: Record<string, string> } = {}) {
    const files = opts.files ?? {};
    const downloads: string[] = [];
    const saved: string[] = [];
    const gateway: MediaGateway = {
      download: async (id, chatId) => {
        downloads.push(`${id}:${chatId}`);
        files[VOICE] = "OggS";
        return VOICE;
      },
      file: async (path): Promise<MediaFile | null> => (path in files ? { body: body(files[path]), contentType: "application/ogg", size: null } : null),
    };
    const service = new ChatMediaService(
      { findById: async (id) => (id === c.id ? c : null) },
      {
        media: async (id) => (id === message.id ? message : null),
        saveMediaUrl: async (_id, url) => void (saved.push(url), (message.mediaUrl = url)),
      },
      gateway,
      async () => !!opts.viaGowa,
    );
    return { service, downloads, saved };
  }

  it("история без файла: шлюз качает один раз, путь сохраняется в сообщении, голосовое — audio/ogg", async () => {
    const { service, downloads, saved } = setup(voice());
    const att = (await service.find("m1"))!;
    expect(att.conversation.id).toBe("c1");
    const file = await service.open(att);
    expect(file?.contentType).toBe("audio/ogg");
    expect(await new Response(file!.body).text()).toBe("OggS");
    expect(downloads).toEqual(["3EB0C127D7BACC83D6A1:77011234567"]);
    expect(saved).toEqual([gowaMediaUrl(VOICE)]);
    // Второй раз — уже сохранённый файл, без скачивания.
    await service.open((await service.find("m1"))!);
    expect(downloads).toHaveLength(1);
  });

  it("сохранённый файл отдаётся сразу; шлюз его удалил — качается заново", async () => {
    const kept = setup(voice({ mediaUrl: gowaMediaUrl(VOICE) }), conv(), { files: { [VOICE]: "OggS" } });
    expect(await kept.service.open((await kept.service.find("m1"))!)).not.toBeNull();
    expect(kept.downloads).toEqual([]);
    const gone = setup(voice({ mediaUrl: gowaMediaUrl(VOICE) }));
    expect(await gone.service.open((await gone.service.find("m1"))!)).not.toBeNull();
    expect(gone.downloads).toHaveLength(1);
  });

  it("ссылка Wazzup, диалог не шлюза, сообщения или диалога нет — null, шлюз не спрашиваем", async () => {
    const wazzup = setup(voice({ mediaUrl: "https://store.wazzup24.com/a.ogg" }));
    expect(await wazzup.service.open((await wazzup.service.find("m1"))!)).toBeNull();
    const other = setup(voice(), conv({ channelId: "wz-channel" }));
    expect(await other.service.open((await other.service.find("m1"))!)).toBeNull();
    expect([...wazzup.downloads, ...other.downloads]).toEqual([]);
    // Диалог Wazzup, но WhatsApp теперь идёт через шлюз — качаем через шлюз.
    const switched = setup(voice(), conv({ channelId: "wz-channel" }), { viaGowa: true });
    expect(await switched.service.open((await switched.service.find("m1"))!)).not.toBeNull();
    expect(await setup(voice()).service.find("m2")).toBeNull();
    expect(await setup(voice({ conversationId: "c9" })).service.find("m1")).toBeNull();
  });
});

describe("GET /api/admin/chats/messages/[id]/media", () => {
  const MSG = "0d0d0d0d-0000-4000-8000-0000000000aa";
  const ctx = (id = MSG) => ({ params: Promise.resolve({ id }) });
  const get = (id?: string) => mediaRoute(new Request(`http://localhost/api/admin/chats/messages/${id ?? MSG}/media`), ctx(id));
  let assigneeId: string | null;
  let open: () => Promise<MediaFile | null>;
  let opened: number;

  beforeEach(() => {
    resetRequest();
    resetContainer();
    signIn(owner);
    assigneeId = null;
    opened = 0;
    open = async () => ({ body: body("OggS"), contentType: "audio/ogg", size: "4" });
    fake.messaging = {
      media: {
        find: async (id: string) => (id === MSG ? { message: voice({ id: MSG }), conversation: conv({ assigneeId }) } : null),
        open: async () => (opened++, open()),
      },
    };
  });

  it("отдаёт файл с audio/ogg, nosniff и песочницей", async () => {
    const res = await get();
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("audio/ogg");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(res.headers.get("content-security-policy")).toBe("sandbox");
    expect(res.headers.get("cache-control")).toBe("private, max-age=86400");
    expect(await res.text()).toBe("OggS");
  });

  it("не сотрудник — 403; чужой диалог у роли «только свои» — 403 без обращения к шлюзу; свой — 200", async () => {
    signIn(client);
    expect((await get()).status).toBe(403);
    signIn(dina);
    assigneeId = "boss";
    expect((await get()).status).toBe(403);
    expect(opened).toBe(0);
    assigneeId = "dina";
    expect((await get()).status).toBe(200);
  });

  it("не UUID — 400; нет сообщения или файла — 404; ошибка шлюза — 502 с текстом", async () => {
    expect((await get("../../etc")).status).toBe(400);
    expect((await get("0d0d0d0d-0000-4000-8000-0000000000bb")).status).toBe(404);
    open = async () => null;
    expect((await get()).status).toBe(404);
    open = async () => {
      throw new GowaError("Шлюз WhatsApp (GOWA) недоступен", "UNREACHABLE");
    };
    const res = await get();
    expect(res.status).toBe(502);
    expect(await res.text()).toBe("Шлюз WhatsApp (GOWA) недоступен");
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
