// Перенесено обратно из mybook-web (27.11): здесь — проверки общего кода и домена; экраны — в тестах веба.
import { describe, expect, it } from "vitest";
import { compactTrace, readBotTrace, turnTrace, type BotTurnTrace } from "@/modules/messaging/domain/botTrace";
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
