/**
 * Чистая часть AI-помощника: промпты, схемы структурированного ответа и разбор результата.
 * Без обращений к сети и базе — покрывается юнит-тестами.
 */
import { getAddons, getDeliveryOptions, getVisiblePlans } from "@/config/site";
import { storeTimeZone } from "@/shared/domain/time";

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

/** Время сообщения — по часовому поясу магазина. */
const stamp = (d: Date | string) =>
  new Intl.DateTimeFormat("ru-RU", { timeZone: storeTimeZone(), day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(d));

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
  const deliveryNames: Record<string, string> = { courier: "курьер по Алматы и Астане", post: "доставка по Казахстану", pickup: "самовывоз в Алматы", abroad: "в другие страны (Россия, Кыргызстан, Узбекистан и др.)" };
  const addonNames: Record<string, string> = { express: "экспресс-печать за 3–4 рабочих дня", giftwrap: "подарочная упаковка" };
  return [
    "MyBooks — сервис персональных книг в Казахстане: клиент пишет книгу на сайте, добавляет фото и выбирает обложку, а мы печатаем настоящую книгу в твёрдом переплёте. Языки сайта — русский и казахский.",
    "Три вида книги: (1) подарок близкому — любимому человеку, маме, папе или другу: клиент отвечает на вопросы о нём; (2) автобиография — книга о своей жизни: вопросы рассказчику о его жизни, текст от первого лица; пишет сам рассказчик или близкий человек с его слов (внук записывает историю дедушки), получателя нет — «для детей и внуков» это посвящение, а кто записал, указано на обороте титула; (3) своя книга с нуля — готовых вопросов нет, автор сам создаёт главы и разделы (заголовок и текст), получатель необязателен. Не говори клиенту, что книгу можно сделать только в подарок.",
    `Тарифы: ${getVisiblePlans().map((p) => `${planNames[p.id] ?? p.id} — ${kzt(p.price)}${p.extraCopyPrice ? ` (доп. экземпляр ${kzt(p.extraCopyPrice)})` : ""}`).join("; ")}.`,
    `Доставка: ${getDeliveryOptions()
      .map((d) => (d.quoted ? `${deliveryNames[d.id] ?? d.id} — стоимость${d.id === "abroad" ? " и срок" : ""} рассчитывается индивидуально (зависит от города и способа: СДЭК, Казпочта, InDriver), её считает менеджер по адресу, в сумму заказа не входит (цену доставки не называй)${d.id !== "abroad" && d.maxDays ? `, до ${d.maxDays} дн.` : ""}` : `${deliveryNames[d.id] ?? d.id} — ${d.price ? kzt(d.price) : "бесплатно"}${d.maxDays ? `, до ${d.maxDays} дн.` : ""}`))
      .join("; ")}.`,
    `Допы: ${getAddons().filter((a) => !a.hidden).map((a) => `${addonNames[a.id] ?? a.id} — ${kzt(a.price)}`).join("; ")}.`,
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
    "summary — 2–4 предложения: кто клиент, какая книга (подарок и для кого, автобиография чья или своя книга с нуля), повод или дата, если есть, на чём остановились. next_step — одно конкретное действие менеджера (что сделать и что сказать). due_days — через сколько дней это сделать (0 — сегодня). temperature — hot (готов купить), warm (интересуется), cold (молчит или сомневается). risks — что может сорвать сделку, или пустая строка.",
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

// ─── бот-квалификатор: понять ответ клиента ─────────────────────────────────

export const BOT_AI_INTENTS = ["price", "delivery", "timing", "how", "payment", "examples", "language"] as const;
export const BOT_AI_HANDOFFS = ["call", "manager", "paid", "pay", "complaint"] as const;
export type BotAiIntent = (typeof BOT_AI_INTENTS)[number];
export type BotAiHandoff = (typeof BOT_AI_HANDOFFS)[number];

export interface BotUnderstanding {
  fields: Record<string, string>;
  intents: BotAiIntent[];
  handoff: BotAiHandoff | null;
  lang: "ru" | "kk" | null;
}

/**
 * Промпт для бота-квалификатора: модель только понимает сообщение (поля, вопросы клиента, просьбу позвать человека,
 * язык). Отвечает клиенту бот — шаблонами из настроек; цены, сроки и скидки модель не называет.
 */
export function botUnderstandPrompt(fields: AiField[], today: string, asking: string | null): string {
  const list = extractableFields(fields)
    .map((f) => `- ${f.key}: «${f.label}»${f.type === "date" ? " — дата ГГГГ-ММ-ДД" : f.type === "number" ? " — число" : f.type === "select" ? ` — одно из: ${f.options.join(" | ")}` : ""}`)
    .join("\n");
  const current = fields.find((f) => f.key === asking);
  return [
    "Ты разбираешь сообщения клиента в WhatsApp для бота магазина персональных книг-подарков MyBooks (Казахстан). Клиенты пишут по-русски или по-казахски, бывает с ошибками и без казахских букв («туган кунге»).",
    `Сегодня ${today}. Дату без года понимай как ближайшую будущую.`,
    current ? `Бот только что спросил «${current.label}» (${current.key}) — сообщение, скорее всего, ответ на этот вопрос.` : "",
    `Поля:\n${list}`,
    "fields — значения только тех полей, о которых клиент прямо сказал; для полей-списков — ровно один вариант из перечисленных; иначе пустая строка. Ничего не додумывай.",
    "intents — о чём клиент спрашивает: price (цена, скидка), delivery (доставка, город), timing (сроки, успеете ли), how (как это работает, с чего начать), payment (оплата, рассрочка, Kaspi), examples (примеры, отзывы), language (язык книги).",
    "handoff — просит ли человека: call (позвонить), manager (менеджер, живой человек), paid (уже оплатил), pay (хочет оплатить, просит реквизиты), complaint (жалоба, возврат); иначе пустая строка.",
    "lang — ru или kk: на каком языке пишет клиент. Ответ клиенту не пиши.",
  ]
    .filter(Boolean)
    .join("\n\n");
}

export function botUnderstandSchema(fields: AiField[]) {
  return {
    type: "object",
    properties: {
      fields: extractSchema(fields),
      intents: { type: "array", items: { type: "string", enum: [...BOT_AI_INTENTS] } },
      handoff: { type: "string", enum: [...BOT_AI_HANDOFFS, ""] },
      lang: { type: "string", enum: ["ru", "kk"] },
    },
    required: ["fields", "intents", "handoff", "lang"],
    additionalProperties: false,
  };
}

/** Ответ модели → то, что бот может использовать: поля по правилам формы, известные намерения, язык. */
export function parseBotUnderstanding(fields: AiField[], raw: unknown): BotUnderstanding | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const values = Object.fromEntries(Object.entries(normalizeExtracted(fields, r.fields)).map(([k, v]) => [k, String(v)]));
  const intents = Array.isArray(r.intents) ? BOT_AI_INTENTS.filter((i) => (r.intents as unknown[]).includes(i)) : [];
  const handoff = BOT_AI_HANDOFFS.find((h) => h === r.handoff) ?? null;
  const lang = r.lang === "kk" || r.lang === "ru" ? r.lang : null;
  return { fields: values, intents, handoff, lang };
}

/** Ответ модели без обрамляющих кавычек и подписи «— Менеджер». */
export function cleanReply(text: string): string {
  let t = text.trim();
  const inner = t.slice(1, -1);
  if (/^["«“]/.test(t) && /["»”]$/.test(t) && !/["«»“”]/.test(inner)) t = inner.trim();
  return t.slice(0, 4000);
}
