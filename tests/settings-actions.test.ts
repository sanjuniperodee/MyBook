import { beforeEach, describe, expect, it, vi } from "vitest";
import { defaultBotConfig, parseBotConfig, type BotConfig } from "@/modules/messaging/domain/botConfig";

/**
 * Действия раздела «Интеграции» (app/admin/settings): что сохраняется, что пишется в журнал и какие тексты ошибок
 * получает форма. Хранилище настроек, права и контейнер подменены; разбор форм — настоящий.
 */
const w = vi.hoisted(() => ({
  env: new Set<string>(),
  stored: {} as Record<string, string>,
  saved: [] as Record<string, string>[],
  audits: [] as unknown[],
  tokens: [] as string[],
  smtpEnv: false,
}));

vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@/server/access", () => ({
  assertStaff: async () => ({ user: { id: "boss", email: "boss@b.kz" } }),
  audit: async (_s: unknown, ...rest: unknown[]) => void w.audits.push(rest),
}));
vi.mock("@/modules/workspace", () => ({
  fromEnv: (k: string) => w.env.has(k),
  getSettings: async (keys: string[]) => Object.fromEntries(keys.map((k) => [k, w.stored[k] ?? ""])),
  saveSettings: async (values: Record<string, string>) => void w.saved.push(values),
  ensureToken: async (k: string) => (w.tokens.push(k), "tok"),
  smtpFromEnvironment: () => w.smtpEnv,
  smtpConfig: async () => null,
}));
vi.mock("@/server/container", () => ({
  container: () => ({
    assistant: { proofreadProvider: async () => ({ provider: "openrouter" }) },
    workspace: { templates: { add: async (t: unknown) => void w.saved.push({ template: JSON.stringify(t) }), update: async (id: string, t: unknown) => void w.saved.push({ [id]: JSON.stringify(t) }) } },
    messaging: { previewBot: async (input: { turns: unknown[] }) => ({ skipped: null, transcript: [], fields: [], intents: [], lang: "ru", done: false, summary: null, turns: input.turns.length }) },
  }),
}));
vi.mock("@/server/bot-site", () => ({
  botSiteInfo: {
    catalog: async () => ({ plans: [{ id: "digital", price: 9900 }, { id: "hardcover", price: 30000 }], delivery: [{ id: "courier", price: 3500 }], addons: [], productionDays: { standard: "5–7", premium: "3–4" } }),
  },
}));

const actions = {
  ...(await import("@/app/admin/settings/wazzup/actions")),
  ...(await import("@/app/admin/settings/telephony/actions")),
  ...(await import("@/app/admin/settings/crm/actions")),
  ...(await import("@/app/admin/settings/mail/actions")),
  ...(await import("@/app/admin/settings/ai/actions")),
};

const form = (fields: Record<string, string | string[] | File>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) for (const x of Array.isArray(v) ? v : [v]) f.append(k, x);
  return f;
};

beforeEach(() => {
  w.env.clear();
  w.stored = {};
  w.saved = [];
  w.audits = [];
  w.tokens = [];
  w.smtpEnv = false;
});

describe("Wazzup", () => {
  it("сохраняет ключ, канал и адрес; пустой ключ не трогает, «удалить» стирает; вебхук-токен заводится", async () => {
    expect(await actions.saveWazzupAction({}, form({ apiKey: " k1 ", baseUrl: " https://api.wazzup24.com ", channelId: "c".repeat(120) }))).toEqual({ ok: "Сохранено" });
    expect(w.saved).toEqual([{ "wazzup.apiKey": "k1", "wazzup.baseUrl": "https://api.wazzup24.com", "wazzup.channelId": "c".repeat(100) }]);
    expect(w.tokens).toEqual(["wazzup.webhookToken"]);
    expect(w.audits).toEqual([["settings.update", "settings", "wazzup", { channelId: "c".repeat(100), baseUrl: "https://api.wazzup24.com" }]]);
    await actions.saveWazzupAction({}, form({ apiKey: "", apiKeyClear: "on" }));
    expect(w.saved[1]).toEqual({ "wazzup.apiKey": "", "wazzup.baseUrl": "", "wazzup.channelId": "" });
  });

  it("поля из переменных окружения не сохраняются; адрес не https — ошибка; файл вместо текста — подмена", async () => {
    w.env = new Set(["wazzup.apiKey", "wazzup.baseUrl", "wazzup.channelId"]);
    await actions.saveWazzupAction({}, form({ apiKey: "k", baseUrl: "https://x", channelId: "c" }));
    expect(w.saved).toEqual([{}]);
    expect(await actions.saveWazzupAction({}, form({ baseUrl: "ftp://x" }))).toEqual({ error: "Адрес API должен начинаться с https://" });
    expect(await actions.saveWazzupAction({}, form({ apiKey: new File(["x"], "x.txt") }))).toEqual({ error: "Проверьте введённые данные" });
    expect(w.saved).toHaveLength(1);
  });
});

describe("Телефония", () => {
  it("Zadarma: ключи, номер АТС только цифрами, веб-телефон; своя АТС — заводит токен; без выбора — ошибка", async () => {
    expect(await actions.saveTelephonyAction({}, form({ provider: "zadarma", zadarmaKey: "k", zadarmaSecret: "s", pbxId: "12-345abc", webphone: "on" }))).toEqual({ ok: "Сохранено" });
    expect(w.saved).toEqual([{ "telephony.provider": "zadarma", "zadarma.key": "k", "zadarma.secret": "s", "zadarma.pbxId": "12345", "zadarma.webphone": "on" }]);
    await actions.saveTelephonyAction({}, form({ provider: "pbx" }));
    expect(w.saved[1]).toEqual({ "telephony.provider": "pbx" });
    expect(w.tokens).toEqual(["pbx.token"]);
    expect(await actions.saveTelephonyAction({}, form({ provider: "skype" }))).toEqual({ error: "Выберите АТС" });
    w.env = new Set(["telephony.provider", "zadarma.pbxId", "zadarma.key"]);
    await actions.saveTelephonyAction({}, form({ provider: "zadarma", zadarmaKey: "k", pbxId: "1" }));
    expect(w.saved[2]).toEqual({ "zadarma.webphone": "off" });
  });
});

describe("Отдел продаж", () => {
  it("сохраняет график, норматив, передачу не взятой заявки, автосделки, скидку и виджет; ошибки — первым сообщением схемы", async () => {
    const ok = { slaMinutes: "15", reassignMinutes: "10", from: "09:00", to: "18:00", autoDealFrom: "book_started", maxDiscount: "10", days: ["5", "1", "1", "9"], unsorted: "on", widgetChat: "on" };
    expect(await actions.saveCrmSettingsAction({}, form(ok))).toEqual({ ok: "Сохранено" });
    expect(w.saved).toEqual([
      { "crm.slaMinutes": "15", "crm.reassignMinutes": "10", "crm.workHours": JSON.stringify({ days: [1, 5], from: "09:00", to: "18:00" }), "crm.autoDealFrom": "book_started", "crm.unsorted": "on", "crm.maxDiscount": "10", "widget.enabled": "off", "widget.chat": "on" },
    ]);
    expect(await actions.saveCrmSettingsAction({}, form({ ...ok, slaMinutes: "0" }))).toEqual({ error: "Норматив ответа — от 1 минуты" });
    expect(await actions.saveCrmSettingsAction({}, form({ ...ok, from: "9" }))).toEqual({ error: "Время начала в формате ЧЧ:ММ" });
    expect(await actions.saveCrmSettingsAction({}, form({ ...ok, maxDiscount: "60" }))).toEqual({ error: "Скидка из чата — не больше 50%" });
    expect(await actions.saveCrmSettingsAction({}, form({ ...ok, days: ["8"] }))).toEqual({ error: "Выберите хотя бы один рабочий день" });
  });
});

describe("Почта: входящие (IMAP) и отправка (SMTP)", () => {
  it("IMAP: сохраняет ящик, пароль, папку; сменился ящик — UID сбрасывается", async () => {
    w.stored = { "email.imapHost": "imap.old.ru", "email.imapUser": "a@b.kz", "email.imapMailbox": "INBOX" };
    expect(await actions.saveEmailAction({}, form({ imapHost: " imap.yandex.ru ", imapPort: "993", imapUser: "a@b.kz", imapPassword: "p", imapMailbox: "" }))).toEqual({ ok: "Сохранено" });
    expect(w.saved).toEqual([{ "email.imapHost": "imap.yandex.ru", "email.imapPort": "993", "email.imapUser": "a@b.kz", "email.imapPassword": "p", "email.imapMailbox": "INBOX", "email.imapLastUid": "" }]);
    expect(w.tokens).toEqual(["email.webhookToken"]);
    expect(await actions.saveEmailAction({}, form({ imapHost: "imap yandex" }))).toEqual({ error: "Сервер IMAP — например, imap.yandex.ru" });
  });

  it("SMTP: сохраняет сервер, порт, шифрование, логин и отправителя; проверяет отправителя и ответы; из окружения — не меняется", async () => {
    const ok = { smtpHost: "smtp.yandex.ru", smtpPort: "465", smtpSecure: "true", smtpUser: "u@b.kz", smtpPassword: "p", mailFrom: "MyBooks <u@b.kz>", mailReplyTo: "" };
    expect(await actions.saveSmtpAction({}, form(ok))).toEqual({ ok: "Сохранено" });
    expect(w.saved).toEqual([{ "mail.smtpHost": "smtp.yandex.ru", "mail.smtpPort": "465", "mail.smtpSecure": "true", "mail.smtpUser": "u@b.kz", "mail.smtpPassword": "p", "mail.from": "MyBooks <u@b.kz>", "mail.replyTo": "" }]);
    expect(await actions.saveSmtpAction({}, form({ ...ok, smtpPort: "70000" }))).toEqual({ error: "Порт — от 1 до 65535" });
    expect(await actions.saveSmtpAction({}, form({ ...ok, mailFrom: "кто-то" }))).toEqual({ error: "Отправитель — адрес или «Имя <адрес>»" });
    expect(await actions.saveSmtpAction({}, form({ ...ok, mailReplyTo: "нет" }))).toEqual({ error: "Адрес для ответов — e-mail" });
    w.smtpEnv = true;
    expect(await actions.saveSmtpAction({}, form(ok))).toEqual({ error: "Почта задана переменными окружения сервера — меняйте её там" });
    expect(w.saved).toHaveLength(1);
  });
});

describe("AI-помощник и корректор", () => {
  it("помощник: провайдер, ключ, модель, адрес без хвостового /, база знаний; проверки полей", async () => {
    const ok = { provider: "openrouter", aiKey: "sk", aiModel: "qwen/qwen3", aiBaseUrl: "https://openrouter.ai/api/v1//", knowledge: " правила ", enabled: "on" };
    expect(await actions.saveAiAction({}, form(ok))).toEqual({ ok: "Сохранено" });
    expect(w.saved).toHaveLength(1);
    expect(w.saved[0]).toMatchObject({ "ai.provider": "openrouter", "ai.enabled": "on", "ai.knowledge": "правила" });
    expect(Object.values(w.saved[0])).toEqual(expect.arrayContaining(["sk", "qwen/qwen3", "https://openrouter.ai/api/v1"]));
    expect(w.audits).toEqual([["settings.update", "settings", "ai", { provider: "openrouter", model: "qwen/qwen3", enabled: true, knowledge: 7 }]]);
    expect(await actions.saveAiAction({}, form({ ...ok, provider: "skynet" }))).toEqual({ error: "Выберите провайдера" });
    expect(await actions.saveAiAction({}, form({ ...ok, aiBaseUrl: "openrouter.ai" }))).toEqual({ error: "Адрес API должен начинаться с https://" });
    expect(await actions.saveAiAction({}, form({ ...ok, aiModel: "модель" }))).toEqual({ error: "Название модели — латиница, цифры и символы . : / - _" });
    expect(await actions.saveAiAction({}, form({ ...ok, provider: "custom", aiModel: "" }))).toEqual({ error: "Для своего сервера укажите адрес API и модель" });
    expect(await actions.saveAiAction({}, form({ ...ok, knowledge: "x".repeat(6001) }))).toEqual({ error: "База знаний — не больше 6000 символов" });
    expect(await actions.saveAiAction({}, form({ ...ok, aiKey: new File(["x"], "k") }))).toEqual({ error: "Проверьте введённые данные" });
    expect(w.saved).toHaveLength(1);
  });

  it("помощник: провайдер из окружения не сохраняется, берётся сохранённый", async () => {
    w.env = new Set(["ai.provider"]);
    w.stored = { "ai.provider": "anthropic" };
    await actions.saveAiAction({}, form({ provider: "openrouter", aiModel: "" }));
    expect(w.saved[0]).not.toHaveProperty("ai.provider");
    expect(w.audits).toEqual([["settings.update", "settings", "ai", { provider: "anthropic", model: null, enabled: false, knowledge: 0 }]]);
  });

  it("корректор: свой провайдер или как у помощника (ключ — провайдера помощника), модель, включение", async () => {
    expect(await actions.saveProofreadAction({}, form({ provider: "", model: "openrouter/free", key: "sk", enabled: "on" }))).toEqual({ ok: "Сохранено" });
    expect(w.saved[0]).toMatchObject({ "proofread.provider": "", "proofread.model": "openrouter/free", "proofread.enabled": "on" });
    expect(Object.values(w.saved[0])).toContain("sk");
    expect(w.audits).toEqual([["settings.update", "settings", "proofread", { provider: "assistant", model: "openrouter/free", enabled: true }]]);
    expect(await actions.saveProofreadAction({}, form({ provider: "skynet" }))).toEqual({ error: "Выберите провайдера" });
    expect(await actions.saveProofreadAction({}, form({ provider: "anthropic", model: "a b" }))).toEqual({ error: "Название модели — латиница, цифры и символы . : / - _" });
  });
});

describe("Шаблоны ответов и бот", () => {
  it("шаблон: новый или правка по id; пустые поля — ошибки", async () => {
    expect(await actions.saveTemplateAction({}, form({ title: " Сроки ", text: " 5 дней " }))).toEqual({ ok: "Сохранено" });
    const id = "0b0b0b0b-0000-4000-8000-000000000001";
    await actions.saveTemplateAction({}, form({ id, title: "Т", text: "Х" }));
    expect(w.saved).toEqual([{ template: JSON.stringify({ title: "Сроки", text: "5 дней" }) }, { [id]: JSON.stringify({ title: "Т", text: "Х" }) }]);
    expect(await actions.saveTemplateAction({}, form({ title: "", text: "x" }))).toEqual({ error: "Название шаблона" });
    expect(await actions.saveTemplateAction({}, form({ id: "1", title: "Т", text: "x" }))).toEqual({ error: expect.any(String) });
  });

  it("бот: режим, каналы, вопросы на двух языках; новый формат читается обратно без потерь", async () => {
    const config = { ...defaultBotConfig, channels: ["whatsapp", "site"] as BotConfig["channels"], questions: [{ field: "occasion", text: { ru: "Повод?", kk: "Қандай мереке?" } }] };
    expect(await actions.saveBotAction({ mode: "fallback", ...config })).toEqual({ ok: "Сохранено" });
    expect(w.saved).toHaveLength(1);
    expect(w.saved[0]["bot.mode"]).toBe("fallback");
    expect(parseBotConfig(w.saved[0]["bot.config"])).toEqual(config);
    expect(w.audits).toEqual([["settings.update", "settings", "bot", { mode: "fallback", channels: ["whatsapp", "site"], questions: 1, faq: ["price", "how", "timing", "delivery", "payment", "examples", "language"], ai: false }]]);
  });

  it("бот: включённый без вопросов или каналов, неизвестный режим — ошибка", async () => {
    expect(await actions.saveBotAction({ mode: "off_hours", ...defaultBotConfig, questions: [] })).toEqual({ error: "Добавьте хотя бы один вопрос" });
    expect(await actions.saveBotAction({ mode: "always", ...defaultBotConfig, channels: [] })).toEqual({ error: "Выберите хотя бы один канал" });
    expect(await actions.saveBotAction({ mode: "sometimes" as "always", ...defaultBotConfig })).toEqual({ error: expect.any(String) });
    expect(await actions.saveBotAction({ mode: "always", ...defaultBotConfig, waitMinutes: 0 })).toEqual({ error: "Ожидание менеджера — от 1 минуты" });
    expect(w.saved).toEqual([]);
  });

  it("бот: цена не из тарифов или номер в тексте — не сохраняется; переменные и строка акции — можно", async () => {
    const withPrice = (text: string) => ({ ...defaultBotConfig, faq: { ...defaultBotConfig.faq, price: { on: true, text: { ru: text, kk: "" } } } });
    expect(await actions.saveBotAction({ mode: "always", ...withPrice("Книга 40 000 ₸, сегодня 20 000") })).toEqual({
      error: "В ответе «Цена» (RU) число «40 000 ₸» не из «Цен и тарифов» — подставьте переменную, например {цена.печатная}, а скидку напишите процентом в строке «Акция»",
    });
    expect(await actions.saveBotAction({ mode: "always", ...withPrice("Звоните +7 701 555 44 33") })).toEqual({ error: "В ответе «Цена» (RU) номер телефона — бот такое не отправляет" });
    expect(await actions.saveBotAction({ mode: "always", ...withPrice("Печатная — {цена.печатная} (это 30 000 ₸). {акция}"), promo: { ru: "Сегодня скидка 25%", kk: "" } })).toEqual({ ok: "Сохранено" });
  });

  it("бот: в строке акции — проценты и слова; точная цена со скидкой (сумма в тенге) не сохраняется", async () => {
    expect(await actions.saveBotAction({ mode: "always", ...defaultBotConfig, promo: { ru: "Сегодня 20 000 вместо 40 000", kk: "" } })).toEqual({
      error: "В строке акции (RU) сумма «20 000» — бот называет только цены «от» из «Цен и тарифов»; скидку напишите процентом или словами",
    });
    expect(await actions.saveBotAction({ mode: "always", ...defaultBotConfig, promo: { ru: "Скидка 25% до конца дня", kk: "Бүгін 29к теңге" } })).toEqual({ error: expect.stringContaining("В строке акции (KK) сумма «29к»") });
    expect(w.saved).toEqual([]);
    expect(await actions.saveBotAction({ mode: "always", ...defaultBotConfig, promo: { ru: "Скидка 25% до 31.12.2026", kk: "31.12.2026 дейін 25% жеңілдік" } })).toEqual({ ok: "Сохранено" });
  });

  it("тест-режим: проверяет вход и отдаёт результат прогона", async () => {
    expect(await actions.previewBotAction({ config: defaultBotConfig, turns: [], workTime: true, client: "new", name: "" })).toEqual({ error: "Напишите сообщение клиента" });
    expect(await actions.previewBotAction({ config: defaultBotConfig, turns: [[{ text: "Здравствуйте", type: "text" }]], workTime: false, client: "order", name: "Айгерим" })).toMatchObject({ result: { turns: 1 } });
    expect(w.saved).toEqual([]);
  });
});
