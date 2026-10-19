import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { compactTrace, readBotTrace, turnTrace, type BotTurnTrace } from "@/modules/messaging/domain/botTrace";
import { traceRows } from "@/modules/messaging/ui/botTrace";
import { BotTraceButton, BotTraceView } from "@/components/admin/chat/BotTrace";
import { MessageBubble, type Msg } from "@/components/admin/chat/MessageBubble";

/** «Почему так?» у ответа бота (P0-11, bots-1): след хода строками для сотрудника, поповер в чате, чтение из журнала. */
const trace: BotTurnTrace = turnTrace({
  purpose: "reply",
  decision: { action: "handoff", stage: "offer", handoff: "price_request", lang: "kk", summary: "Хочет печатную книгу маме к юбилею" },
  context: {
    tokens: { input: 5120, output: 230, calls: 3 },
    deadline: { date: "2026-11-20", kind: "tight", fillBy: "2026-11-13", expressFillBy: "2026-11-16", city: "Астана" },
    notes: [{ code: "deadline_recheck" }, { code: "rewrite", detail: "price: 25 000" }],
    lessons: [{ id: "l1", text: "Задавай один вопрос за сообщение" }],
    knowledge: { all: false, titles: ["Доставка", "Оплата"] },
  },
  state: { phase: "done", outcome: "handoff" },
  events: [{ kind: "answer", reason: null }, { kind: "handoff", reason: "price_request" }],
  fields: { "Для кого": "Маме", "Дата события": "2026-11-20" },
  notes: [{ code: "intro_added" }],
  materials: 5,
});

describe("след хода бота: строки для сотрудника", () => {
  it("решение модели, итог, поля, срок, подборка, правки кода, уроки, база знаний, токены — по-русски, без сырых кодов", () => {
    const rows = traceRows(trace);
    expect(rows.map((r) => r.label)).toEqual(["Модель решила", "Заметка модели", "Итог хода", "Записал в сделку", "Срок к дате (считает код)", "Подборка материалов", "Что сделал код", "Уроки в инструкции (1)", "База знаний", "Токены"]);
    const text = rows.flatMap((r) => r.lines).join("\n");
    for (const s of [
      "передать менеджеру · этап: предложение · причина: цену называет менеджер · язык: казахский",
      "передал менеджеру: цену называет менеджер",
      "Для кого: Маме",
      "20 ноября (Астана): успеваем впритык, дописать до 13 ноября, с экспресс-печатью — до 16 ноября",
      "ушла (файлов: 5)",
      "клиент назвал дату или город — срок посчитал код",
      "первый ответ не прошёл проверку — модель переписала (price: 25 000)",
      "добавил представление",
      "Задавай один вопрос за сообщение",
      "Доставка",
      "5120 на входе, 230 в ответе · запросов к модели: 3",
    ])
      expect(text).toContain(s);
    for (const code of ["price_request", "deadline_recheck", "intro_added", "handoff"]) expect(text).not.toContain(code);
    expect(rows.find((r) => r.label === "Что сделал код")?.warn).toBe(true);
  });

  it("модель не ответила — ошибка вместо решения; беседа идёт — «продолжается»; напоминание помечено", () => {
    const failed = traceRows(turnTrace({ purpose: "reply", decision: null, context: null, state: { phase: "done", outcome: "handoff" }, events: [{ kind: "handoff", reason: "ai_error" }], notes: [{ code: "ai_error" }], error: "таймаут" }));
    expect(failed[0]).toEqual({ label: "Модель", lines: ["не ответила: таймаут"], warn: true });
    expect(failed.find((r) => r.label === "Итог хода")?.lines).toEqual(["передал менеджеру: модель не ответила дважды"]);
    expect(failed.some((r) => r.label === "Токены")).toBe(false);
    const follow = traceRows(turnTrace({ purpose: "follow_up", decision: { action: "reply", stage: "offer", handoff: "none", lang: "ru", summary: "" }, context: null, state: { phase: "active", outcome: null }, events: [] }));
    expect(follow[0]).toEqual({ label: "Ход", lines: ["напоминание молчащему клиенту"] });
    expect(follow.find((r) => r.label === "Итог хода")?.lines).toEqual(["беседа продолжается"]);
  });

  it("снимок поповера «Почему так?» под ответом бота", () => {
    // Содержимое поповера — снимком (без иконки: её разметка меняется с версией библиотеки).
    expect(renderToStaticMarkup(<BotTraceView trace={trace} />)).toMatchSnapshot();
    const open = renderToStaticMarkup(<BotTraceButton conversationId="c1" messageId="m1" initial={trace} />);
    expect(open).toContain("Почему так?");
    expect(open).toContain('aria-expanded="true"');
    expect(open).toContain('data-testid="bot-trace"');
    // Закрыт по умолчанию: след загружается с сервера только по клику.
    const closed = renderToStaticMarkup(<BotTraceButton conversationId="c1" messageId="m1" />);
    expect(closed).toContain('aria-expanded="false"');
    expect(closed).not.toContain('data-testid="bot-trace"');
  });

  it("в чате «Почему так?» — только у ответа продажника со следом", () => {
    const msg = (over: Partial<Msg>): Msg => ({ id: "m1", direction: "out", type: "text", text: "Здравствуйте", mediaUrl: null, status: "read", error: null, author: "бот", at: "2026-10-18T06:00:00.000Z", ...over });
    const render = (m: Msg) => renderToStaticMarkup(<MessageBubble m={m} me="staff-1" now={Date.parse("2026-10-18T06:01:00Z")} timeZone="Asia/Almaty" conversationId="c1" canSend highlighted={false} onAction={() => {}} onOpenMedia={() => {}} onJump={() => {}} onVoiceEnded={() => {}} />);
    expect(render(msg({ trace: true }))).toContain("Почему так?");
    // Шаблонный бот (следа нет), менеджер и удалённое сообщение — без кнопки.
    expect(render(msg({}))).not.toContain("Почему так?");
    expect(render(msg({ trace: true, author: "Марат" }))).not.toContain("Почему так?");
    expect(render(msg({ trace: true, deleted: true }))).not.toContain("Почему так?");
  });
});

describe("след хода бота: хранение", () => {
  it("из журнала читается только свой формат; неизвестные пометки отбрасываются", () => {
    expect(readBotTrace(null)).toBeNull();
    expect(readBotTrace({ v: 2, result: {}, notes: [] })).toBeNull();
    expect(readBotTrace("строка")).toBeNull();
    const stored = JSON.parse(JSON.stringify({ ...trace, notes: [...trace.notes, { code: "что-то новое" }] }));
    expect(readBotTrace(stored)).toEqual(trace);
  });

  it("след компактный: заметка модели до 300 знаков, значения полей до 120, пометки без повторов и не больше 12", () => {
    const big = compactTrace({
      ...trace,
      model: { ...trace.model!, summary: "а".repeat(1000) },
      fields: { "Для кого": "б".repeat(500) },
      notes: [...Array.from({ length: 20 }, (_, i) => ({ code: "rewrite" as const, detail: `правка ${i}` })), { code: "loop" }, { code: "loop" }],
    });
    expect(big.model!.summary.length).toBe(300);
    expect(String(big.fields["Для кого"]).length).toBe(120);
    expect(big.notes).toHaveLength(12);
    expect(compactTrace({ ...trace, notes: [{ code: "loop" }, { code: "loop" }] }).notes).toEqual([{ code: "loop" }]);
  });
});
