import { describe, expect, it } from "vitest";
import { KNOWLEDGE_LIMIT, selectKnowledge, splitKnowledge, stems } from "@/modules/messaging/domain/botKnowledge";

const delivery = "Доставка\nПо Астане курьер привозит за 1–2 дня, по другим городам Казахстана 3–5 дней. Доставку оплачивает клиент.";
const payment = "Оплата\nПредоплата, остальное после одобрения электронной версии. Есть рассрочка 0-0-12 и Kaspi Red.";
const writing = "Как пишется книга\nНа сайте около 170 вопросов с подсказками, отвечать на все не обязательно, обычно пишут 2–3 дня.";
const filler = (n: number) => `Правило ${n}\n${"Текст о работе редакции и типографии, который не относится к вопросу клиента. ".repeat(12)}`;

describe("База знаний продажника: целиком или по теме", () => {
  it("короткая база уходит целиком и считается стабильной частью инструкции", () => {
    const r = selectKnowledge(`${delivery}\n\n${payment}`, "сколько идёт доставка");
    expect(r).toEqual({ text: `${delivery}\n\n${payment}`, filtered: false, titles: [] });
  });

  it("длинная база: выбираются куски по словам клиента, порядок исходный, лимит соблюдён", () => {
    const parts = [filler(1), delivery, filler(2), payment, filler(3), writing, filler(4), filler(5), filler(6)];
    const text = parts.join("\n\n");
    expect(text.length).toBeGreaterThan(KNOWLEDGE_LIMIT);
    const r = selectKnowledge(text, "А доставка в Астану сколько дней? И оплата как?", 2200);
    expect(r.filtered).toBe(true);
    expect(r.text.length).toBeLessThanOrEqual(2200);
    expect(r.text).toContain("По Астане курьер");
    expect(r.text).toContain("Предоплата, остальное");
    expect(r.text.indexOf("Доставка")).toBeLessThan(r.text.indexOf("Оплата"));
    // Куски без общих слов добираются по порядку, пока есть место, но не вытесняют подходящие.
    expect(r.text.indexOf("По Астане")).toBeGreaterThanOrEqual(0);
    // Заголовки выбранных кусков — для следа хода («Почему так?»), в исходном порядке.
    expect(r.titles).toEqual(expect.arrayContaining(["Доставка", "Оплата"]));
    expect(r.titles.indexOf("Доставка")).toBeLessThan(r.titles.indexOf("Оплата"));
  });

  it("база без пустых строк — не теряется: начало текста в пределах лимита", () => {
    const text = "строка ".repeat(2000);
    const r = selectKnowledge(text, "вопрос", 500);
    expect(r.filtered).toBe(true);
    expect(r.text.length).toBe(500);
  });

  it("заголовки начинают новый кусок; основы слов — первые пять букв", () => {
    expect(splitKnowledge("# Доставка\nпо городу\nВопрос: сколько?\nОтвет: два дня")).toEqual(["# Доставка\nпо городу", "Вопрос: сколько?\nОтвет: два дня"]);
    expect([...stems("Доставку доставили в Астану")]).toEqual(["доста", "астан"]);
  });
});
