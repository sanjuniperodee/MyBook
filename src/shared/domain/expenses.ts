/**
 * Расходы магазина — общий словарь: категории и их группы для отчёта о прибыли, разбор списка, вставленного из таблицы.
 * Файл без зависимостей: годится серверу (проверка формы), отчётам и интерфейсу.
 *
 * Реклама хранится отдельно — в расходах по каналам (marketing_spend): по ним же считаются стоимость заявки и ROMI,
 * поэтому второй записи не заводим; в списке расходов и в отчёте о прибыли она идёт категорией «Реклама».
 */
export const expenseCategories = {
  ads: "Реклама",
  print: "Печать книг",
  delivery: "Доставка",
  packaging: "Упаковка и расходники",
  fees: "Комиссии банка и рассрочки",
  payroll: "Зарплата и бонусы",
  services: "Сервисы, ИИ и связь",
  equipment: "Оборудование и инвентарь",
  tax: "Налоги",
  other: "Прочее",
} as const;
export type ExpenseCategory = keyof typeof expenseCategories;
export const expenseCategoryKeys = Object.keys(expenseCategories) as ExpenseCategory[];
export const isExpenseCategory = (v: unknown): v is ExpenseCategory => typeof v === "string" && v in expenseCategories;

/** Группы строк отчёта о прибыли: себестоимость → реклама → команда → остальное. */
export const expenseGroups = {
  cogs: "Себестоимость",
  marketing: "Реклама",
  team: "Команда",
  operating: "Прочие расходы",
} as const;
export type ExpenseGroup = keyof typeof expenseGroups;
export const expenseGroupKeys = Object.keys(expenseGroups) as ExpenseGroup[];

const GROUP_OF: Record<ExpenseCategory, ExpenseGroup> = {
  ads: "marketing",
  print: "cogs",
  delivery: "cogs",
  packaging: "cogs",
  fees: "cogs",
  payroll: "team",
  services: "operating",
  equipment: "operating",
  tax: "operating",
  other: "operating",
};
export const expenseGroupOf = (c: string): ExpenseGroup => (isExpenseCategory(c) ? GROUP_OF[c] : "operating");
export const expenseCategoryLabel = (c: string) => (isExpenseCategory(c) ? expenseCategories[c] : expenseCategories.other);

/** Категория по названию расхода из таблицы («таргет 04», «книги», «зп Индира»): первое совпавшее правило. */
const RULES: [RegExp, ExpenseCategory][] = [
  [/таргет|реклам|тикток|tiktok|ads|адс|блогер|инстаграм|instagram|facebook|meta|продвиж/i, "ads"],
  [/книг|печат|типограф|тираж|переплёт|переплет/i, "print"],
  [/доставк|курьер|почт|сдэк|cdek|югс|ugs|индрайв|indrive|яндекс|такси/i, "delivery"],
  [/короб|крафт|упаков|пакет|лент|открытк|бумаг|наклейк|скотч|дтф|dtf|ножниц|расходник/i, "packaging"],
  [/комисси|рассрочк|kaspi|каспи|эквайр|red/i, "fees"],
  [/зп|зарплат|оклад|бонус|преми|аванс|выплат/i, "payroll"],
  [/налог|ипн|соц|опв|осмс/i, "tax"],
  [/ии|ai|gpt|claude|домен|хостинг|сервер|сервис|подписк|связь|интернет|сим|sim|crm|программ/i, "services"],
  [/доск|стол|стул|принтер|ноутбук|телефон|оборудован|техник|мебел|инвентар/i, "equipment"],
];
export function guessExpenseCategory(title: string): ExpenseCategory {
  const t = ` ${title.toLowerCase()} `;
  for (const [re, category] of RULES) if (re.test(t)) return category;
  return "other";
}

/** Канал рекламы по названию: TikTok, блогеры, остальное — Instagram (таргет Meta). */
export function guessAdChannel(title: string): "instagram" | "tiktok" | "bloggers" | "google_ads" | "yandex_ads" {
  const t = title.toLowerCase();
  if (/тикток|tiktok/.test(t)) return "tiktok";
  if (/блогер|ugc/.test(t)) return "bloggers";
  if (/google|гугл/.test(t)) return "google_ads";
  if (/яндекс|yandex|директ/.test(t)) return "yandex_ads";
  return "instagram";
}

export interface ParsedExpense {
  day: string;
  category: ExpenseCategory;
  title: string;
  amount: number;
}
export interface ParsedLine {
  line: number;
  raw: string;
  /** Что не так со строкой (тогда expense нет). */
  error?: string;
  expense?: ParsedExpense;
}

const pad = (n: number) => String(n).padStart(2, "0");

/** Дата в начале или конце строки: 02.11, 02.11.2026, 2026-11-02; год по умолчанию — из defaultDay. */
function takeDay(text: string, defaultDay: string): { day: string; rest: string } | { error: string } {
  const iso = /(?:^|\s)(\d{4})-(\d{2})-(\d{2})(?=\s|$)/.exec(text);
  const dot = /(?:^|\s)(\d{1,2})[./](\d{1,2})(?:[./](\d{2,4}))?(?=\s|$)/.exec(text);
  const m = iso ?? dot;
  if (!m) return { day: defaultDay, rest: text };
  const [y, mo, d] = iso ? [Number(m[1]), Number(m[2]), Number(m[3])] : [m[3] ? (m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3])) : Number(defaultDay.slice(0, 4)), Number(m[2]), Number(m[1])];
  const day = `${y}-${pad(mo)}-${pad(d)}`;
  const t = Date.parse(`${day}T00:00:00Z`);
  if (Number.isNaN(t) || new Date(t).toISOString().slice(0, 10) !== day) return { error: "Такой даты нет" };
  return { day, rest: (text.slice(0, m.index) + " " + text.slice(m.index + m[0].length)).trim() };
}

/**
 * Список расходов, вставленный из таблицы: по строке на расход — «название сумма», можно с датой («02.11 таргет 52 756»,
 * «книги ₸68 000», колонки через табуляцию или «;»). Сумма — последнее число строки; пробелы, «₸», «тг» и копейки
 * отбрасываются. Строка «итого» и пустые пропускаются. Без даты — defaultDay. Категория — по названию.
 */
export function parseExpenseLines(text: string, defaultDay: string): ParsedLine[] {
  const out: ParsedLine[] = [];
  text.split(/\r?\n/).forEach((source, i) => {
    const raw = source.replace(/[\t;|]+/g, " ").replace(/\s+/g, " ").trim();
    if (!raw || /^(итого|всего|название|сумма|total)(\s|$)/i.test(raw)) return;
    const line = i + 1;
    const dated = takeDay(raw, defaultDay);
    if ("error" in dated) return void out.push({ line, raw, error: dated.error });
    // Сумма — последнее число: «₸52 756», «52756 тг», «52 756,00».
    const m = /(?:₸\s*)?(\d{1,3}(?:[  ]\d{3})+|\d+)(?:[.,]\d{1,2})?\s*(?:₸|тг|тенге|kzt)?\s*$/i.exec(dated.rest);
    if (!m) return void out.push({ line, raw, error: "Не нашли сумму — она должна стоять в конце строки" });
    const amount = Number(m[1].replace(/[  ]/g, ""));
    const title = dated.rest.slice(0, m.index).replace(/[₸:—–-]+\s*$/, "").trim();
    if (!title) return void out.push({ line, raw, error: "Нет названия расхода" });
    if (!Number.isFinite(amount) || amount < 1) return void out.push({ line, raw, error: "Сумма — больше нуля" });
    if (amount > 100_000_000) return void out.push({ line, raw, error: "Слишком большая сумма" });
    out.push({ line, raw, expense: { day: dated.day, category: guessExpenseCategory(title), title: title.slice(0, 120), amount } });
  });
  return out;
}
