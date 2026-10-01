import { describe, expect, it } from "vitest";
import { AssistantService, type AssistantData, type LanguageModel } from "@/modules/assistant/application";
import { AssistantError, dossierText, type DealDossier } from "@/modules/assistant/domain";

const now = new Date("2026-10-01T06:00:00Z");
const dossier: DealDossier = {
  deal: { id: "d1", number: 7, title: "Книга маме", source: "whatsapp", amount: 24000, contactName: "Айгерим", createdAt: now, stageChangedAt: now, customFields: { recipient: "Мама" } },
  stageName: "Пишет книгу",
  fieldValues: { "Для кого": "Мама" },
  notes: [{ kind: "note", text: "Хочет к 15 ноября", at: now }],
  tasks: [],
  calls: [],
  order: null,
  books: [{ title: "Мама", recipient: "Мама", status: "draft", answered: 12, total: 40 }],
  messages: [{ direction: "in", text: "Успеете к 15 ноября?", internal: false, author: null, at: now.toISOString() }],
};

function setup(reply: string, messages = dossier.messages) {
  const saved: unknown[] = [];
  const asked: { system: string; user: string }[] = [];
  const model: LanguageModel = { configured: async () => true, ask: async (r) => (asked.push(r), { text: reply, usage: { input: 10, output: 5 } }) };
  const data: AssistantData = {
    transcript: async () => messages,
    dossier: async (id) => (id === "d1" ? dossier : null),
    dealFields: async () => [
      { key: "recipient", label: "Для кого", type: "text", options: [] },
      { key: "event_date", label: "Дата события", type: "date", options: [] },
    ],
    knowledge: async () => "Печать 5 рабочих дней",
    saveSummary: async (_id, s) => void saved.push(s),
  };
  return { service: new AssistantService(model, data, { now: () => now }), saved, asked };
}

describe("досье сделки", () => {
  it("этап, источник, книга, заметки и переписка — в одном тексте", () => {
    const text = dossierText(dossier);
    expect(text).toContain("Сделка №7: Книга маме");
    expect(text).toContain("Источник: WhatsApp");
    expect(text).toContain("ответов 12 из 40");
    expect(text).toContain("Хочет к 15 ноября");
    expect(text).toContain("Заказа пока нет.");
  });
});

describe("AssistantService", () => {
  it("подсказка: без сообщений клиента — понятный отказ; база знаний попадает в промпт", async () => {
    await expect(setup("…", []).service.suggestReply("c1", "Менеджер")).rejects.toSatisfy((e: unknown) => AssistantError.is(e));
    const { service, asked } = setup("«Да, успеем!»");
    expect((await service.suggestReply("c1", "Менеджер")).text).toBe("Да, успеем!");
    expect(asked[0].system).toContain("Печать 5 рабочих дней");
  });

  it("резюме сохраняется в карточке с датой; неразборчивый ответ — ошибка", async () => {
    const ok = setup(JSON.stringify({ summary: "Клиентка пишет книгу маме", next_step: "Позвонить", due_days: 1, temperature: "hot", risks: "" }));
    const r = await ok.service.summarizeDeal("d1");
    expect(r.summary.temperature).toBe("hot");
    expect(ok.saved).toEqual([expect.objectContaining({ nextStep: "Позвонить", at: now.toISOString() })]);
    await expect(setup("не json").service.summarizeDeal("d1")).rejects.toSatisfy((e: unknown) => AssistantError.is(e));
  });

  it("поля из переписки: предлагаются только новые значения", async () => {
    const { service } = setup(JSON.stringify({ recipient: "Мама", event_date: "2026-11-15" }));
    const { proposals } = await service.extractDealFields("d1");
    expect(proposals).toEqual([{ key: "event_date", label: "Дата события", type: "date", value: "2026-11-15", current: null }]);
  });
});
