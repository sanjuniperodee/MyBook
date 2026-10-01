/**
 * Чистая часть AI-помощника: промпты, схемы структурированного ответа и разбор результата.
 * Без обращений к сети и базе — покрывается юнит-тестами.
 */
import { addons, deliveryOptions, plans } from "@/config/site";

export interface AiMessage {
  direction: "in" | "out";
  text: string;
  internal?: boolean;
  author?: string | null;
  at: Date | string;
}

export interface AiField {
  key: string;
  label: string;
  type: string;
  options: string[];
}

export type AiTemperature = "hot" | "warm" | "cold";

export interface AiSummary {
  summary: string;
  nextStep: string;
  /** Через сколько дней сделать следующий шаг (0 — сегодня). */
  dueDays: number;
  temperature: AiTemperature;
  risks: string;
}

export const temperatureLabels: Record<AiTemperature, string> = { hot: "горячий", warm: "тёплый", cold: "холодный" };

const TZ = "Asia/Almaty";
const stamp = (d: Date | string) =>
  new Intl.DateTimeFormat("ru-RU", { timeZone: TZ, day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(d));

/**
 * Переписка в виде текста для модели: последние сообщения, пока укладываемся в лимит символов.
 * Заметки сотрудников помечены — клиент их не видел, отвечать на них не нужно.
 */
export function transcript(messages: AiMessage[], maxChars = 12_000): string {
  const lines: string[] = [];
  let size = 0;
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    const text = m.text.replace(/\s+/g, " ").trim();
    if (!text) continue;
    const who = m.internal ? `Заметка сотрудника${m.author ? ` (${m.author})` : ""}` : m.direction === "in" ? "Клиент" : `Менеджер${m.author ? ` (${m.author})` : ""}`;
    const line = `[${stamp(m.at)}] ${who}: ${text}`;
    if (size + line.length > maxChars && lines.length) break;
    lines.push(line.length > maxChars ? `${line.slice(0, maxChars)}…` : line);
    size += line.length + 1;
  }
  return lines.reverse().join("\n");
}

const kzt = (n: number) => `${n.toLocaleString("ru-RU")} ₸`;

/** Что модель должна знать о продукте: тарифы и цены берём из конфига, чтобы не разошлись с сайтом. */
export function businessContext(knowledge = ""): string {
  const planNames: Record<string, string> = { digital: "Электронная (PDF)", hardcover: "Твёрдая обложка", premium: "Премиум (дизайнерская бумага, подарочная коробка, приоритетное производство)" };
  const deliveryNames: Record<string, string> = { courier: "курьер по Алматы и Астане", post: "доставка по Казахстану", pickup: "самовывоз в Алматы" };
  const addonNames: Record<string, string> = { express: "экспресс-печать за 3–4 рабочих дня", giftwrap: "подарочная упаковка" };
  return [
    "MyBooks — сервис персональных книг-подарков в Казахстане. Клиент на сайте отвечает на вопросы о близком человеке, добавляет фото и выбирает обложку, а мы печатаем настоящую книгу в твёрдом переплёте. Языки сайта — русский и казахский.",
    `Тарифы: ${plans.map((p) => `${planNames[p.id] ?? p.id} — ${kzt(p.price)}${p.extraCopyPrice ? ` (доп. экземпляр ${kzt(p.extraCopyPrice)})` : ""}`).join("; ")}.`,
    `Доставка: ${deliveryOptions.map((d) => `${deliveryNames[d.id] ?? d.id} — ${d.price ? kzt(d.price) : "бесплатно"}${d.maxDays ? `, до ${d.maxDays} дн.` : ""}`).join("; ")}.`,
    `Допы: ${addons.map((a) => `${addonNames[a.id] ?? a.id} — ${kzt(a.price)}`).join("; ")}.`,
    knowledge.trim() ? `Правила и ответы на частые вопросы от владельца:\n${knowledge.trim().slice(0, 6000)}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

export function replySystemPrompt(knowledge: string, manager: string): string {
  return [
    `Ты помогаешь менеджеру по продажам${manager ? ` (${manager})` : ""} ответить клиенту в мессенджере.`,
    businessContext(knowledge),
    "Напиши один готовый ответ от лица менеджера на последнее сообщение клиента: коротко, тепло и по делу, как живой человек в WhatsApp, без канцелярита. Пиши на языке клиента (русский или казахский).",
    "Не выдумывай цены, сроки, скидки и обещания, которых нет в данных выше. Если ответа нет в данных, предложи уточнить или передать вопрос коллеге.",
    "Если уместно, мягко веди к следующему шагу: начать книгу на сайте, выбрать тариф, оформить заказ к дате праздника.",
    "Выведи только текст сообщения — без кавычек, пояснений и подписи.",
  ].join("\n\n");
}

export function summarySystemPrompt(knowledge: string): string {
  return [
    "Ты — опытный руководитель отдела продаж. По истории сделки коротко опиши ситуацию и порекомендуй менеджеру следующий шаг.",
    businessContext(knowledge),
    "summary — 2–4 предложения: кто клиент, для кого и к какому поводу книга, на чём остановились. next_step — одно конкретное действие менеджера (что сделать и что сказать). due_days — через сколько дней это сделать (0 — сегодня). temperature — hot (готов купить), warm (интересуется), cold (молчит или сомневается). risks — что может сорвать сделку, или пустая строка.",
    "Пиши по-русски. Опирайся только на факты из истории.",
  ].join("\n\n");
}

export const summarySchema = {
  type: "object",
  properties: {
    summary: { type: "string" },
    next_step: { type: "string" },
    due_days: { type: "integer" },
    temperature: { type: "string", enum: ["hot", "warm", "cold"] },
    risks: { type: "string" },
  },
  required: ["summary", "next_step", "due_days", "temperature", "risks"],
  additionalProperties: false,
} as const;

export function parseSummary(raw: unknown): AiSummary | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const summary = typeof r.summary === "string" ? r.summary.trim() : "";
  const nextStep = typeof r.next_step === "string" ? r.next_step.trim() : "";
  if (!summary && !nextStep) return null;
  const due = Number(r.due_days);
  return {
    summary: summary.slice(0, 2000),
    nextStep: nextStep.slice(0, 500),
    dueDays: Number.isFinite(due) ? Math.min(30, Math.max(0, Math.round(due))) : 1,
    temperature: r.temperature === "hot" || r.temperature === "cold" ? r.temperature : "warm",
    risks: typeof r.risks === "string" ? r.risks.trim().slice(0, 500) : "",
  };
}

/** Поля, которые имеет смысл искать в переписке (флажки модель заполняет плохо — пропускаем). */
export const extractableFields = (fields: AiField[]) => fields.filter((f) => f.type !== "checkbox");

export function extractSystemPrompt(fields: AiField[], today: string): string {
  const list = extractableFields(fields)
    .map((f) => `- ${f.key}: «${f.label}»${f.type === "date" ? " — дата в формате ГГГГ-ММ-ДД" : f.type === "number" ? " — число" : f.type === "select" ? ` — одно из: ${f.options.join(" | ")}` : ""}`)
    .join("\n");
  return [
    "Ты извлекаешь данные для карточки сделки из переписки с клиентом.",
    `Сегодня ${today}. Если клиент называет дату без года («к 14 февраля»), выбери ближайшую такую дату в будущем.`,
    `Поля:\n${list}`,
    "Заполняй поле, только если клиент прямо сказал это в переписке; иначе верни пустую строку. Для полей со списком значений выбирай ровно одно из перечисленных. Ничего не додумывай.",
  ].join("\n\n");
}

/** JSON-схема ответа: все поля — строки (пусто = не найдено), списки — enum. */
export function extractSchema(fields: AiField[]) {
  const properties: Record<string, unknown> = {};
  for (const f of extractableFields(fields)) {
    properties[f.key] = f.type === "select" && f.options.length ? { type: "string", enum: [...f.options, ""] } : { type: "string" };
  }
  return { type: "object", properties, required: Object.keys(properties), additionalProperties: false };
}

/**
 * Приводит ответ модели к значениям своих полей по тем же правилам, что и форма:
 * неизвестные ключи, пустые строки, неверные даты и значения вне списка отбрасываются.
 */
export function normalizeExtracted(fields: AiField[], raw: unknown): Record<string, string | number> {
  const out: Record<string, string | number> = {};
  if (!raw || typeof raw !== "object") return out;
  const r = raw as Record<string, unknown>;
  for (const f of extractableFields(fields)) {
    const v = r[f.key];
    if (v === undefined || v === null) continue;
    const s = String(v).trim().slice(0, 500);
    if (!s) continue;
    if (f.type === "number") {
      const n = Number(s.replace(",", ".").replace(/[\s₸]/g, ""));
      if (Number.isFinite(n)) out[f.key] = n;
    } else if (f.type === "date") {
      if (/^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s))) out[f.key] = s;
    } else if (f.type === "select") {
      const hit = f.options.find((o) => o.toLowerCase() === s.toLowerCase());
      if (hit) out[f.key] = hit;
    } else out[f.key] = s;
  }
  return out;
}

/** Ответ модели без обрамляющих кавычек и подписи «— Менеджер». */
export function cleanReply(text: string): string {
  let t = text.trim();
  const inner = t.slice(1, -1);
  if (/^["«“]/.test(t) && /["»”]$/.test(t) && !/["«»“”]/.test(inner)) t = inner.trim();
  return t.slice(0, 4000);
}
