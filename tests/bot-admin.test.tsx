import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

/** Экраны бота в CRM: форма настроек, метрики, полоса бота в чате — рендер без падений и с нужными подписями. */
vi.mock("@/app/admin/settings/crm/actions", () => ({ saveBotAction: async () => ({ ok: "Сохранено" }), previewBotAction: async () => ({ error: "нет" }) }));
vi.mock("@/app/admin/chats/actions", () => ({ stopBotAction: async () => {}, startBotAction: async () => {}, assignConversationAction: async () => {}, createDealFromChatAction: async () => ({ id: "" }), setConversationStatusAction: async () => {} }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => {}, push: () => {} }) }));

const { BotForm } = await import("@/app/admin/settings/crm/BotForm");
const { BotStats } = await import("@/app/admin/settings/crm/BotStats");
const { BotBanner } = await import("@/app/admin/chats/ChatControls");
const { defaultBotConfig, defaultOptionLabels, parseBotConfig } = await import("@/modules/messaging/domain/botConfig");
const { botStatus } = await import("@/modules/messaging/application/botPreview");
const { newBotState } = await import("@/modules/messaging/domain/botEngine");

const fields = [
  { key: "recipient", label: "Для кого", type: "text", options: [] },
  { key: "occasion", label: "Повод", type: "select", options: ["Годовщина", "День рождения"] },
  { key: "event_date", label: "Дата события", type: "date", options: [] },
  { key: "format", label: "Формат", type: "select", options: ["Печатная", "Электронная"] },
];

describe("настройки бота", () => {
  it("форма со старыми настройками с прода: режимы, каналы, вкладки языков, частые вопросы, предупреждение о правиле", () => {
    const prod = parseBotConfig(JSON.stringify({ greeting: "Здравствуйте, {имя}!", questions: [{ text: "Для кого будет книга?", field: "recipient" }], finish: "Спасибо!" }));
    const html = renderToStaticMarkup(
      <BotForm
        mode="always"
        config={prod}
        fields={fields}
        defaults={{ texts: defaultBotConfig.texts, faq: defaultBotConfig.faq, optionLabels: defaultOptionLabels }}
        vars={[{ key: "{цена.печатная}", label: "печатная", value: "30 000 ₸" }]}
        autoReplyRules={["Вне рабочего времени → автоответ"]}
        aiModel="openrouter/free"
        stats={<p>метрики</p>}
      />,
    );
    for (const s of ["Бот-автоответчик", "Если менеджер не ответил", "Только вне рабочего времени", "WhatsApp", "Чат на сайте", "Русский", "Қазақша", "Цена", "Язык книги", "{цена.печатная} = 30 000 ₸", "«Вне рабочего времени → автоответ»", "Бесплатная модель OpenRouter", "Проверить бота", "метрики"]) expect(html).toContain(s);
    expect(html).toContain("Для кого будет книга?");
  });

  it("метрики: запуски, итоги, причины пропуска, вопросы клиентов", () => {
    const html = renderToStaticMarkup(
      <BotStats
        m={{ started: 3, skipped: { prior_chat: 2 }, outcomes: { started: 3, finished: 2, stopped_by_manager: 1 }, answered: { recipient: 3 }, unrecognized: { recipient: 1 }, intents: { price: 2, "handoff:call": 1 }, langs: { kk: 1, ru: 2 }, replyMinutes: 4, converted: 1 }}
        questions={[{ key: "recipient", label: "Для кого" }]}
        skipLabels={{ prior_chat: "переписка была до CRM" }}
      />,
    );
    for (const s of ["Начал опрос: 3", "собрал ответы: 2", "остановлен ответом менеджера: 1", "переписка была до CRM: 2", "Для кого: 3 (1)", "цена: 2", "просили позвонить: 1", "казахский 1", "~4 мин"]) expect(html).toContain(s);
  });
});

describe("настройки бота: режим «Продаёт»", () => {
  it("переключатель, предоплата, счёт от бота с ценой из тарифов и тексты продаж", () => {
    const config = { ...defaultBotConfig, sell: { ...defaultBotConfig.sell, on: true, prepay: 10000, invoice: true } };
    const html = renderToStaticMarkup(
      <BotForm
        mode="always"
        config={config}
        fields={fields}
        defaults={{ texts: defaultBotConfig.texts, faq: defaultBotConfig.faq, optionLabels: defaultOptionLabels }}
        vars={[{ key: "{цена.печатная}", label: "печатная", value: "30 000 ₸" }]}
        autoReplyRules={[]}
        aiModel={null}
        stats={null}
      />,
    );
    for (const s of ["Бот продаёт", "Предоплата, ₸", "Бот сам выставляет счёт", "Цена книги в счёте бота — печатная", 'placeholder="30 000 ₸"', "Тексты продаж", "«Дорого», «денег нет»"]) expect(html).toContain(s);
    const off = renderToStaticMarkup(
      <BotForm mode="always" config={defaultBotConfig} fields={fields} defaults={{ texts: defaultBotConfig.texts, faq: defaultBotConfig.faq, optionLabels: defaultOptionLabels }} vars={[]} autoReplyRules={[]} aiModel={null} stats={null} />,
    );
    expect(off).toContain("Бот продаёт");
    expect(off).not.toContain("Бот сам выставляет счёт");
  });

  it("старые настройки без sell — режим выключен; мусор в sell — заводские значения", () => {
    expect(parseBotConfig(JSON.stringify({ texts: {} })).sell).toEqual(defaultBotConfig.sell);
    expect(parseBotConfig(JSON.stringify({ texts: {}, sell: { on: true, prepay: -5, followUpHours: "x", invoice: true, prices: { hardcover: 25000 } } })).sell).toMatchObject({ on: true, prepay: 0, followUpHours: 3, invoice: true, prices: { hardcover: 25000, digital: 0 } });
  });
});

describe("бот в чате", () => {
  it("полоса: вопрос N из M с кнопкой «Остановить»; бот не работал — полосы нет", () => {
    const state = { ...newBotState(new Date(), true), phase: "active" as const, questions: ["recipient", "occasion"], asking: "occasion" };
    const active = botStatus({ botStep: 1, state, dueAt: null }, fields);
    expect(active).toMatchObject({ label: "Бот: вопрос 2 из 2 (Повод)", canStop: true, canStart: false });
    expect(renderToStaticMarkup(<BotBanner conversationId="c1" status={active} canControl hasDeal />)).toContain("Остановить бота");
    const none = botStatus(null, fields);
    expect(none).toEqual({ label: null, tone: "none", canStop: false, canStart: true });
    expect(renderToStaticMarkup(<BotBanner conversationId="c1" status={none} canControl hasDeal />)).toBe("");
    const stopped = botStatus({ botStep: -1, state: { ...state, phase: "done", outcome: "skipped", reason: "prior_chat" }, dueAt: null }, fields);
    expect(stopped.label).toBe("Бот не начинал: переписка была до CRM");
    const offer = botStatus({ botStep: 0, state: { ...state, stage: "offer", asking: null }, dueAt: null }, fields);
    expect(offer.label).toBe("Бот сделал предложение — ждёт ответа клиента");
  });
});
