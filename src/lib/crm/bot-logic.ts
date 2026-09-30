/**
 * Бот-квалификатор: разбор ответов клиента без обращения к БД (покрыто тестами).
 */
export interface BotQuestion {
  text: string;
  /** Ключ своего поля сделки, куда записать ответ. */
  field: string;
}

export interface BotConfig {
  greeting: string;
  questions: BotQuestion[];
  finish: string;
}

export const defaultBotConfig: BotConfig = {
  greeting: "Здравствуйте, {имя}! Я помощник MyBooks — задам пару коротких вопросов, чтобы менеджер сразу подготовил для вас предложение.",
  questions: [
    { text: "Для кого будет книга? Например: для мамы, для мужа, для подруги.", field: "recipient" },
    { text: "По какому поводу дарите?", field: "occasion" },
    { text: "К какой дате нужна книга? Например: 15.11", field: "event_date" },
    { text: "Какая книга нужна — печатная или электронная?", field: "format" },
  ],
  finish: "Спасибо! Передала ваши ответы менеджеру — он скоро напишет 🙌",
};

export function parseBotConfig(raw: string | null | undefined): BotConfig {
  try {
    const v = JSON.parse(raw ?? "") as Partial<BotConfig>;
    const questions = Array.isArray(v.questions)
      ? v.questions.filter((q): q is BotQuestion => !!q && typeof q.text === "string" && q.text.trim() !== "" && typeof q.field === "string").slice(0, 6)
      : defaultBotConfig.questions;
    return {
      greeting: typeof v.greeting === "string" ? v.greeting : defaultBotConfig.greeting,
      questions,
      finish: typeof v.finish === "string" ? v.finish : defaultBotConfig.finish,
    };
  } catch {
    return defaultBotConfig;
  }
}

/** Вопрос для поля-списка: варианты с номерами, чтобы клиенту было проще ответить цифрой. */
export function questionText(q: BotQuestion, options: string[] | null) {
  if (!options?.length) return q.text;
  return `${q.text}\n${options.map((o, i) => `${i + 1} — ${o}`).join("\n")}`;
}

/** «15.11», «15.11.2026», «15 ноября» → ближайшая будущая дата YYYY-MM-DD. */
export function parseDateAnswer(text: string, now = new Date()): string | null {
  const months = ["январ", "феврал", "март", "апрел", "ма", "июн", "июл", "август", "сентябр", "октябр", "ноябр", "декабр"];
  const t = text.toLowerCase().trim();
  let day: number | null = null;
  let month: number | null = null;
  let year: number | null = null;
  const num = /(\d{1,2})[./-](\d{1,2})(?:[./-](\d{2,4}))?/.exec(t);
  if (num) {
    day = Number(num[1]);
    month = Number(num[2]);
    year = num[3] ? Number(num[3].length === 2 ? `20${num[3]}` : num[3]) : null;
  } else {
    const word = /(\d{1,2})\s+([а-яё]+)/.exec(t);
    if (word) {
      const idx = months.findIndex((m) => word[2].startsWith(m) && !(m === "ма" && word[2].startsWith("мар")));
      if (idx >= 0) {
        day = Number(word[1]);
        month = idx + 1;
      }
    }
  }
  if (!day || !month || month > 12 || day > 31) return null;
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  let y = year ?? now.getFullYear();
  if (!year && Date.UTC(y, month - 1, day) < today) y += 1;
  const d = new Date(Date.UTC(y, month - 1, day));
  if (d.getUTCDate() !== day) return null;
  return d.toISOString().slice(0, 10);
}

/** Ответ на вопрос-список: номер варианта или текст, похожий на вариант. */
export function matchOption(text: string, options: string[]): string | null {
  const t = text.toLowerCase().trim();
  const n = /^\s*(\d{1,2})\b/.exec(t);
  if (n && Number(n[1]) >= 1 && Number(n[1]) <= options.length) return options[Number(n[1]) - 1];
  const exact = options.find((o) => o.toLowerCase() === t);
  if (exact) return exact;
  return options.find((o) => t.includes(o.toLowerCase()) || o.toLowerCase().startsWith(t.slice(0, Math.max(4, Math.min(t.length, 6))))) ?? null;
}
