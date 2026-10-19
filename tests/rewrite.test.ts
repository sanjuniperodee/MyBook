import { describe, expect, it } from "vitest";
import { cleanRewrite, rewriteSystemPrompt } from "@/modules/assistant/domain/rewrite";

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
