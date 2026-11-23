import { describe, expect, it } from "vitest";
import { fillTemplate, greetingName } from "@/shared/domain/templates";
import { clientText } from "@/modules/automation/domain";

describe("Имя в обращении к клиенту (тексты правил)", () => {
  it("ник WhatsApp и номер — не имя: края без букв срезаются, без букв или с цифрами — пусто", () => {
    expect(greetingName("Айгерим")).toBe("Айгерим");
    expect(greetingName("Аделя Акбердиева")).toBe("Аделя Акбердиева");
    expect(greetingName("~Ayaulym~")).toBe("Ayaulym");
    expect(greetingName("⁠Зарина")).toBe("Зарина");
    expect(greetingName("❤Amina❤")).toBe("Amina");
    expect(greetingName("✨")).toBe("");
    expect(greetingName(".")).toBe("");
    expect(greetingName("💸 🅝🅤🅡🅐 💸")).toBe("");
    expect(greetingName("77051530746")).toBe("");
    expect(greetingName("…9508")).toBe("");
    expect(greetingName("Завтра Обед 10к Предоп")).toBe("");
    expect(greetingName(null)).toBe("");
  });

  it("пустое имя — «Здравствуйте!» без запятой", () => {
    expect(fillTemplate("Здравствуйте, {имя}! Ваш заказ №{заказ}", { name: greetingName("✨"), order: 7 })).toBe("Здравствуйте! Ваш заказ №7");
  });

  it("clientText: имя из учётной записи первым, ник сделки — запасным; казахский текст — с казахскими поводом и датой", () => {
    const a = { text: "Здравствуйте, {имя}! {повод} — {дата}", textKk: "Сәлеметсіз бе, {имя}! {повод} — {дата}" };
    const vars = { name: "~Ayaulym~", occasion: "Новый год", date: "31 декабря" };
    expect(clientText(a, "ru", vars, null, "Аяулым")).toBe("Здравствуйте, Аяулым! Новый год — 31 декабря");
    expect(clientText(a, "ru", vars, null, "✨")).toBe("Здравствуйте, Ayaulym! Новый год — 31 декабря");
    expect(clientText(a, "kk", { ...vars, name: "." }, { occasion: "Жаңа жыл", date: "31 желтоқсан" }, null)).toBe("Сәлеметсіз бе! Жаңа жыл — 31 желтоқсан");
  });
});
