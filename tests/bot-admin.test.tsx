import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

/** Экраны бота в CRM: форма настроек, метрики, полоса бота в чате — рендер без падений и с нужными подписями. */
vi.mock("@/app/admin/settings/crm/actions", () => ({ saveBotAction: async () => ({ ok: "Сохранено" }), previewBotAction: async () => ({ error: "нет" }) }));
vi.mock("@/app/admin/chats/actions", () => ({ stopBotAction: async () => {}, startBotAction: async () => {}, assignConversationAction: async () => {}, createDealFromChatAction: async () => ({ id: "" }), setConversationStatusAction: async () => {} }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => {}, push: () => {} }) }));

const { BotForm } = await import("@/app/admin/settings/crm/BotForm");
const { BotStats } = await import("@/app/admin/settings/crm/BotStats");
const { byLabel, handoffReasonLabels, splitHandoffs } = await import("@/modules/messaging/domain/botStats");
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
        seller={null}
        stats={<p>метрики</p>}
      />,
    );
    // Форма разделена на вкладки: каждый раздел рендерится отдельно.
    const tab = (initialTab: "mode" | "qualifier" | "sell" | "test") =>
      renderToStaticMarkup(
        <BotForm mode="always" config={prod} fields={fields} defaults={{ texts: defaultBotConfig.texts, faq: defaultBotConfig.faq, optionLabels: defaultOptionLabels }} vars={[{ key: "{цена.печатная}", label: "печатная", value: "30 000 ₸" }]} autoReplyRules={["Вне рабочего времени → автоответ"]} aiModel="openrouter/free" seller={null} stats={<p>метрики</p>} initialTab={initialTab} />,
      );
    for (const s of ["Бот-автоответчик", "Когда работает", "Опрос и ответы", "Продажи", "Проверка и статистика"]) expect(html).toContain(s);
    const all = [tab("mode"), tab("qualifier"), tab("test")].join("\n");
    for (const s of ["Если менеджер не ответил", "Только вне рабочего времени", "WhatsApp", "Чат на сайте", "Русский", "Қазақша", "Цена", "Язык книги", "{цена.печатная} = 30 000 ₸", "«Вне рабочего времени → автоответ»", "Бесплатная модель OpenRouter", "Проверить бота", "метрики"]) expect(all).toContain(s);
    expect(all).toContain("Для кого будет книга?");
  });

  it("метрики: запуски, итоги, причины пропуска, вопросы клиентов", () => {
    const html = renderToStaticMarkup(
      <BotStats
        m={{ started: 3, skipped: { prior_chat: 2 }, outcomes: { started: 3, finished: 2, stopped_by_manager: 1 }, answered: { recipient: 3 }, unrecognized: { recipient: 1 }, intents: { price: 2 }, handoffs: { call: 1 }, failures: {}, langs: { kk: 1, ru: 2 }, replyMinutes: 4, converted: 1 }}
        questions={[{ key: "recipient", label: "Для кого" }]}
        skipLabels={{ prior_chat: "переписка была до CRM" }}
      />,
    );
    for (const s of ["Начал беседу: 3", "собрал ответы: 2", "остановлен ответом менеджера: 1", "переписка была до CRM: 2", "Для кого: 3 (1)", "цена: 2", "Почему передал менеджеру", "просили позвонить: 1", "казахский 1", "~4 мин"]) expect(html).toContain(s);
    expect(html).not.toContain("Сбои");
  });

  it("беседы продажника: подхват, причины передачи по-русски, сбои — отдельным блоком, а не «вопросами клиентов» (bots-d1, bots-d2)", () => {
    // Как botMetrics раскладывает передачи из журнала: сбои бота — отдельно от просьб клиента.
    const split = splitHandoffs({ call_request: 2, call: 1, price_request: 3, ai_error: 1, loop: 2, limit: 1, ai_blocked: 1, voice: 1, objection: 1 });
    expect(split).toEqual({ handoffs: { call_request: 2, call: 1, price_request: 3, objection: 1 }, failures: { ai_error: 1, loop: 2, limit: 1, ai_blocked: 1, voice: 1 } });
    // Синонимы шаблонного бота и продажника — одной строкой; незнакомая причина — как есть, а не теряется.
    expect(byLabel({ call_request: 2, call: 1, price_request: 3, mystery: 1 }, handoffReasonLabels)).toEqual([
      ["просили позвонить", 3],
      ["цену называет менеджер", 3],
      ["mystery", 1],
    ]);
    const html = renderToStaticMarkup(
      <BotStats
        m={{ started: 5, skipped: {}, outcomes: { started: 5, takeover: 2, handoff: 4 }, answered: {}, unrecognized: {}, intents: {}, ...split, langs: { ru: 4, kk: 1 }, replyMinutes: null, converted: 1 }}
        questions={[]}
        skipLabels={{}}
      />,
    );
    for (const s of ["Начал беседу: 5", "подхватил начатую переписку: 2", "Языки: русский 4, казахский 1", "Дошли до договорённости или оплаты: 1", "просили позвонить: 3", "цену называет менеджер: 3", "возражения после вариантов: 1", "Сбои", "модель не ответила дважды: 1", "бот повторил своё сообщение (по кругу): 2", "потолок беседы: 1", "голосовое не распознано: 1"]) expect(html).toContain(s);
    // Сырых кодов на экране нет.
    for (const code of ["ai_error", "loop", "call_request", "price_request"]) expect(html).not.toContain(code);
    // Сбои — после причин передачи, отдельным блоком.
    const failures = html.slice(html.indexOf('data-testid="bot-failures"'));
    expect(failures).toContain("потолок беседы");
    expect(failures).not.toContain("просили позвонить");
  });
});

describe("настройки бота: режим «Продаёт»", () => {
  it("переключатель, предоплата, счёт от бота с ценой из тарифов и тексты продаж", () => {
    const config = { ...defaultBotConfig, sell: { ...defaultBotConfig.sell, on: true, prepay: 10000, invoice: true, engine: "template" as const } };
    const html = renderToStaticMarkup(
      <BotForm
        mode="always"
        config={config}
        fields={fields}
        defaults={{ texts: defaultBotConfig.texts, faq: defaultBotConfig.faq, optionLabels: defaultOptionLabels }}
        vars={[{ key: "{цена.печатная}", label: "печатная", value: "30 000 ₸" }]}
        autoReplyRules={[]}
        aiModel={null}
        seller={null}
        stats={null}
        initialTab="sell"
      />,
    );
    for (const s of ["Бот продаёт", "Предоплата, ₸", "Бот сам выставляет счёт", "цена — из «Цен и тарифов»", "Тексты продаж", "«Дорого», «денег нет»"]) expect(html).toContain(s);
    // Своей цены в счёте у бота нет (deals-d13): поля «Цена книги в счёте бота» больше нет.
    expect(html).not.toContain("Цена книги в счёте бота");
    const off = renderToStaticMarkup(
      <BotForm mode="always" config={{ ...defaultBotConfig, sell: { ...defaultBotConfig.sell, on: false } }} fields={fields} defaults={{ texts: defaultBotConfig.texts, faq: defaultBotConfig.faq, optionLabels: defaultOptionLabels }} vars={[]} autoReplyRules={[]} aiModel={null} seller={null} stats={null} initialTab="sell" />,
    );
    expect(off).toContain("Бот продаёт");
    expect(off).not.toContain("Бот сам выставляет счёт");
  });

  it("движок AI: модель продажника, подхват начатой переписки, указания; без модели — предупреждение, что работают шаблоны", () => {
    const config = { ...defaultBotConfig, sell: { ...defaultBotConfig.sell, on: true, engine: "ai" as const, takeover: true, persona: "Говори тепло" } };
    const render = (seller: string | null) =>
      renderToStaticMarkup(
        <BotForm mode="fallback" config={config} fields={fields} defaults={{ texts: defaultBotConfig.texts, faq: defaultBotConfig.faq, optionLabels: defaultOptionLabels }} vars={[]} autoReplyRules={[]} aiModel={null} seller={seller} stats={null} initialTab="sell" />,
      );
    const ok = render("claude-sonnet-5-5");
    for (const s of ["AI-продажник", "По шаблонам", "Модель продажника:", "claude-sonnet-5-5", "Подхватывать начатую переписку", "Указания продажнику", "Потолок беседы", "Запасные тексты продаж"]) expect(ok).toContain(s);
    expect(ok).toContain("3 мин в рабочее время");
    expect(render("openrouter/free")).toContain("Бесплатные модели OpenRouter нестабильны");
    expect(render(null)).toContain("AI не подключён — пока продажник работает по шаблонам");
  });

  it("старые настройки без sell — режим выключен; мусор в sell — заводские значения", () => {
    expect(parseBotConfig(JSON.stringify({ texts: {} })).sell).toEqual(defaultBotConfig.sell);
    expect(defaultBotConfig.sell).toMatchObject({ on: false, engine: "ai", takeover: true });
    const legacy = parseBotConfig(JSON.stringify({ texts: {}, sell: { on: true, prepay: -5, followUpHours: "x", invoice: true, prices: { hardcover: 25000 } } })).sell;
    expect(legacy).toMatchObject({ on: true, prepay: 0, followUpHours: 3, invoice: true });
    // Прежняя «цена в счёте бота» не читается: счёт бота — по «Ценам и тарифам».
    expect(legacy).not.toHaveProperty("prices");
  });
});

describe("бот в чате", () => {
  it("полоса: вопрос N из M с кнопкой «Отключить AI»; бот не работал — полосы нет", () => {
    const state = { ...newBotState(new Date(), true), phase: "active" as const, questions: ["recipient", "occasion"], asking: "occasion" };
    const active = botStatus({ botStep: 1, state, dueAt: null }, fields);
    expect(active).toMatchObject({ label: "Бот: вопрос 2 из 2 (Повод)", canStop: true, canStart: false });
    expect(renderToStaticMarkup(<BotBanner conversationId="c1" status={active} canControl hasDeal />)).toContain("Отключить AI");
    const none = botStatus(null, fields);
    expect(none).toEqual({ label: null, tone: "none", canStop: false, canStart: true });
    expect(renderToStaticMarkup(<BotBanner conversationId="c1" status={none} canControl hasDeal />)).toBe("");
    const stopped = botStatus({ botStep: -1, state: { ...state, phase: "done", outcome: "skipped", reason: "prior_chat" }, dueAt: null }, fields);
    expect(stopped.label).toBe("Бот не начинал: переписка была до CRM");
    const offer = botStatus({ botStep: 0, state: { ...state, stage: "offer", asking: null }, dueAt: null }, fields);
    expect(offer.label).toBe("Бот сделал предложение — ждёт ответа клиента");
    // AI-продажник и подхват переписки.
    const ai = { ...state, engine: "ai" as const, asking: null, ai: { ...state.ai, takeover: true } };
    expect(botStatus({ botStep: 0, state: ai, dueAt: null }, fields).label).toBe("Бот подхватил переписку");
    expect(botStatus({ botStep: 0, state: { ...ai, ai: { ...ai.ai, takeover: false, stage: "objection" as const } }, dueAt: null }, fields).label).toBe("AI-продажник ведёт диалог, снимает возражение");
    expect(botStatus({ botStep: null, state: { ...ai, phase: "waiting", reason: "takeover" }, dueAt: null }, fields)).toMatchObject({ label: "Менеджер не отвечает — бот подхватит переписку", tone: "waiting", canStop: true });

    // Клиент замолчал ночью: напоминание отложено до начала рабочего дня — статус говорит, с каких пор тишина и когда бот напишет.
    vi.stubEnv("TZ", "Asia/Almaty");
    const silent = { ...ai, lastBotAt: "2026-10-19T19:09:34Z", ai: { ...ai.ai, takeover: false, stage: "objection" as const } };
    const due = new Date("2026-10-20T05:00:00Z");
    expect(botStatus({ botStep: 0, state: silent, dueAt: due }, fields, new Date("2026-10-20T04:37:00Z"))).toMatchObject({
      label: "Клиент молчит с 00:09 — бот напомнит в 10:00",
      tone: "waiting",
      canStop: true,
    });
    // Не сегодня — с датой: напоминание «на следующий день».
    expect(botStatus({ botStep: 0, state: silent, dueAt: new Date("2026-10-21T05:00:00Z") }, fields, new Date("2026-10-20T12:00:00Z")).label).toBe("Клиент молчит с 00:09 — бот напомнит 21 октября в 10:00");
    expect(botStatus({ botStep: 0, state: silent, dueAt: new Date("2026-10-21T05:00:00Z") }, fields, new Date("2026-10-21T03:00:00Z")).label).toBe("Клиент молчит с 20 октября 00:09 — бот напомнит в 10:00");
    // Все напоминания уже отправлены — дальше только итог менеджеру.
    const tired = { ...silent, ai: { ...silent.ai, followUps: 3 } };
    expect(botStatus({ botStep: 0, state: tired, dueAt: due }, fields, new Date("2026-10-20T04:37:00Z")).label).toBe("Клиент молчит с 00:09 — итог менеджеру в 10:00");
    // Срок через секунды — пауза перед ответом на свежее сообщение клиента, статус прежний.
    expect(botStatus({ botStep: 0, state: silent, dueAt: new Date("2026-10-20T04:37:05Z") }, fields, new Date("2026-10-20T04:37:00Z")).label).toBe("AI-продажник ведёт диалог, снимает возражение");
    vi.unstubAllEnvs();
  });
});
