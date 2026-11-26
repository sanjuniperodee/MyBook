import type { Clock } from "@/shared/application";
import { AssistantError, numberedTranscript, normalizeStageReview, stageReviewPrompt, stageReviewSchema, type ReviewStage, type StageReview, type AiMessage, dealVerdictPrompt, dealVerdictSchema, normalizeDealVerdict, type DealVerdict, parseTemplateDraft, substituteKnown, templateDraftPrompt, templateDraftSchema, titleFromText, type TemplateDraft, type TemplateFacts, botUnderstandPrompt, botUnderstandSchema, cleanReply, dossierText, extractableFields, extractionSource, extractSchema, extractSystemPrompt, normalizeExtracted, parseBotUnderstanding, parseSummary, replySystemPrompt, summarySchema, summarySystemPrompt, transcript, type AiField, type AiSummary, type BotUnderstanding } from "../domain";
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

  /**
   * Вывод по затихшей заявке из переписки и заметок: отказался (с причиной из списка воронки), обещал вернуться, молчит
   * или не покупатель — и строка для ленты сделки. Нет переписки или модель ответила не по схеме — null.
   */
  async assessDeal(dealId: string, reasons: string[]): Promise<DealVerdict | null> {
    const d = await this.dossier(dealId);
    const source = extractionSource(d);
    if (!source) return null;
    const today = this.clock.now().toISOString().slice(0, 10);
    const { text } = await this.model.ask({ system: dealVerdictPrompt(reasons, today), user: source, effort: "low", schema: dealVerdictSchema(reasons), timeoutMs: 30_000 });
    return normalizeDealVerdict(parseJson(text), reasons);
  }

  /**
   * Разбор этапа по свежей переписке («ИИ ведёт этапы»): последние сообщения с номерами, факты сделки (книга, заказ,
   * задачи, звонки, заметки) и этапы воронки с ролями. Возвращает вывод модели и сообщения, которые она видела (по номеру
   * сервер проверяет цитату). Нет переписки или ответ не по схеме — review: null.
   */
  async reviewStage(dealId: string, input: { stages: ReviewStage[]; current: string; reasons: string[]; messages: number; staff?: string[] }): Promise<{ review: StageReview | null; messages: AiMessage[] }> {
    const d = await this.dossier(dealId);
    const messages = d.messages.filter((m) => !m.internal && m.text.trim()).slice(-input.messages);
    if (!messages.some((m) => m.direction === "in")) return { review: null, messages };
    const today = this.clock.now().toISOString().slice(0, 10);
    const order = d.order ? `№${d.order.number}, статус ${d.order.status}, ${d.order.amount} ₸` : null;
    const facts = dossierText({ ...d, messages: [] }).replace(/\nПереписки нет\.$/, "");
    const { text } = await this.model.ask({
      system: stageReviewPrompt(input.stages, input.current, input.reasons, today, order, input.staff ?? []),
      user: `${facts}\n\nПереписка (последние сообщения, номер в скобках):\n${numberedTranscript(messages)}`,
      effort: "low",
      schema: stageReviewSchema(input.reasons),
      timeoutMs: 45_000,
    });
    return { review: normalizeStageReview(parseJson(text), input.stages.length, messages.length, input.reasons, input.staff?.length ?? 0), messages };
  }

  /**
   * Шаблон из сообщения: данные этого клиента (имя, номер заказа, имя менеджера, ссылка) заменяются подстановками.
   * Известные значения подставляются без модели; модель, если подключена, находит остальное (ссылку на оплату,
   * повод, дату) и придумывает название. Модель не подключена, ошибка или она «переписала» текст — остаётся
   * результат без модели; текст без данных клиента возвращается как есть. Исключений не бросает.
   */
  async draftTemplate(original: string, facts: TemplateFacts & { link?: string | null }, fieldLabels: string[] = []): Promise<TemplateDraft & { ai: boolean }> {
    const base = substituteKnown(original.trim(), facts);
    // Ссылки на оплату и на заказ — всегда {ссылка}: у каждого клиента своя.
    const linkRe = /https?:\/\/\S+/g;
    const links = base.text.match(linkRe) ?? [];
    const plain: TemplateDraft = { title: titleFromText(base.text), text: base.text.slice(0, 2000), replaced: base.replaced };
    try {
      if (!(await this.model.configured())) return { ...plain, ai: false };
      const user = [`Сообщение:\n${base.text}`, "", "Известные данные диалога:", `- имя клиента: ${facts.name || "неизвестно"}`, `- имя менеджера: ${facts.manager || "неизвестно"}`, `- номер заказа: ${facts.order ?? "нет"}`, links.length ? `- ссылки в тексте: ${links.join(", ")}` : ""].filter(Boolean).join("\n");
      const { text } = await this.model.ask({ system: templateDraftPrompt(fieldLabels), user, effort: "low", schema: templateDraftSchema, timeoutMs: 25_000 });
      const draft = parseTemplateDraft(parseJson(text), base.text, fieldLabels);
      if (!draft) return { ...plain, ai: false };
      // Замены без модели тоже показываем (модель могла их не перечислить).
      const seen = new Set(draft.replaced.map((r) => r.with + r.was));
      return { ...draft, replaced: [...base.replaced.filter((r) => !seen.has(r.with + r.was)), ...draft.replaced], ai: true };
    } catch {
      return { ...plain, ai: false };
    }
  }

  /** Проверка ключа из «Интеграций»: короткий запрос к модели. */
  async test() {
    const { text } = await this.model.ask({ system: "Ты проверяешь подключение. Ответь одним словом.", user: "Скажи: готово", effort: "low" });
    return text.slice(0, 60);
  }
}
