import { describe, expect, it } from "vitest";
import { AUTOFILL_PER_DAY, aiAutofill, type AutofillDeps } from "@/server/ai-autofill";

// Автозаполнение пустых полей сделки из переписки менеджера (bots-4).
function deps(over: Partial<AutofillDeps> = {}) {
  const log: string[] = [];
  const fields: Record<string, Record<string, unknown>> = { d1: { event_date: "", recipient: "Мама", occasion: null }, d2: { event_date: "2026-12-31", recipient: "Брат", occasion: "Новый год" } };
  const d: AutofillDeps = {
    enabled: async () => true,
    card: async () => false,
    nameContact: async (id, name) => (log.push(`name:${id}:${name}`), true),
    staffNames: async () => ["ИндираОП", "Расул"],
    propose: async (id, p) => (log.push(`propose:${id}:${JSON.stringify(p)}`), true),
    configured: async () => true,
    parsedToday: async () => 0,
    candidates: async (limit) => (log.push(`limit:${limit}`), [{ conversationId: "c1", dealId: "d1" }, { conversationId: "c2", dealId: "d2" }]),
    markParsed: async (id) => void log.push(`parsed:${id}`),
    extract: async (_id, withName) => [
      ...(withName ? [{ key: "contact_name", label: "Имя клиента", value: "Айгерим" }, { key: "pay_form", label: "Форма оплаты", value: "Наличные" }] : []),
      { key: "event_date", label: "Дата события", value: "2026-11-20" },
      { key: "recipient", label: "Для кого", type: "text", value: "Папа" },
      { key: "occasion", label: "Повод", value: "День рождения" },
      { key: "format", label: "Формат", value: "Печатная" },
    ],
    fields: async (id) => fields[id] ?? null,
    fillEmpty: async (id, v) => void log.push(`fill:${id}:${JSON.stringify(v)}`),
    note: async (id, text) => void log.push(`note:${id}:${text}`),
    audit: async (id) => void log.push(`audit:${id}`),
    logError: (err) => void log.push(`error:${String(err)}`),
    ...over,
  };
  return { d, log };
}

describe("автозаполнение полей сделки из переписки (bots-4)", () => {
  it("заполняет только пустые из трёх полей; заполненная сделка — без записи; отметка разбора до запроса", async () => {
    const { d, log } = deps();
    expect(await aiAutofill(d)).toBe(1);
    expect(log).toEqual([
      "limit:5",
      "parsed:c1",
      `fill:d1:${JSON.stringify({ event_date: "2026-11-20", occasion: "День рождения" })}`,
      "note:d1:AI заполнил из переписки: Дата события — 2026-11-20, Повод — День рождения. Проверьте, если что-то не так.",
      "audit:d1",
      "parsed:c2",
    ]);
  });

  it("выключено, модель не подключена или лимит дня выбран — ничего не делает", async () => {
    for (const over of [{ enabled: async () => false }, { configured: async () => false }, { parsedToday: async () => AUTOFILL_PER_DAY }]) {
      const { d, log } = deps(over);
      expect(await aiAutofill(d)).toBe(0);
      expect(log).toEqual([]);
    }
    const { d, log } = deps({ parsedToday: async () => AUTOFILL_PER_DAY - 2 });
    await aiAutofill(d);
    expect(log[0]).toBe("limit:2");
  });

  it("ошибка модели — в лог, диалог отмечен и не зацикливается, следующие идут дальше", async () => {
    let n = 0;
    const { d, log } = deps({
      extract: async () => {
        if (n++ === 0) throw new Error("timeout");
        return [{ key: "event_date", label: "Дата события", value: "2027-01-05" }];
      },
      fields: async () => ({}),
    });
    expect(await aiAutofill(d)).toBe(1);
    expect(log.filter((l) => l.startsWith("parsed"))).toEqual(["parsed:c1", "parsed:c2"]);
    expect(log).toContain("error:Error: timeout");
    expect(log).toContain(`fill:d2:${JSON.stringify({ event_date: "2027-01-05" })}`);
  });

  it("«ИИ в CRM» → карточка: все свои поля и имя вместо заглушки; вписанное — предложением; форму оплаты не трогает", async () => {
    const { d, log } = deps({ card: async () => true, candidates: async () => [{ conversationId: "c1", dealId: "d1" }], fields: async () => ({ event_date: "", recipient: "Мама", occasion: "Новый год" }) });
    expect(await aiAutofill(d)).toBe(1);
    expect(log).toEqual([
      "parsed:c1",
      `fill:d1:${JSON.stringify({ event_date: "2026-11-20", format: "Печатная" })}`,
      "name:d1:Айгерим",
      "note:d1:ИИ: заполнил из переписки. Дата события — 2026-11-20, Формат — Печатная, Имя клиента — Айгерим.",
      "audit:d1",
      // Повод (список) — предложение замены; «Для кого» (свободный текст) — нет.
      `propose:d1:${JSON.stringify({ key: "occasion", label: "Повод", from: "Новый год", to: "День рождения" })}`,
    ]);
  });

  it("имя сотрудника («Меня зовут Индира» менеджера) за имя клиента не ставим; «Другой повод» вместо конкретного — не предлагаем", async () => {
    const { d, log } = deps({
      card: async () => true,
      candidates: async () => [{ conversationId: "c1", dealId: "d1" }],
      fields: async () => ({ occasion: "Свадьба" }),
      extract: async () => [
        { key: "contact_name", label: "Имя клиента", value: "Индира" },
        { key: "occasion", label: "Повод", value: "Другой повод" },
      ],
    });
    expect(await aiAutofill(d)).toBe(0);
    expect(log).toEqual(["parsed:c1"]);
  });
});
