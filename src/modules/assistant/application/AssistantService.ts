import type { Clock } from "@/shared/application";
import { AssistantError, botUnderstandPrompt, botUnderstandSchema, cleanReply, dossierText, extractableFields, extractionSource, extractSchema, extractSystemPrompt, normalizeExtracted, parseBotUnderstanding, parseSummary, replySystemPrompt, summarySchema, summarySystemPrompt, transcript, type AiField, type AiSummary, type BotUnderstanding } from "../domain";
import type { AssistantData, LanguageModel, Usage } from "./ports";

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    const m = text.match(/\{[\s\S]*\}/);
    if (m) {
      try {
        return JSON.parse(m[0]);
      } catch {
        /* ниже — ошибка */
      }
    }
    throw new AssistantError("badResponse", "Модель вернула ответ в неожиданном формате — попробуйте ещё раз.");
  }
}

/** AI-помощник менеджера: подсказка ответа, резюме сделки, поля из переписки. */
export class AssistantService {
  constructor(
    private readonly model: LanguageModel,
    private readonly data: AssistantData,
    private readonly clock: Clock,
  ) {}

  configured() {
    return this.model.configured();
  }

  /** Подключённый провайдер и модель (для подписей «Claude отвечает…»). */
  describe() {
    return this.model.describe();
  }

  /** Вариант ответа клиенту на последнее сообщение диалога. */
  async suggestReply(conversationId: string, managerName: string) {
    const messages = await this.data.transcript(conversationId, 60);
    if (!messages.some((m) => m.direction === "in" && !m.internal)) throw new AssistantError("nothingToDo", "Клиент ещё ничего не написал — подсказывать нечего.");
    const { text, usage } = await this.model.ask({ system: replySystemPrompt(await this.data.knowledge(), managerName), user: `Переписка:\n${transcript(messages)}\n\nНапиши ответ клиенту.`, effort: "low" });
    return { text: cleanReply(text), usage };
  }

  private async dossier(dealId: string) {
    const d = await this.data.dossier(dealId);
    if (!d) throw new AssistantError("nothingToDo", "Сделка не найдена");
    return d;
  }

  /** Резюме сделки и рекомендованный следующий шаг; сохраняется в карточке. */
  async summarizeDeal(dealId: string): Promise<{ summary: AiSummary; usage: Usage }> {
    const d = await this.dossier(dealId);
    const today = this.clock.now().toISOString().slice(0, 10);
    const { text, usage } = await this.model.ask({ system: summarySystemPrompt(await this.data.knowledge()), user: `${dossierText(d)}\n\nСегодня ${today}.`, effort: "medium", schema: summarySchema });
    const summary = parseSummary(parseJson(text));
    if (!summary) throw new AssistantError("badResponse", "Не удалось разобрать резюме — попробуйте ещё раз.");
    await this.data.saveSummary(dealId, { ...summary, at: this.clock.now().toISOString() });
    return { summary, usage };
  }

  /**
   * Бот-квалификатор не понял ответ клиента: модель подсказывает поля, вопросы клиента, просьбу позвать человека и
   * язык. Быстро (таймаут) и без исключений: не настроено, ошибка, пустой ответ — null, бот обходится своим разбором.
   */
  async understandForBot(input: { messages: { from: "client" | "bot"; text: string }[]; fields: AiField[]; asking: string | null; today: string; timeoutMs?: number }): Promise<BotUnderstanding | null> {
    try {
      if (!(await this.model.configured()) || !input.messages.length) return null;
      const user = input.messages.map((m) => `${m.from === "client" ? "Клиент" : "Бот"}: ${m.text.replace(/\s+/g, " ").trim().slice(0, 1000)}`).join("\n");
      const { text } = await this.model.ask({ system: botUnderstandPrompt(input.fields, input.today, input.asking), user, effort: "low", schema: botUnderstandSchema(input.fields), timeoutMs: input.timeoutMs ?? 5_000 });
      return parseBotUnderstanding(input.fields, parseJson(text));
    } catch {
      return null;
    }
  }

  /** Значения своих полей сделки из переписки и заметок — только предложение, применяет менеджер. */
  async extractDealFields(dealId: string) {
    const [d, fields] = await Promise.all([this.dossier(dealId), this.data.dealFields()]);
    if (!extractableFields(fields).length) throw new AssistantError("nothingToDo", "У сделок нет своих полей для заполнения.");
    const source = extractionSource(d);
    if (!source) throw new AssistantError("nothingToDo", "Нет переписки и заметок, из которых можно взять данные.");
    const today = this.clock.now().toISOString().slice(0, 10);
    const { text, usage } = await this.model.ask({ system: extractSystemPrompt(fields, today), user: source, effort: "low", schema: extractSchema(fields) });
    const values = normalizeExtracted(fields, parseJson(text));
    const current = d.deal.customFields ?? {};
    const proposals = Object.entries(values)
      .filter(([k, v]) => String(current[k] ?? "") !== String(v))
      .map(([key, value]) => {
        const f = fields.find((x) => x.key === key)!;
        return { key, label: f.label, type: f.type, value, current: current[key] === undefined || current[key] === null ? null : String(current[key]) };
      });
    return { proposals, usage };
  }

  /** Проверка ключа из «Интеграций»: короткий запрос к модели. */
  async test() {
    const { text } = await this.model.ask({ system: "Ты проверяешь подключение. Ответь одним словом.", user: "Скажи: готово", effort: "low" });
    return text.slice(0, 60);
  }
}
