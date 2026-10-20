import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { gowaDownloadable, gowaDownloadPhone, gowaMediaPath, gowaMediaType, gowaMediaUrl, isGowaMediaPath, parseGowaWebhook } from "@/modules/messaging/domain/gowa";
import type { Conversation } from "@/modules/messaging/domain";
import { ChatMediaService, MEDIA_RETRY_MS, type MediaFile, type MediaGateway, type MessageMedia } from "@/modules/messaging/application";
import { GowaClient } from "@/modules/messaging/infrastructure/gowa";
import { gowaMediaGateway } from "@/modules/messaging/infrastructure/adapters";
import { GET as mediaRoute } from "@/app/api/admin/chats/messages/[id]/media/route";
import { GowaError, MediaUnavailableError } from "@/modules/messaging";
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
    const hook = (payload: Record<string, unknown>) => parseGowaWebhook({ event: "message", payload: { id: "3EB0A1", chat_id: "77011234567@s.whatsapp.net", timestamp: "2026-10-13T10:30:00Z", ...payload } }).messages[0];
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

describe("GowaClient: файл вложения", () => {
  const config = async () => ({ baseUrl: "http://gowa:3000", basicAuth: "" });

  it("Range браузера уходит шлюзу, часть файла — 206 с Content-Range", async () => {
    const asked: (string | null)[] = [];
    const gateway = gowaMediaGateway(
      new GowaClient(config, async (_url, init) => {
        const range = new Headers(init?.headers).get("range");
        asked.push(range);
        return range ? new Response("Og", { status: 206, headers: { "Content-Range": "bytes 0-1/4", "Content-Length": "2" } }) : new Response("OggS");
      }),
    );
    expect(await gateway.file(VOICE, "bytes=0-1")).toMatchObject({ range: "bytes 0-1/4", size: "2" });
    expect(await gateway.file(VOICE)).toMatchObject({ range: null });
    expect(asked).toEqual(["bytes=0-1", null]);
  });

  it("таймаут — только на ожидание ответа: медленное тело файла не обрывается", async () => {
    vi.useFakeTimers();
    try {
      let signal: AbortSignal | undefined;
      const client = new GowaClient(config, async (_url, init) => ((signal = init?.signal ?? undefined), new Response("OggS")));
      await client.media(VOICE);
      await vi.advanceTimersByTimeAsync(60_000);
      expect(signal?.aborted).toBe(false);
    } finally {
      vi.useRealTimers();
    }
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

describe("ChatMediaService: скачивание вложения по ссылке канала (для распознавания)", () => {
  afterEach(() => vi.unstubAllGlobals());
  const service = (mediaUrl: string, hosts?: string[]) =>
    new ChatMediaService({ findById: async () => conv({ channelId: "wz-channel" }) }, { media: async () => voice({ mediaUrl }), saveMediaUrl: async () => {} }, { download: async () => "x", file: async () => null }, async () => false, Date.now, null, hosts);

  it("Wazzup по https — качается, без переадресаций; внутренний адрес, http, чужой хост — нет (SSRF)", async () => {
    const fetched: { url: string; redirect?: string }[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit) => (fetched.push({ url, redirect: init.redirect }), new Response("OggS", { headers: { "content-type": "audio/ogg" } }))));
    expect(await service("https://store.wazzup24.com/a.ogg").bytes("m1")).toMatchObject({ mime: "audio/ogg" });
    expect(fetched).toEqual([{ url: "https://store.wazzup24.com/a.ogg", redirect: "error" }]);
    for (const bad of ["http://store.wazzup24.com/a.ogg", "https://169.254.169.254/latest/meta-data/", "https://intranet.local/a", "https://store.wazzup24.com.attacker.io/a"]) expect(await service(bad).bytes("m1")).toBeNull();
    expect(fetched).toHaveLength(1);
    // Свой хост — только если его разрешили (CHAT_MEDIA_HOSTS).
    expect(await service("https://files.example.org/a.ogg", ["example.org"]).bytes("m1")).not.toBeNull();
  });

  it("файл больше лимита — не читается целиком", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("x".repeat(100), { headers: { "content-length": "100" } })));
    expect(await service("https://store.wazzup24.com/a.ogg").bytes("m1", 10)).toBeNull();
  });
});

describe("ChatMediaService: шлюз не смог скачать файл", () => {
  it("повторно шлюз не спрашиваем MEDIA_RETRY_MS, потом пробуем снова", async () => {
    let now = 1_000_000;
    let downloads = 0;
    const message = voice();
    const service = new ChatMediaService(
      { findById: async () => conv() },
      { media: async () => message, saveMediaUrl: async () => {} },
      {
        download: async () => {
          downloads++;
          throw new GowaError("WhatsApp: media not found");
        },
        file: async () => null,
      },
      async () => false,
      () => now,
    );
    const att = (await service.find("m1"))!;
    await expect(service.open(att)).rejects.toThrow("WhatsApp: media not found");
    const again = await service.open(att).catch((e: unknown) => e);
    expect(MediaUnavailableError.is(again)).toBe(true);
    expect(downloads).toBe(1);
    now += MEDIA_RETRY_MS;
    await expect(service.open(att)).rejects.toThrow("WhatsApp: media not found");
    expect(downloads).toBe(2);
  });
});

describe("GET /api/admin/chats/messages/[id]/media", () => {
  const MSG = "0d0d0d0d-0000-4000-8000-0000000000aa";
  const ctx = (id = MSG) => ({ params: Promise.resolve({ id }) });
  const get = (id?: string, headers?: Record<string, string>) => mediaRoute(new Request(`http://localhost/api/admin/chats/messages/${id ?? MSG}/media`, { headers }), ctx(id));
  let assigneeId: string | null;
  let dealId: string | null;
  let ranges: (string | null | undefined)[];
  let open: () => Promise<MediaFile | null>;
  let opened: number;

  beforeEach(() => {
    resetRequest();
    resetContainer();
    signIn(owner);
    assigneeId = null;
    dealId = null;
    ranges = [];
    opened = 0;
    open = async () => ({ body: body("OggS"), contentType: "audio/ogg", size: "4" });
    fake.messaging = {
      media: {
        find: async (id: string) => (id === MSG ? { message: voice({ id: MSG }), conversation: conv({ assigneeId, dealId }) } : null),
        open: async (_att: unknown, range?: string | null) => (opened++, ranges.push(range), open()),
      },
    };
    fake.sales = { deals: { findById: async (id: string) => (id === "deal-dina" ? { id, assigneeId: "dina" } : id === "deal-boss" ? { id, assigneeId: "boss" } : null) } };
  });

  it("чужой диалог, но привязан к своей сделке (её страница показывает переписку) — 200; к чужой — 403", async () => {
    signIn(dina);
    assigneeId = "boss";
    dealId = "deal-dina";
    expect((await get()).status).toBe(200);
    dealId = "deal-boss";
    expect((await get()).status).toBe(403);
  });

  it("Range: один диапазон уходит дальше, ответ 206 с Content-Range; мусор — весь файл", async () => {
    open = async () => ({ body: body("Og"), contentType: "audio/ogg", size: "2", range: "bytes 0-1/4" });
    const res = await get(undefined, { Range: "bytes=0-1" });
    expect(res.status).toBe(206);
    expect(res.headers.get("content-range")).toBe("bytes 0-1/4");
    expect(res.headers.get("accept-ranges")).toBe("bytes");
    await get(undefined, { Range: "bytes=0-1,5-9" });
    await get(undefined, { Range: "bytes=-" });
    expect(ranges).toEqual(["bytes=0-1", null, null]);
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
    open = async () => {
      throw new MediaUnavailableError();
    };
    expect((await get()).status).toBe(502);
  });
});
