import { afterEach, describe, expect, it, vi } from "vitest";
import { deflateRawSync } from "node:zlib";
import sharp from "sharp";
import { PDFDocument } from "pdf-lib";
import { defaultBotConfig, mediaUrlAllowed, oggDurationSec, readBotTrace, sniffMedia, type BotConfig } from "@/modules/messaging/domain";
import { BOT_PAUSE_MS, type BotSellerModel, type RoutePolicyView } from "@/modules/messaging/application";
import { officeText } from "@/modules/assistant/infrastructure/documents";
import { DOCUMENT_MAX_CHARS, PDF_MAX_PAGES, askMedia, prepareImage, preparePdf } from "@/modules/assistant/infrastructure/media";
import { aiProviders, type AiConnection } from "@/modules/assistant/domain";
import { BOT_CONFIG, inbound, setup } from "./doubles/botHarness";

// ─── файлы-образцы ──────────────────────────────────────────────────────────

const enc = (s: string) => new TextEncoder().encode(s);
/** OGG/Opus: страница заголовка и последняя страница с позицией granule (длительность = granule / 48000). */
function ogg(seconds = 5): Uint8Array {
  const head = [0x4f, 0x67, 0x67, 0x53, 0, 2, ...Array(22).fill(0), ...enc("OpusHead"), 1, 1, 0, 0];
  const granule = Array.from({ length: 8 }, (_, i) => Number((BigInt(seconds * 48_000) >> BigInt(8 * i)) & 0xffn));
  const last = [0x4f, 0x67, 0x67, 0x53, 0, 4, ...granule, ...Array(14).fill(0)];
  return new Uint8Array([...head, ...Array(64).fill(1), ...last]);
}
const JPEG_HEAD = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46, 0]);
const EXE = new Uint8Array([0x4d, 0x5a, 0x90, 0, 3, 0, 0, 0]);

/** ZIP из файлов (сжатие deflate) — как DOCX/XLSX; flags — для проверки шифрования. */
function zip(files: Record<string, string>, opts: { flags?: number; fakeSize?: number } = {}): Uint8Array {
  const local: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;
  for (const [name, text] of Object.entries(files)) {
    const data = Buffer.from(text, "utf8");
    const packed = deflateRawSync(data);
    const n = Buffer.from(name, "utf8");
    const h = Buffer.alloc(30);
    h.writeUInt32LE(0x04034b50, 0);
    h.writeUInt16LE(20, 4);
    h.writeUInt16LE(opts.flags ?? 0, 6);
    h.writeUInt16LE(8, 8);
    h.writeUInt32LE(packed.length, 18);
    h.writeUInt32LE(opts.fakeSize ?? data.length, 22);
    h.writeUInt16LE(n.length, 26);
    local.push(h, n, packed);
    const c = Buffer.alloc(46);
    c.writeUInt32LE(0x02014b50, 0);
    c.writeUInt16LE(20, 4);
    c.writeUInt16LE(20, 6);
    c.writeUInt16LE(opts.flags ?? 0, 8);
    c.writeUInt16LE(8, 10);
    c.writeUInt32LE(packed.length, 20);
    c.writeUInt32LE(opts.fakeSize ?? data.length, 24);
    c.writeUInt16LE(n.length, 28);
    c.writeUInt32LE(offset, 42);
    central.push(c, n);
    offset += 30 + n.length + packed.length;
  }
  const cd = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(Object.keys(files).length, 8);
  end.writeUInt16LE(Object.keys(files).length, 10);
  end.writeUInt32LE(cd.length, 12);
  end.writeUInt32LE(offset, 16);
  return new Uint8Array(Buffer.concat([...local, cd, end]));
}
const docx = (paragraphs: string[]) =>
  zip({
    "[Content_Types].xml": "<Types/>",
    "word/document.xml": `<w:document><w:body>${paragraphs.map((p) => `<w:p><w:r><w:t>${p}</w:t></w:r></w:p>`).join("")}<w:tbl><w:tr><w:tc><w:p><w:r><w:t>Печатная</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>30 000</w:t></w:r></w:p></w:tc></w:tr></w:tbl></w:body></w:document>`,
  });
const xlsx = () =>
  zip({
    "[Content_Types].xml": "<Types/>",
    "xl/sharedStrings.xml": "<sst><si><t>Формат</t></si><si><t>Цена</t></si><si><t>Электронная</t></si></sst>",
    "xl/worksheets/sheet1.xml": '<worksheet><sheetData><row><c t="s"><v>0</v></c><c t="s"><v>1</v></c></row><row><c t="s"><v>2</v></c><c><v>9900</v></c></row></sheetData></worksheet>',
  });
async function pdf(pages: number): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  for (let i = 0; i < pages; i++) doc.addPage([200, 200]);
  return doc.save();
}
const png = (w: number, h: number) => sharp({ create: { width: w, height: h, channels: 3, background: { r: 240, g: 240, b: 240 } } }).png().toBuffer();

// ─── что за файл ────────────────────────────────────────────────────────────

describe("вложения: тип по содержимому, а не по имени и MIME канала", () => {
  it("голосовые: OGG, MP3, WAV, AMR, M4A (если канал сказал «аудио»)", () => {
    expect(sniffMedia(ogg())).toEqual({ category: "audio", mime: "audio/ogg" });
    expect(sniffMedia(new Uint8Array([...enc("ID3"), 3, 0, 0, 0]))).toMatchObject({ category: "audio", mime: "audio/mpeg" });
    expect(sniffMedia(new Uint8Array([...enc("RIFF"), 0, 0, 0, 0, ...enc("WAVE")]))).toMatchObject({ category: "audio", mime: "audio/wav" });
    expect(sniffMedia(enc("#!AMR\n123"))).toMatchObject({ category: "audio", mime: "audio/amr" });
    const mp4 = new Uint8Array([0, 0, 0, 0x18, ...enc("ftypisom"), 0, 0, 0, 0]);
    expect(sniffMedia(mp4, true)).toMatchObject({ category: "audio", mime: "audio/mp4" });
    expect(sniffMedia(mp4)).toMatchObject({ category: "video" });
  });

  it("картинки, PDF, Word, Excel, текст на русском и казахском", async () => {
    expect(sniffMedia(JPEG_HEAD).mime).toBe("image/jpeg");
    expect(sniffMedia(new Uint8Array(await png(4, 4))).mime).toBe("image/png");
    expect(sniffMedia(new Uint8Array([...enc("RIFF"), 0, 0, 0, 0, ...enc("WEBP")])).mime).toBe("image/webp");
    expect(sniffMedia(new Uint8Array([0, 0, 0, 0x18, ...enc("ftypheic")])).mime).toBe("image/heic");
    expect(sniffMedia(await pdf(1)).category).toBe("pdf");
    expect(sniffMedia(docx(["Привет"])).mime).toMatch(/wordprocessingml/);
    expect(sniffMedia(xlsx()).mime).toMatch(/spreadsheetml/);
    expect(sniffMedia(enc("Сәлеметсіз бе! Кітапқа тапсырыс: анама, 20 қараша"))).toEqual({ category: "text", mime: "text/plain" });
  });

  it("исполняемые и непонятные файлы — отказ, даже если канал назвал их «фото» или «документ»", () => {
    expect(sniffMedia(EXE).category).toBe("executable");
    expect(sniffMedia(new Uint8Array([0x7f, 0x45, 0x4c, 0x46, 2, 1])).category).toBe("executable");
    expect(sniffMedia(enc("#!/bin/sh\nrm -rf /")).category).toBe("executable");
    expect(sniffMedia(new Uint8Array([0, 1, 2, 3, 250, 251, 0, 0])).category).toBe("unknown");
    expect(sniffMedia(zip({ "evil.js": "x" })).category).toBe("unknown");
  });

  it("длительность голосового OGG — по последней странице", () => {
    expect(oggDurationSec(ogg(42))).toBeCloseTo(42, 3);
    expect(oggDurationSec(JPEG_HEAD)).toBeNull();
  });

  it("ссылка канала скачивается сервером только https на разрешённый хост — защита от SSRF", () => {
    expect(mediaUrlAllowed("https://store.wazzup24.com/abc.ogg")).toBe(true);
    expect(mediaUrlAllowed("https://wazzup24.ru/x")).toBe(true);
    for (const bad of ["http://store.wazzup24.com/a", "https://169.254.169.254/latest/meta-data", "https://localhost/a", "https://[::1]/a", "https://wazzup24.com.evil.com/a", "https://user:pw@store.wazzup24.com/a", "https://store.wazzup24.com:8443/a", "file:///etc/passwd", "https://example.com/a", "не ссылка", null])
      expect(mediaUrlAllowed(bad), String(bad)).toBe(false);
    expect(mediaUrlAllowed("https://cdn.example.org/a", ["example.org"])).toBe(true);
  });
});

// ─── разбор документов, PDF и картинок ──────────────────────────────────────

describe("документы, PDF и картинки: на сервере, с лимитами", () => {
  it("DOCX: абзацы и таблицы; XLSX: строки листа; текст — как есть, с лимитом длины", () => {
    expect(officeText(docx(["Хочу книгу маме на юбилей", "Срок — 20 ноября"]), "application/vnd.openxmlformats-officedocument.wordprocessingml.document")).toBe("Хочу книгу маме на юбилей\nСрок — 20 ноября\nПечатная\n | 30 000\n |");
    expect(officeText(xlsx(), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")).toBe("Формат\tЦена\nЭлектронная\t9900");
    expect(officeText(enc("а".repeat(10_000)), "text/plain", 100)).toHaveLength(100);
  });

  it("zip-бомба, зашифрованный и битый архив — не разбираются", () => {
    expect(officeText(zip({ "word/document.xml": "<w:t>x</w:t>" }, { fakeSize: 50_000_000 }), "application/x")).toBeNull();
    expect(officeText(zip({ "word/document.xml": "<w:t>x</w:t>" }, { flags: 1 }), "application/x")).toBeNull();
    expect(officeText(new Uint8Array([0x50, 0x4b, 3, 4, 0, 0]), "application/x")).toBeNull();
  });

  it("PDF: больше 10 страниц — модели только первые; битый — отказ", async () => {
    const big = await preparePdf(Buffer.from(await pdf(15)));
    expect(big).toMatchObject({ pages: PDF_MAX_PAGES, total: 15 });
    expect((await PDFDocument.load(Buffer.from((big as { data: string }).data, "base64"))).getPageCount()).toBe(PDF_MAX_PAGES);
    expect(await preparePdf(Buffer.from("%PDF-1.4 сломано"))).toMatchObject({ unsupported: true, bad: true });
  });

  it("картинка декодируется и перекодируется (метаданные сняты); длинный скриншот — полосами для мелкого текста; подмена — отказ", async () => {
    const one = await prepareImage(await png(800, 600));
    expect(one).toMatchObject({ parts: [{ kind: "image", mime: "image/jpeg" }] });
    const tall = await prepareImage(await png(1080, 4800));
    expect((tall as { parts: unknown[] }).parts).toHaveLength(3);
    for (const p of (tall as { parts: { data: string }[] }).parts) {
      const m = await sharp(Buffer.from(p.data, "base64")).metadata();
      expect(Math.max(m.width!, m.height!)).toBeLessThanOrEqual(1568);
      expect(m.exif).toBeUndefined();
    }
    expect(await prepareImage(Buffer.from(JPEG_HEAD))).toMatchObject({ unsupported: true, bad: true });
  });
});

// ─── распознавание у провайдеров (моки API) ─────────────────────────────────

const conn = (provider: AiConnection["provider"], model: string = aiProviders[provider].defaultModel): AiConnection => ({ provider, apiKey: "sk-test", model, baseUrl: aiProviders[provider].defaultBaseUrl || "http://llm.local/v1" });
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
function mockFetch(...responses: Response[]) {
  const calls: { url: string; body: unknown }[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit) => {
      calls.push({ url: String(url), body: init.body instanceof FormData ? Object.fromEntries([...init.body.entries()].map(([k, v]) => [k, typeof v === "string" ? v : "<file>"])) : JSON.parse(String(init.body)) });
      return responses.shift() ?? json({});
    }),
  );
  return calls;
}
afterEach(() => vi.unstubAllGlobals());
const voice = { kind: "audio" as const, data: Buffer.from(ogg()).toString("base64"), mime: "audio/ogg" };

describe("сервис транскрибации и чтения вложений", () => {
  it("OpenAI: /audio/transcriptions, модель gpt-4o-mini-transcribe, подсказка «русский и казахский вперемешку», язык — автоопределение", async () => {
    const calls = mockFetch(json({ text: "Сәлеметсіз бе, книгу маме хочу, қанша тұрады?" }));
    const r = await askMedia(conn("openai"), { system: "s", parts: [voice], timeoutMs: 5000 });
    expect(r).toEqual({ text: "Сәлеметсіз бе, книгу маме хочу, қанша тұрады?" });
    expect(calls[0].url).toBe("https://api.openai.com/v1/audio/transcriptions");
    expect(calls[0].body).toMatchObject({ model: "gpt-4o-mini-transcribe", prompt: expect.stringMatching(/казахский/), file: "<file>" });
    expect(calls[0].body).not.toHaveProperty("language");
  });

  it("Groq: Whisper; OpenRouter: аудио в чате Gemini; Claude и DeepSeek голосовые не слушают", async () => {
    const calls = mockFetch(json({ text: "Здравствуйте, хочу книгу" }), json({ choices: [{ message: { content: "Анама кітап керек" } }] }));
    expect(await askMedia(conn("groq", "whisper-large-v3"), { system: "s", parts: [voice], timeoutMs: 5000 })).toEqual({ text: "Здравствуйте, хочу книгу" });
    expect(calls[0].body).toMatchObject({ model: "whisper-large-v3" });
    expect(await askMedia(conn("openrouter", "google/gemini-2.5-flash"), { system: "Расшифруй", parts: [voice], timeoutMs: 5000 })).toMatchObject({ text: "Анама кітап керек" });
    expect(JSON.stringify(calls[1].body)).toContain("input_audio");
    expect(await askMedia(conn("anthropic"), { system: "s", parts: [voice], timeoutMs: 5000 })).toMatchObject({ unsupported: true });
    expect(await askMedia(conn("deepseek"), { system: "s", parts: [voice], timeoutMs: 5000 })).toMatchObject({ unsupported: true });
  });

  it("ошибки провайдера: 429 — одна повторная попытка; 400 — «не умеет»; 500 дважды — временный сбой (null), ничего не придумываем", async () => {
    mockFetch(json({ error: "rate" }, 429), json({ text: "ок" }));
    expect(await askMedia(conn("openai"), { system: "s", parts: [voice], timeoutMs: 10_000 })).toEqual({ text: "ок" });
    mockFetch(json({ error: "bad" }, 400));
    expect(await askMedia(conn("openai"), { system: "s", parts: [voice], timeoutMs: 10_000 })).toMatchObject({ unsupported: true });
    mockFetch(json({}, 500), json({}, 500));
    expect(await askMedia(conn("openai"), { system: "s", parts: [voice], timeoutMs: 10_000 })).toBeNull();
    mockFetch(json({ text: "" }));
    expect(await askMedia(conn("openai"), { system: "s", parts: [voice], timeoutMs: 10_000 })).toBeNull();
  });

  it("DOCX — на сервере, без запросов к провайдерам; PDF без Claude у DeepSeek — «не умеет»", async () => {
    const calls = mockFetch();
    const doc = { kind: "document" as const, data: Buffer.from(docx(["ТЗ: книга папе"])).toString("base64"), mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" };
    expect(await askMedia(conn("deepseek"), { system: "", parts: [doc], timeoutMs: 1000 })).toMatchObject({ text: expect.stringContaining("ТЗ: книга папе") });
    expect(calls).toHaveLength(0);
    expect(DOCUMENT_MAX_CHARS).toBeGreaterThan(1000);
    const p = { kind: "pdf" as const, data: Buffer.from(await pdf(2)).toString("base64"), mime: "application/pdf" };
    expect(await askMedia(conn("openai"), { system: "s", parts: [p], timeoutMs: 1000 })).toMatchObject({ unsupported: true });
  });

  it("PDF и фото — Claude: документ целиком (document-блок), картинка — image-блоком; токены — для расходов", async () => {
    const calls = mockFetch(
      json({ id: "m1", type: "message", role: "assistant", model: "claude-haiku-5-5", content: [{ type: "text", text: "Счёт №5 | 30 000 ₸" }], stop_reason: "end_turn", usage: { input_tokens: 1200, output_tokens: 40 } }),
      json({ id: "m2", type: "message", role: "assistant", model: "claude-haiku-5-5", content: [{ type: "text", text: "Скриншот переписки: «Сколько стоит?»" }], stop_reason: "end_turn", usage: { input_tokens: 900, output_tokens: 20 } }),
    );
    const claude = { ...conn("anthropic", "claude-haiku-5-5"), apiKey: `sk-ant-media-${Date.now()}` };
    const p = { kind: "pdf" as const, data: Buffer.from(await pdf(2)).toString("base64"), mime: "application/pdf" };
    expect(await askMedia(claude, { system: "Прочитай", parts: [p], timeoutMs: 5000 })).toMatchObject({ text: "Счёт №5 | 30 000 ₸", pages: 2, usage: { input: 1200, output: 40, model: "claude-haiku-5-5" } });
    expect(JSON.stringify(calls[0].body)).toContain('"type":"document"');
    const img = { kind: "image" as const, data: (await png(600, 400)).toString("base64"), mime: "image/png" };
    expect(await askMedia(claude, { system: "Опиши", parts: [img], timeoutMs: 5000 })).toMatchObject({ text: "Скриншот переписки: «Сколько стоит?»" });
    expect(JSON.stringify(calls[1].body)).toContain('"media_type":"image/jpeg"');
  });
});

// ─── бот: медиа → текст → прежний маршрут ───────────────────────────────────

const ans = (reply: string, p: Record<string, unknown> = {}) => ({ summary: "", language: "ru", stage: "discovery", action: "reply", reply, handoff_reason: "none", fields: { recipient: "", occasion: "" }, event_date: "", plan: "unknown", asked_to_order: false, agreed: false, agreed_quote: "", ...p });
type Req = Parameters<BotSellerModel["complete"]>[0];
type MediaReq = Parameters<NonNullable<BotSellerModel["media"]>>[0];
function seller(script: Record<string, unknown>[], recognize: (req: MediaReq) => Awaited<ReturnType<NonNullable<BotSellerModel["media"]>>>, policy: RoutePolicyView | null = null) {
  const calls: Req[] = [];
  const media: MediaReq[] = [];
  const m: BotSellerModel = {
    configured: async () => true,
    ...(policy ? { policy: async () => policy } : {}),
    complete: async (req) => {
      if (req.user.includes("черновик следующего сообщения менеджера")) return { text: JSON.stringify(ans("черновик")), usage: { input: 1, output: 1 } };
      calls.push(req);
      const next = script.shift();
      if (!next) throw new Error("сценарий кончился");
      return { text: JSON.stringify(next), usage: { input: 10, output: 5 } };
    },
    media: async (req) => (media.push(req), recognize(req)),
  };
  return { m, calls, media };
}
const aiConfig = (): BotConfig => ({ ...BOT_CONFIG, waitMinutes: 3, sell: { ...defaultBotConfig.sell, on: true, engine: "ai", takeover: true, hidePrices: false, speaksAs: "assistant", media: true } });
const INTRO = /помощница менеджера/;
const said = (t: { sent: string[] }) => t.sent.filter((s) => !INTRO.test(s));
type T = ReturnType<typeof setup>;
const run = (t: T, ms = BOT_PAUSE_MS + 1) => t.advance(ms);
const files = (map: Record<string, Uint8Array>) => (id: string) => {
  return map[id] ? { data: map[id], mime: "application/octet-stream" } : null;
};
const turnMedia = (t: T) => readBotTrace(t.events.filter((e) => e.kind === "turn").at(-1)?.meta)?.media ?? [];

describe("бот: голосовые, фото и документы идут в беседу текстом — дальше прежний маршрут Haiku → Sonnet → Opus", () => {
  it("голосовое на русском: расшифровка в сообщении (её видит менеджер), бот отвечает по сути; след связывает файл и ответ", async () => {
    const { m, calls, media } = seller([ans("Тёплый подарок маме 🤍 К какой дате нужна книга?")], () => ({ text: "Здравствуйте, хочу книгу маме на юбилей" }));
    const t = setup({ bot: "always", config: aiConfig(), seller: m, mediaFiles: () => ({ data: ogg(), mime: "application/octet-stream" }) });
    await t.service.ingest(inbound({ type: "audio", text: "", mediaUrl: "https://store.wazzup24.com/v1.ogg" }));
    await run(t);
    expect(media[0].parts[0]).toMatchObject({ kind: "audio", mime: "audio/ogg" });
    expect(calls[0].user).toContain("[Голосовое клиента: Здравствуйте, хочу книгу маме на юбилей]");
    expect(said(t)).toEqual(["Тёплый подарок маме 🤍 К какой дате нужна книга?"]);
    const voiceMsg = t.msgs.find((x) => x.type === "audio")!;
    expect(voiceMsg.transcript).toBe("Здравствуйте, хочу книгу маме на юбилей");
    expect(turnMedia(t)).toEqual([{ messageId: voiceMsg.id, kind: "audio", status: "ok", chars: 39 }]);
  });

  it("голосовое на казахском с возражением по цене — после расшифровки маршрут поднимает ход на Sonnet", async () => {
    const policy: RoutePolicyView = { mode: "on", defaultTier: "haiku", sonnetAt: 2, opusAt: 6, maxExtra: 2, budgetUsd: null, dailyBudgetUsd: null };
    const { m, calls } = seller([ans("Тёплый подарок 🤍 Какие остались вопросы?", { stage: "offer" }), ans("Түсінемін 🙂 Алдын ала төлеммен бастауға болады. Қай нұсқа ыңғайлы?", { language: "kk", stage: "objection" })], () => ({ text: "Қымбат екен ғой, ақшам жоқ қазір" }), policy);
    const t = setup({ bot: "always", config: aiConfig(), seller: m, mediaFiles: () => ({ data: ogg(), mime: "audio/ogg" }) });
    await t.service.ingest(inbound({ text: "Сәлеметсіз бе, анама кітап керек", at: t.deps.clock.now() }));
    await run(t);
    await t.service.ingest(inbound({ type: "audio", text: "", mediaUrl: "https://store.wazzup24.com/v2.ogg", at: t.deps.clock.now() }));
    await run(t);
    expect(calls.map((c) => c.tier)).toEqual(["haiku", "sonnet"]);
    expect(calls[1].user).toContain("Қымбат екен");
    expect(said(t).at(-1)).toMatch(/Түсінемін/);
  });

  it("скриншот: Claude Vision читает видимый текст — бот отвечает на него", async () => {
    const img = new Uint8Array(await png(800, 1600));
    const { m, calls, media } = seller([ans("Да, такую книгу делаем 😊 Для кого она?")], () => ({ text: "Скриншот: «Персональная книга для мамы — можно с фото?»", costUsd: 0.0002 }));
    const t = setup({ bot: "always", config: aiConfig(), seller: m, mediaFiles: () => ({ data: img, mime: "image/png" }) });
    await t.service.ingest(inbound({ type: "image", text: "", mediaUrl: "https://store.wazzup24.com/s.png" }));
    await run(t);
    expect(media[0].parts[0]).toMatchObject({ kind: "image", mime: "image/png" });
    expect(media[0].system).toMatch(/видимый текст дословно/);
    expect(calls[0].user).toContain("[Фото клиента: Скриншот");
    expect(said(t)).toEqual(["Да, такую книгу делаем 😊 Для кого она?"]);
    expect(t.conv().botState?.ai.llmCostUsd).toBeCloseTo(0.0002, 8);
  });

  it("PDF клиента — текст и таблицы в беседу; канал назвал файл «фото», а это PDF — разбирается как PDF", async () => {
    const doc = await pdf(3);
    const { m, calls, media } = seller([ans("Вижу ваш список: 2 книги к 20 ноября 🙌 Для кого первая?")], () => ({ text: "Заказ: 2 книги | к 20 ноября", pages: 3 }));
    const t = setup({ bot: "always", config: aiConfig(), seller: m, mediaFiles: () => ({ data: doc, mime: "image/jpeg" }) });
    await t.service.ingest(inbound({ type: "image", text: "", mediaUrl: "https://store.wazzup24.com/d" }));
    await run(t);
    expect(media[0].parts[0]).toMatchObject({ kind: "pdf", mime: "application/pdf" });
    expect(calls[0].user).toContain("[Документ клиента: Заказ: 2 книги | к 20 ноября]");
    expect(turnMedia(t)[0]).toMatchObject({ kind: "pdf", status: "ok", pages: 3 });
  });

  it("исполняемый файл под видом фото — не разбирается и никуда не уходит; бот передаёт менеджеру, как с любым файлом", async () => {
    const { m, media } = seller([], () => ({ text: "не должно быть" }));
    const t = setup({ bot: "always", config: aiConfig(), seller: m, mediaFiles: () => ({ data: EXE, mime: "image/jpeg" }) });
    await t.service.ingest(inbound({ type: "image", text: "", mediaUrl: "https://store.wazzup24.com/x.jpg" }));
    await run(t);
    expect(media).toHaveLength(0);
    expect(t.conv().botState).toMatchObject({ phase: "done", outcome: "handoff", reason: "media" });
  });

  it("голосовое не распозналось (сбой провайдера) — бот просит написать текстом и ничего не придумывает", async () => {
    const { m, calls } = seller([], () => null);
    const t = setup({ bot: "always", config: aiConfig(), seller: m, mediaFiles: () => ({ data: ogg(), mime: "audio/ogg" }) });
    await t.service.ingest(inbound({ type: "audio", text: "", mediaUrl: "https://store.wazzup24.com/v.ogg" }));
    await run(t);
    expect(calls).toHaveLength(0);
    expect(said(t)[0]).toMatch(/Голосов|текстом/i);
    expect(t.msgs.find((x) => x.type === "audio")?.transcript ?? null).toBeNull();
  });

  it("голосовое длиннее 10 минут — не отправляется на расшифровку", async () => {
    const { m, media } = seller([], () => ({ text: "лишнее" }));
    const t = setup({ bot: "always", config: aiConfig(), seller: m, mediaFiles: () => ({ data: ogg(900), mime: "audio/ogg" }) });
    await t.service.ingest(inbound({ type: "audio", text: "", mediaUrl: "https://store.wazzup24.com/long.ogg" }));
    await run(t);
    expect(media).toHaveLength(0);
  });

  it("повторная доставка того же вебхука — сообщение одно, расшифровка одна, ответ один", async () => {
    const { m, media } = seller([ans("К какой дате нужна книга?")], () => ({ text: "Хочу книгу маме" }));
    const t = setup({ bot: "always", config: aiConfig(), seller: m, mediaFiles: () => ({ data: ogg(), mime: "audio/ogg" }) });
    const msg = inbound({ type: "audio", text: "", mediaUrl: "https://store.wazzup24.com/v.ogg" });
    await t.service.ingest(msg);
    await t.service.ingest(msg);
    await run(t);
    await t.service.ingest(msg);
    await run(t);
    expect(t.msgs.filter((x) => x.type === "audio")).toHaveLength(1);
    expect(media).toHaveLength(1);
    expect(said(t)).toEqual(["К какой дате нужна книга?"]);
  });

  it("голосовое уже расшифровано (кнопкой в чате) — бот берёт расшифровку из сообщения, без нового запроса", async () => {
    const { m, media, calls } = seller([ans("К какой дате нужна книга?")], () => ({ text: "лишнее" }));
    const t = setup({ bot: "always", config: aiConfig(), seller: m, mediaFiles: files({}) });
    await t.service.ingest(inbound({ type: "audio", text: "", mediaUrl: "https://store.wazzup24.com/v.ogg" }));
    t.msgs.find((x) => x.type === "audio")!.transcript = "Хочу книгу папе";
    await run(t);
    expect(media).toHaveLength(0);
    expect(calls[0].user).toContain("[Голосовое клиента: Хочу книгу папе]");
    expect(turnMedia(t)[0]).toMatchObject({ status: "cached" });
  });

  it("подключение не умеет PDF — PDF в этой беседе больше не пробуем, а голосовые — да", async () => {
    let n = 0;
    const { m, media } = seller([ans("К какой дате нужна книга?")], (req) => (req.parts[0].kind === "pdf" ? (n++, { unsupported: true }) : { text: "Хочу книгу маме" }));
    const doc = await pdf(1);
    const t = setup({ bot: "always", config: aiConfig(), seller: m, mediaFiles: (id) => (t.msgs.find((x) => x.id === id)?.mediaUrl?.endsWith(".pdf") ? { data: doc, mime: "application/pdf" } : { data: ogg(), mime: "audio/ogg" }) });
    await t.service.ingest(inbound({ type: "document", text: "📎 Файл", mediaUrl: "https://store.wazzup24.com/a.pdf" }));
    await t.service.ingest(inbound({ type: "audio", text: "", mediaUrl: "https://store.wazzup24.com/v.ogg" }));
    await run(t);
    expect(n).toBe(1);
    expect(media.map((x) => x.parts[0].kind)).toEqual(["pdf", "audio"]);
    expect(t.conv().botState?.ai.mediaOff).toEqual(["pdf"]);
  });
});
