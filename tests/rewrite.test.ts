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

describe("AI-помощник: длинный ответ — частями", () => {
  it("20 тысяч знаков уходят частями по абзацам и собираются без потерь, с пустыми строками автора", async () => {
    const { ProofreadService } = await import("@/modules/assistant/application/ProofreadService");
    const sizes: number[] = [];
    const model = {
      describe: async () => ({ provider: "anthropic" as const, label: "", model: "" }),
      configured: async () => true,
      ask: async ({ user }: { user: string }) => {
        sizes.push(user.length);
        return { text: user.toUpperCase(), usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 } };
      },
    };
    const paragraphs = Array.from({ length: 50 }, (_, i) => `абзац ${i} `.repeat(50).trim());
    const text = paragraphs.join("\n\n");
    expect(text.length).toBeGreaterThan(20_000);
    const out = await new ProofreadService(model as never).rewrite(text, "improve", "kk");
    expect(sizes.length).toBeGreaterThan(2);
    expect(Math.max(...sizes)).toBeLessThanOrEqual(6_000);
    expect(out).toBe(text.toUpperCase());
  });

  it("короткий текст — одним запросом", async () => {
    const { ProofreadService } = await import("@/modules/assistant/application/ProofreadService");
    let calls = 0;
    const model = { describe: async () => ({}), configured: async () => true, ask: async ({ user }: { user: string }) => (calls++, { text: `${user}!`, usage: {} }) };
    expect(await new ProofreadService(model as never).rewrite("Мама пекла пироги.", "improve", "ru")).toBe("Мама пекла пироги.!");
    expect(calls).toBe(1);
  });
});
