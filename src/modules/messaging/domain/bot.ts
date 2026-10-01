import { fillTemplate } from "@/lib/crm/automation-meta";
import { matchOption, parseDateAnswer, questionText, type BotConfig } from "@/lib/crm/bot-logic";

export { defaultBotConfig, parseBotConfig, type BotConfig, type BotQuestion } from "@/lib/crm/bot-logic";

export type BotMode = "off" | "always" | "off_hours";
export const BOT_DONE = -1;

export interface DealField {
  key: string;
  label: string;
  type: string;
  options: string[];
}

/** Ответ клиента → значение своего поля сделки (вариант из списка, дата, число или текст). */
export function answerValue(text: string, field: DealField | undefined): string | number | null {
  const t = text.trim().slice(0, 300);
  if (field?.type === "select") return matchOption(t, field.options);
  if (field?.type === "date") return parseDateAnswer(t);
  if (field?.type === "number") {
    const n = Number(t.replace(",", "."));
    return Number.isFinite(n) ? n : null;
  }
  return t || null;
}

export function botQuestion(config: BotConfig, step: number, fields: DealField[]) {
  const q = config.questions[step];
  if (!q) return null;
  const f = fields.find((x) => x.key === q.field);
  return questionText(q, f?.type === "select" ? f.options : null);
}

export const firstName = (contactName: string) => contactName.split(" ")[0] ?? "";
export const botGreeting = (config: BotConfig, contactName: string) => fillTemplate(config.greeting, { name: firstName(contactName) });
export const botFinish = (config: BotConfig, contactName: string) => fillTemplate(config.finish, { name: firstName(contactName) });

/** Сводка ответов для менеджера. */
export function botSummary(config: BotConfig, fields: DealField[], values: Record<string, unknown>) {
  return config.questions
    .map((q) => {
      const f = fields.find((x) => x.key === q.field);
      const v = values[q.field];
      return f ? `${f.label}: ${v === undefined || v === null || v === "" ? "—" : String(v)}` : null;
    })
    .filter(Boolean)
    .join("\n");
}
