import { describe, expect, it } from "vitest";
import { cleanRewrite, isMetaReply, rewriteSystemPrompt } from "@/modules/assistant/domain/rewrite";

describe("AI-помощник при письме", () => {
  it("снимает обрамление ответа модели", () => {
    expect(cleanRewrite("Вот улучшенный текст:\n\nМама пекла пироги.")).toBe("Мама пекла пироги.");
    expect(cleanRewrite("```\nМама пекла пироги.\n```")).toBe("Мама пекла пироги.");
    expect(cleanRewrite("«Мама пекла пироги.»")).toBe("Мама пекла пироги.");
    expect(cleanRewrite("«Мама» пекла «пироги»")).toBe("«Мама» пекла «пироги»");
  });

  it("вставляет просьбу автора и язык книги в промпт", () => {
    const p = rewriteSystemPrompt("custom", "kk", "gift", "сделай теплее");
    expect(p).toContain("«сделай теплее»");
    expect(p).toContain("казахском");
    expect(rewriteSystemPrompt("expand", "ru", "autobiography")).toContain("Не выдумывай");
  });
});

describe("isMetaReply: реплика модели вместо текста не встаёт в книгу", () => {
  it("модель обратилась к автору — это реплика", () => {
    const reply = "Похоже, вы отправили только одно слово, «Добрая», а сам текст не пришёл. Пришлите, пожалуйста, исходный отрывок воспоминания, и я разверну его в полтора-два раза.";
    expect(isMetaReply(reply, "Добрая")).toBe(true);
  });
  it("обычная правка — не реплика, даже с «вы» в тексте автора", () => {
    expect(isMetaReply("Добрая, тёплая и очень внимательная — такой ты была с первого дня.", "Добрая")).toBe(false);
    expect(isMetaReply("Вы отправили нам открытку из Алматы, и мы хранили её годами.", "вы отправили нам открытку")).toBe(false);
  });
  it("в задаче для модели — запрет вопросов и возврат исходного текста, если его мало", () => {
    expect(rewriteSystemPrompt("expand", "ru", "gift")).toContain("Никогда не задавай вопросов");
  });
});
