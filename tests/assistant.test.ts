import { describe, expect, it } from "vitest";
import { AssistantService, type AssistantData, type LanguageModel } from "@/modules/assistant/application";
import { AssistantError, businessContext, dossierText, proofreadSystemPrompt, type DealDossier } from "@/modules/assistant/domain";

const now = new Date("2026-10-01T06:00:00Z");
const dossier: DealDossier = {
  deal: { id: "d1", number: 7, title: "Книга маме", source: "whatsapp", amount: 24000, contactName: "Айгерим", createdAt: now, stageChangedAt: now, customFields: { recipient: "Мама" } },
  stageName: "Пишет книгу",
  fieldValues: { "Для кого": "Мама" },
  notes: [{ kind: "note", text: "Хочет к 15 ноября", at: now }],
  tasks: [],
  calls: [],
  order: null,
  books: [{ title: "Мама", theme: "mom", author: "Айгерим", recipient: "Мама", recordedBy: "", status: "draft", answered: 12, total: 40, words: 800 }],
  messages: [{ direction: "in", text: "Успеете к 15 ноября?", internal: false, author: null, at: now.toISOString() }],
};

function setup(reply: string, messages = dossier.messages) {
  const saved: unknown[] = [];
  const asked: { system: string; user: string }[] = [];
  const model: LanguageModel = { configured: async () => true, describe: async () => ({ provider: "anthropic", label: "Claude", model: "test" }), ask: async (r) => (asked.push(r), { text: reply, usage: { input: 10, output: 5 } }) };
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

describe("виды книг в досье и промптах", () => {
  const withBook = (b: Partial<DealDossier["books"][number]>): DealDossier => ({ ...dossier, books: [{ ...dossier.books[0], ...b }] });

  it("досье: подарок — «для кого», автобиография — рассказчик и кто записывает, своя книга — разделы и слова", () => {
    expect(dossierText(dossier)).toContain("Книга на сайте «Мама» для Мама: пишется, ответов 12 из 40");
    const auto = dossierText(withBook({ title: "Моя жизнь", theme: "autobiography", author: "Бакыт", recipient: "", recordedBy: "внучка Аружан", answered: 30, total: 62, words: 4100 }));
    expect(auto).toContain("Автобиография «Моя жизнь», рассказчик Бакыт, записывает внучка Аружан");
    expect(auto).toContain("ответов 30 из 62, слов 4100");
    expect(auto).not.toContain(" для ");
    const own = dossierText(withBook({ title: "Записки", theme: "blank", author: "Айгерим", recipient: "", answered: 4, total: 6, words: 1250 }));
    expect(own).toContain("Своя книга «Записки», автор Айгерим");
    expect(own).toContain("разделов с текстом 4 из 6, слов 1250");
  });

  it("описание продукта знает три вида книг и не называет книгу только подарком", () => {
    const ctx = businessContext();
    expect(ctx).toContain("Три вида книги");
    expect(ctx).toContain("автобиография");
    expect(ctx).toContain("с его слов");
    expect(ctx).toContain("своя книга с нуля");
    expect(ctx).not.toContain("книг-подарков");
  });

  it("подсказка ответа и резюме получают описание видов; резюме просит назвать вид книги", async () => {
    const { service, asked } = setup("Да!");
    await service.suggestReply("c1", "Менеджер");
    expect(asked[0].system).toContain("автобиография");
    const s = setup(JSON.stringify({ summary: "ок", next_step: "позвонить", due_days: 1, temperature: "warm", risks: "" }));
    await s.service.summarizeDeal("d1");
    expect(s.asked[0].system).toContain("автобиография чья или своя книга с нуля");
  });

  it("корректор: вид книги в промпте", () => {
    expect(proofreadSystemPrompt("ru", "ru")).toContain("подарочной книги-воспоминания");
    expect(proofreadSystemPrompt("ru", "ru", "autobiography")).toContain("от первого лица");
    expect(proofreadSystemPrompt("ru", "ru", "blank")).toContain("авторской книги");
  });
});
