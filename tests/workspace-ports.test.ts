import { afterEach, describe, expect, it, vi } from "vitest";
import { settingsSecurityStore } from "@/modules/access/infrastructure/adapters";
import { aiConnections, type AssistantSettingKey } from "@/modules/assistant/infrastructure/connection";
import { crmAssistantData } from "@/modules/assistant/infrastructure/data";
import { crmEffects } from "@/modules/automation/infrastructure/adapters";
import { DrizzleSubjectLoader } from "@/modules/automation/infrastructure/persistence";
import { crmMarketingSettings } from "@/modules/marketing/infrastructure/adapters";
import { channelTransport, crmBotSettings, crmNotifier, realtimeUpdates, widgetSettings } from "@/modules/messaging/infrastructure/adapters";
import { ChatView } from "@/modules/messaging/infrastructure/chatView";
import { EmailChannel, type EmailSettingKey, type MailTransport } from "@/modules/messaging/infrastructure/email";
import type { GowaStatus } from "@/modules/messaging/infrastructure/gowa";
import { WazzupClient, WazzupError } from "@/modules/messaging/infrastructure/wazzup";
import { crmSalesSettings, roundRobinRouter } from "@/modules/sales/infrastructure/adapters";
import { TelephonyError } from "@/modules/telephony/domain";
import { crmCallEffects } from "@/modules/telephony/infrastructure/effects";
import { zadarmaProvider, type TelephonySettingKey } from "@/modules/telephony/infrastructure/zadarma";
import { fieldVars } from "@/shared/domain/customFields";
import { FixedSchedule, MemFieldsReader, MemSettings, SpyLiveFeed, SpyStaffNotifier } from "./doubles/workspace";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

// Экран чата с портами по умолчанию: Wazzup через настройки, шлюз GOWA недоступен, SMTP настроен.
const chatView = (settings: MemSettings<"wazzup.apiKey" | "wazzup.baseUrl" | "wazzup.channelId">, ports: Partial<ConstructorParameters<typeof ChatView>[0]> = {}) =>
  new ChatView({
    fields: new MemFieldsReader(),
    settings,
    wazzup: new WazzupClient(settings),
    gowa: { status: async () => ({ reachable: false, registered: false, connected: false, loggedIn: false, phone: "", problem: null }) },
    whatsappProvider: async () => "wazzup",
    smtp: { configured: async () => true },
    ...ports,
  });

const n = { kind: "task" as const, title: "Перезвонить: Айгерим", body: "Заявка с сайта", link: "/admin/deals/d1" };
const dealFields = [
  { key: "recipient", label: "Для кого", type: "text", options: [] },
  { key: "event_date", label: "Дата события", type: "date", options: [] },
  { key: "gift", label: "В подарок", type: "checkbox", options: [] },
];

describe("свои поля: переменные шаблонов (fieldVars)", () => {
  it("значения по подписям полей: дата — дд.мм.гггг, флажок — да/нет, пустые и неизвестные пропускаются", () => {
    expect(fieldVars(dealFields, { recipient: "бабушка Роза", event_date: "2026-10-14", gift: false, unknown: "x" })).toEqual({ "Для кого": "бабушка Роза", "Дата события": "14.10.2026", "В подарок": "нет" });
    expect(fieldVars(dealFields, { recipient: "", gift: true, event_date: null })).toEqual({ "В подарок": "да" });
    expect(fieldVars(dealFields, null)).toEqual({});
  });
});

describe("access: правила безопасности в настройках", () => {
  it("читает и пишет только свои ключи; 2FA — on/off", async () => {
    const settings = new MemSettings<"security.ipAllowlist" | "security.require2fa">();
    const store = settingsSecurityStore(settings);
    expect(await store.load()).toEqual({ allowlist: "", require2fa: false });
    await store.save({ allowlist: "10.0.0.0/8", require2fa: true }, "owner-1");
    expect(settings.saves).toEqual([{ values: { "security.ipAllowlist": "10.0.0.0/8", "security.require2fa": "on" }, actorId: "owner-1" }]);
    expect(await store.load()).toEqual({ allowlist: "10.0.0.0/8", require2fa: true });
  });
});

describe("sales: настройки и график", () => {
  it("«Неразобранное» включено, пока не off; с какого действия заводить сделку — как в настройке", async () => {
    const settings = new MemSettings<"crm.unsorted" | "crm.autoDealFrom" | "crm.reassignMinutes">({ "crm.autoDealFrom": "book_half" });
    const s = crmSalesSettings(settings);
    expect([await s.unsortedEnabled(), await s.autoDealFrom()]).toEqual([true, "book_half"]);
    settings.values.set("crm.unsorted", "off");
    expect(await s.unsortedEnabled()).toBe(false);
  });

  it("передача не взятой заявки: по умолчанию 15 минут, 0 — выключено, мусор — по умолчанию", async () => {
    const settings = new MemSettings<"crm.unsorted" | "crm.autoDealFrom" | "crm.reassignMinutes">();
    const s = crmSalesSettings(settings);
    expect(await s.reassignMinutes()).toBe(15);
    settings.values.set("crm.reassignMinutes", "0");
    expect(await s.reassignMinutes()).toBe(0);
    settings.values.set("crm.reassignMinutes", "abc");
    expect(await s.reassignMinutes()).toBe(15);
  });

  it("рабочее время круга — из графика (база не нужна)", async () => {
    const schedule = new FixedSchedule(false);
    expect(await roundRobinRouter(schedule, () => "Asia/Almaty").isWorkTime()).toBe(false);
    expect(schedule.asked).toHaveLength(1);
  });
});

describe("marketing: настройки", () => {
  it("предел скидки — число (пусто — 0); номер WhatsApp — цифры из настроек, иначе из контактов сайта", async () => {
    const settings = new MemSettings<"crm.maxDiscount" | "crm.whatsappNumber">();
    const s = crmMarketingSettings(settings);
    expect([await s.maxDiscount(), await s.whatsappNumber()]).toEqual([0, "77000000000"]);
    settings.values.set("crm.maxDiscount", "15");
    settings.values.set("crm.whatsappNumber", "+7 (701) 123-45-67");
    expect([await s.maxDiscount(), await s.whatsappNumber()]).toEqual([15, "77011234567"]);
  });
});

describe("telephony: настройки АТС, уведомления и живое обновление", () => {
  it("пропущенный — ответственному, без него — всем с calls.view; журнал обновляется у всех", async () => {
    const notifier = new SpyStaffNotifier({ "calls.view": ["m1", "m2"] });
    const live = new SpyLiveFeed();
    const effects = crmCallEffects({ isBlocked: async () => false, missedRules: async () => {}, notifier, live });
    await effects.notifyMissed(null, { title: "Пропущенный: +7 701 000 00 00", body: "", link: "/admin/calls" });
    await effects.notifyMissed("m3", { title: "Пропущенный", body: "", link: "/admin/calls" });
    effects.callChanged();
    expect(notifier.sent.map((s) => [s.to, s.n.kind])).toEqual([
      [["m1", "m2"], "call"],
      [["m3"], "call"],
    ]);
    expect(live.events).toEqual([{ type: "call" }]);
  });

  it("провайдер и веб-телефон — из настроек; без ключей Zadarma запрос не уходит", async () => {
    const settings = new MemSettings<TelephonySettingKey>({ "telephony.provider": "zadarma", "zadarma.webphone": "on", "zadarma.pbxId": "12345" });
    const zadarma = zadarmaProvider(settings);
    expect(await zadarma.provider()).toBe("zadarma");
    expect(await zadarma.webphoneSettings()).toEqual({ enabled: true, pbxId: "12345" });
    const fetch = vi.spyOn(globalThis, "fetch");
    const err = await zadarma.callback("100", "+77011234567").catch((e) => e);
    expect(TelephonyError.is(err) && err.code).toBe("notConfigured");
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe("automation: уведомления и свои поля", () => {
  it("«staff» — всем с deals.view, список — адресатам", async () => {
    const notifier = new SpyStaffNotifier({ "deals.view": ["m1", "h1"] });
    const effects = crmEffects(async () => {}, notifier);
    await effects.notify("staff", { kind: "sla", title: "Клиенту не ответили 15 минут", body: "", link: null });
    await effects.notify(["m2"], { kind: "task", title: "Задача", body: "", link: null });
    expect(notifier.sent.map((s) => s.to)).toEqual([["m1", "h1"], ["m2"]]);
  });

  it("переменные своих полей сделки — по полям из рабочего пространства", async () => {
    const fields = new MemFieldsReader({ deal: dealFields });
    expect(await new DrizzleSubjectLoader(fields).dealFieldVars({ recipient: "маме", event_date: "2026-03-08" })).toEqual({ "Для кого": "маме", "Дата события": "08.03.2026" });
  });
});

describe("assistant: подключения и данные", () => {
  it("пустые настройки — Claude с адресом и моделью по умолчанию; корректор — как помощник", async () => {
    const ai = aiConnections(new MemSettings<AssistantSettingKey>());
    expect(await ai.active()).toEqual({ provider: "anthropic", apiKey: "", baseUrl: "https://api.anthropic.com", model: "claude-opus-5-5", enabled: true });
    expect(await ai.proofreadProvider()).toEqual({ provider: "anthropic", own: false });
  });

  it("корректор со своим провайдером, моделью и флажком; ключ провайдера — общий с помощником", async () => {
    const settings = new MemSettings<AssistantSettingKey>({ "ai.provider": "openai", "proofread.provider": "openrouter", "proofread.model": "openrouter/free", "proofread.enabled": "off", "ai.openrouter.apiKey": "or-key", "ai.openrouter.baseUrl": "https://or.example/api/v1/" });
    const ai = aiConnections(settings);
    expect((await ai.active()).provider).toBe("openai");
    expect(await ai.proofreadProvider()).toEqual({ provider: "openrouter", own: true });
    expect(await ai.proofread()).toEqual({ provider: "openrouter", apiKey: "or-key", baseUrl: "https://or.example/api/v1", model: "openrouter/free", enabled: false });
  });

  it("база знаний — из настроек, поля сделки — из рабочего пространства", async () => {
    const data = crmAssistantData(new MemSettings<"ai.knowledge">({ "ai.knowledge": "Доставка по Алматы — 1 день" }), new MemFieldsReader({ deal: dealFields }), { messages: async () => [] });
    expect(await data.knowledge()).toBe("Доставка по Алматы — 1 день");
    expect(await data.dealFields()).toEqual(dealFields);
  });

  it("переписка — от порта ConversationReader: вложение без подписи становится «[тип]», заметка остаётся заметкой", async () => {
    const asked: [string, number][] = [];
    const message = { direction: "in" as const, type: "text", text: "Добрый день", mediaUrl: null, author: null, at: "2026-10-14T09:00:00.000Z" };
    const data = crmAssistantData(new MemSettings<"ai.knowledge">(), new MemFieldsReader(), {
      messages: async (id, limit) => (asked.push([id, limit]), [message, { ...message, direction: "out", type: "image", text: "", mediaUrl: "/m/1.jpg", author: "Айгерим", internal: true }]),
    });
    expect(await data.transcript("conv-1", 40)).toEqual([
      { direction: "in", text: "Добрый день", internal: undefined, author: null, at: message.at },
      { direction: "out", text: "[image]", internal: true, author: "Айгерим", at: message.at },
    ]);
    expect(asked).toEqual([["conv-1", 40]]);
  });
});

describe("messaging: настройки, уведомления, живое обновление", () => {
  it("уведомление — ответственному или всем с правом; экраны CRM обновляются", async () => {
    const notifier = new SpyStaffNotifier({ "chats.view": ["m1", "m2"] });
    const live = new SpyLiveFeed();
    await crmNotifier(notifier).notify(null, "chats.view", { ...n, kind: "message" });
    await crmNotifier(notifier).notify("m3", "deals.view", n);
    realtimeUpdates(live).chatChanged("conv-1");
    realtimeUpdates(live).notificationsChanged();
    expect(notifier.sent.map((s) => s.to)).toEqual([["m1", "m2"], ["m3"]]);
    expect(live.events).toEqual([{ type: "chat", conversationId: "conv-1" }, { type: "notify" }]);
  });

  it("бот: режим (пусто или неизвестный — выключен) и вопросы из настроек, рабочее время и поля сделки — из рабочего пространства, цены — с сайта", async () => {
    const schedule = new FixedSchedule(false);
    const site = {
      catalog: async () => ({ plans: [{ id: "hardcover", price: 30000 }], delivery: [], addons: [], productionDays: { standard: "5–7", premium: "3–4" } }),
      site: async () => ({ url: "https://mybook.kz", registrationOpen: false, themes: ["love"], landings: [] }),
    };
    const settings = new MemSettings<"bot.mode" | "bot.config" | "crm.workHours" | "ai.knowledge">({ "crm.workHours": '{"days":[1,2,3,4,5],"from":"10:00","to":"18:00"}' });
    const bot = crmBotSettings({ settings, schedule, fields: new MemFieldsReader({ deal: dealFields }), site });
    // Режим не задан — по умолчанию «всегда» (решение владельца 17.10).
    expect(await bot.mode()).toBe("always");
    expect((await bot.config()).questions.length).toBeGreaterThan(0);
    expect(await bot.isWorkTime(new Date("2026-10-14T03:00:00Z"))).toBe(false);
    expect(await bot.dealFields()).toEqual(dealFields);
    // Среда 08:00 по Алматы → начало смены в 10:00 того же дня (график из настроек CRM).
    expect(await bot.nextWorkStart(new Date("2026-10-14T03:00:00Z"))).toEqual(new Date("2026-10-14T05:00:00Z"));
    expect((await bot.catalog()).plans).toEqual([{ id: "hardcover", price: 30000 }]);
    settings.values.set("bot.mode", "fallback");
    expect(await bot.mode()).toBe("fallback");
    settings.values.set("bot.mode", "sometimes");
    expect(await bot.mode()).toBe("off");
  });

  it("виджет: выключен — без кнопки WhatsApp и чата, номер не спрашиваем", async () => {
    const whatsapp = vi.fn(async () => "77011234567");
    expect(await widgetSettings(new MemSettings<"widget.enabled" | "widget.chat">(), whatsapp)).toEqual({ enabled: true, chat: true, whatsapp: "77011234567" });
    expect(await widgetSettings(new MemSettings<"widget.enabled" | "widget.chat">({ "widget.chat": "off" }), whatsapp)).toEqual({ enabled: true, chat: false, whatsapp: "77011234567" });
    whatsapp.mockClear();
    expect(await widgetSettings(new MemSettings<"widget.enabled" | "widget.chat">({ "widget.enabled": "off" }), whatsapp)).toEqual({ enabled: false, chat: false, whatsapp: "" });
    expect(whatsapp).not.toHaveBeenCalled();
  });

  it("Wazzup: без ключа — понятная ошибка без запроса; с ключом — адрес из настроек без «/» на конце", async () => {
    const settings = new MemSettings<"wazzup.apiKey" | "wazzup.baseUrl">();
    const wazzup = new WazzupClient(settings);
    const fetch = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify([{ channelId: "ch1", transport: "whatsapp", plainId: "77001112233", state: "active" }])));
    expect(await wazzup.configured()).toBe(false);
    const err = await wazzup.listChannels().catch((e) => e);
    expect([WazzupError.is(err), err.message]).toEqual([true, "Wazzup не подключён: укажите API-ключ в разделе «Интеграции»"]);
    expect(fetch).not.toHaveBeenCalled();
    settings.values.set("wazzup.apiKey", "wz-key");
    settings.values.set("wazzup.baseUrl", "https://wz.example/");
    expect(await wazzup.listChannels()).toHaveLength(1);
    expect(fetch.mock.calls[0][0]).toBe("https://wz.example/v3/channels");
    expect((fetch.mock.calls[0][1]?.headers as Record<string, string>).Authorization).toBe("Bearer wz-key");
  });

  it("почему отправка не сработает: Wazzup не подключён, не выбран канал, всё готово", async () => {
    const settings = new MemSettings<"wazzup.apiKey" | "wazzup.baseUrl" | "wazzup.channelId">();
    const view = chatView(settings);
    const conv = { channel: "telegram", channelId: "" };
    expect(await view.sendBlocker({ channel: "site", channelId: "" })).toBeNull();
    expect(await view.sendBlocker(conv)).toBe("Wazzup не подключён — сообщения не уйдут клиенту. Подключите в разделе «Интеграции».");
    settings.values.set("wazzup.apiKey", "wz-key");
    expect(await view.sendBlocker(conv)).toBe("Не выбран канал WhatsApp для отправки.");
    settings.values.set("wazzup.channelId", "ch1");
    expect(await view.sendBlocker(conv)).toBeNull();
  });

  it("почему отправка не сработает: почта (SMTP) — в продакшене без настроек письма не уйдут, в разработке пишутся в лог", async () => {
    const view = chatView(new MemSettings(), { smtp: { configured: async () => false } });
    const email = { channel: "email", channelId: "" };
    expect(await view.sendBlocker(email)).toBeNull();
    vi.stubEnv("NODE_ENV", "production");
    expect(await view.sendBlocker(email)).toBe("Почта (SMTP) не настроена — укажите сервер в «Интеграциях», иначе письма не уйдут клиенту.");
    expect(await chatView(new MemSettings(), { smtp: { configured: async () => true } }).sendBlocker(email)).toBeNull();
  });

  it("почему отправка не сработает: WhatsApp через шлюз GOWA — недоступен, ошибка, номер не привязан, готов", async () => {
    const status: GowaStatus = { reachable: false, registered: false, connected: false, loggedIn: false, phone: "", problem: null };
    const view = chatView(new MemSettings(), { gowa: { status: async () => status }, whatsappProvider: async () => "gowa" });
    const conv = { channel: "whatsapp", channelId: "wazzup-channel" };
    expect(await view.sendBlocker(conv)).toBe("Шлюз WhatsApp (GOWA) недоступен — сообщения не уйдут клиенту. Проверьте, что сервис запущен.");
    Object.assign(status, { reachable: true, problem: "WhatsApp: неверный пароль" });
    expect(await view.sendBlocker(conv)).toBe("WhatsApp: неверный пароль — сообщения не уйдут клиенту. Проверьте настройки в «Интеграциях».");
    Object.assign(status, { problem: null });
    expect(await view.sendBlocker(conv)).toBe("Номер WhatsApp не привязан — отсканируйте QR в разделе «Интеграции».");
    Object.assign(status, { loggedIn: true });
    expect(await view.sendBlocker(conv)).toBeNull();
    // Диалог шлюза идёт через него и при Wazzup в настройках.
    expect(await chatView(new MemSettings(), { gowa: { status: async () => status } }).sendBlocker({ channel: "whatsapp", channelId: "gowa" })).toBeNull();
  });

  it("ответ в почтовый диалог уходит через EmailChannel.reply; ошибка отправки — текстом в статус", async () => {
    const replies: [string, string][] = [];
    const ok = channelTransport(new WazzupClient(new MemSettings()), { reply: async (_conv, id, text) => (replies.push([id, text]), { ok: true as const }) });
    const conv = { id: "c1", channel: "email", channelId: "", chatId: "client@example.kz", contactName: "", avatarUrl: null, clientId: null, dealId: null, assigneeId: null, botStep: null, meta: {} };
    expect(await ok.send(conv, "m1", "Здравствуйте")).toEqual({ ok: true, externalId: null });
    expect(replies).toEqual([["m1", "Здравствуйте"]]);
    const failing = channelTransport(new WazzupClient(new MemSettings()), { reply: async () => ({ ok: false as const, error: "SMTP: отказ" }) });
    expect(await failing.send(conv, "m2", "Ещё")).toEqual({ ok: false, error: "SMTP: отказ" });
  });

  it("почта: копия своего письма и автоответы не становятся заявками; IMAP без настроек не опрашивается", async () => {
    const settings = new MemSettings<EmailSettingKey>();
    const smtpConfig = vi.fn(async () => ({ host: "smtp.example", port: 587, secure: false, user: "", password: "", from: "MyBooks <hello@mybook.kz>", replyTo: "" }));
    // SMTP здесь не нужен (письма не отправляются); сервис переписки — шпион: до него эти письма доходить не должны.
    const chats = { ingest: vi.fn() };
    const email = new EmailChannel({ settings, live: new SpyLiveFeed(), smtpConfig, smtp: {} as MailTransport, chats });
    const mail = { from: "hello@mybook.kz", fromName: "MyBooks", subject: "Заказ", text: "Текст", messageId: "<m1@mybook.kz>", inReplyTo: null, date: new Date(), auto: false };
    await email.ingest(mail);
    await email.ingest({ ...mail, from: "client@example.kz", auto: true });
    expect(smtpConfig).toHaveBeenCalledTimes(2);
    expect(chats.ingest).not.toHaveBeenCalled();
    expect(await email.pollImap()).toBe(0);
    await expect(email.testImap()).rejects.toThrow("Заполните сервер, логин и пароль IMAP");
    expect(settings.saves).toEqual([]);
  });
});
