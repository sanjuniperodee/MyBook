/** Шаблон ответа из готового сообщения: данные конкретного клиента заменяются подстановками, остальной текст не трогаем. */

/** Подстановки, которые понимает CRM в быстрых ответах (shared/domain/templates). */
export const TEMPLATE_VARS = ["{имя}", "{заказ}", "{ссылка}", "{менеджер}", "{повод}", "{дата}", "{получатель}"] as const;

export interface TemplateFacts {
  /** Имя клиента (как в диалоге). */
  name?: string | null;
  /** Имя сотрудника, который пишет. */
  manager?: string | null;
  /** Номер последнего заказа клиента. */
  order?: string | number | null;
  /** Получатель книги из сделки. */
  recipient?: string | null;
}

export interface TemplateDraft {
  title: string;
  text: string;
  /** Что на что заменили: «Айдана» → «{имя}» — показываем человеку, чтобы он видел, что поменялось. */
  replaced: { was: string; with: string }[];
}

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Надёжная часть без модели: известные значения (имя клиента, имя менеджера, номер заказа, получатель) заменяются на
 * подстановки. Слово целиком, без учёта регистра; короткие значения (меньше трёх знаков) не трогаем — «Ай» есть в «Айда».
 */
export function substituteKnown(text: string, facts: TemplateFacts): { text: string; replaced: TemplateDraft["replaced"] } {
  const pairs: [string, string][] = [
    [String(facts.name ?? "").trim(), "{имя}"],
    [String(facts.manager ?? "").trim(), "{менеджер}"],
    [facts.order != null ? String(facts.order).trim() : "", "{заказ}"],
    [String(facts.recipient ?? "").trim(), "{получатель}"],
  ];
  let out = text;
  const replaced: TemplateDraft["replaced"] = [];
  for (const [value, variable] of pairs) {
    if (value.length < 3) continue;
    const re = new RegExp(`(?<![\\p{L}\\p{N}])${esc(value)}(?![\\p{L}\\p{N}])`, "giu");
    if (!re.test(out)) continue;
    out = out.replace(re, variable);
    replaced.push({ was: value, with: variable });
  }
  return { text: out, replaced };
}

/** Название по умолчанию: первые слова текста без подстановок и разметки. */
export function titleFromText(text: string): string {
  const clean = text.replace(/\{[^{}]*\}/g, "").replace(/[*_~]/g, "");
  // Первая «живая» фраза: приветствие из двух слов («добрый день!») название не делает.
  const parts = clean.split(/[.!?\n]+/).map((x) => x.replace(/^[\s,:;—-]+/, "").replace(/\s+/g, " ").trim()).filter(Boolean);
  const phrase = parts.find((x) => x.split(" ").length >= 3) ?? parts[0] ?? "";
  const t = phrase.split(" ").slice(0, 4).join(" ");
  return t.length > 40 ? `${t.slice(0, 39)}…` : t || "Шаблон";
}

export const templateDraftSchema = {
  type: "object",
  properties: {
    title: { type: "string" },
    text: { type: "string" },
    replaced: {
      type: "array",
      items: { type: "object", properties: { was: { type: "string" }, with: { type: "string" } }, required: ["was", "with"], additionalProperties: false },
    },
  },
  required: ["title", "text", "replaced"],
  additionalProperties: false,
} as const;

export function templateDraftPrompt(fieldLabels: string[]): string {
  const vars = [...TEMPLATE_VARS, ...fieldLabels.map((l) => `{${l}}`)].join(", ");
  return [
    "Ты помогаешь менеджеру магазина персональных книг превратить удачное сообщение клиенту в шаблон быстрого ответа.",
    "Тебе дают текст сообщения и известные данные диалога. Верни тот же текст, в котором данные ИМЕННО ЭТОГО клиента или заказа заменены подстановками.",
    `Доступные подстановки (других нет, выдумывать нельзя): ${vars}.`,
    "{имя} — имя клиента, {заказ} — номер заказа, {ссылка} — ссылка на оплату или книгу клиента, {менеджер} — имя сотрудника, {повод} — повод подарка, {дата} — дата события, {получатель} — кому дарят книгу.",
    "Правила:",
    "- Меняй только то, что относится к конкретному клиенту, заказу или ссылке. Цены, сроки, условия, названия тарифов и общие фразы не трогай.",
    "- Если в тексте нет ничего, что стоит заменить, верни текст БЕЗ ИЗМЕНЕНИЙ и пустой список replaced. Это нормальный случай.",
    "- Не переписывай, не сокращай и не улучшай текст; сохрани абзацы, смайлы и форматирование (*жирный*, _курсив_) как есть.",
    "- Уже стоящие в тексте подстановки оставь.",
    "- title — короткое название шаблона до 40 знаков, по смыслу («Как оплатить», «Сроки печати»).",
    "- replaced — список замен: was — что было в тексте, with — подстановка.",
    "Ответ — только JSON по схеме.",
  ].join("\n");
}

/**
 * Разбор ответа модели с защитой: подстановки только из разрешённого списка, текст не должен сильно отличаться от
 * исходного (модель не переписывает его). Не прошло проверку — null, вызывающий берёт надёжный вариант без модели.
 */
export function parseTemplateDraft(raw: unknown, original: string, fieldLabels: string[]): TemplateDraft | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const text = typeof r.text === "string" ? r.text.trim() : "";
  if (!text) return null;
  const allowed = new Set<string>([...TEMPLATE_VARS, ...fieldLabels.map((l) => `{${l}}`)]);
  if ((text.match(/\{[^{}\n]{1,40}\}/g) ?? []).some((v) => !allowed.has(v))) return null;
  // Без подстановок текст должен остаться примерно тем же: длина в пределах 0.6–1.2 от исходной.
  const bare = (s: string) => s.replace(/\{[^{}\n]{1,40}\}/g, "").length;
  const base = original.length;
  if (base && (text.length > base * 1.2 + 20 || bare(text) < bare(original) * 0.6 - 10)) return null;
  const title = typeof r.title === "string" ? r.title.replace(/\s+/g, " ").trim().slice(0, 60) : "";
  const replaced = Array.isArray(r.replaced)
    ? r.replaced
        .map((x) => (x && typeof x === "object" ? { was: String((x as Record<string, unknown>).was ?? "").slice(0, 80), with: String((x as Record<string, unknown>).with ?? "").slice(0, 40) } : null))
        .filter((x): x is { was: string; with: string } => !!x && !!x.was && allowed.has(x.with))
        .slice(0, 8)
    : [];
  return { title: title || titleFromText(text), text: text.slice(0, 2000), replaced };
}
