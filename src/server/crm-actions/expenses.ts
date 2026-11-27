import { z } from "zod";
import { container } from "@/server/container";
import { assertStaff, audit } from "@/server/access";
import { uuid } from "@/server/input";
import { channels } from "@/shared/domain/channels";
import { expenseCategoryKeys, guessAdChannel } from "@/shared/domain/expenses";
import { zonedDay } from "@/shared/domain/time";

type Result = { ok: true } | { ok: false; error: string };

const day = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Укажите день")
  .refine((d) => {
    const t = Date.parse(`${d}T00:00:00Z`);
    return !Number.isNaN(t) && new Date(t).toISOString().slice(0, 10) === d;
  }, "Такой даты нет")
  // Расход наперёд исказил бы прибыль периода: вносится в день оплаты или позже.
  .refine((d) => d <= zonedDay(new Date()), "Расход — за прошедший день или сегодня");

const expenseSchema = z
  .object({
    category: z.enum(expenseCategoryKeys as [string, ...string[]], { message: "Выберите категорию" }),
    day,
    amount: z.coerce.number().int("Сумма — целым числом").min(1, "Сумма — больше нуля").max(100_000_000, "Слишком большая сумма"),
    title: z.string().trim().max(120).default(""),
    quantity: z
      .union([z.literal(""), z.coerce.number().int("Количество — целым числом").min(1, "Количество — больше нуля").max(100_000)])
      .optional()
      .transform((v) => (v === "" || v === undefined ? null : v)),
    note: z.string().trim().max(200).default(""),
    channel: z.string().optional(),
  })
  .superRefine((v, ctx) => {
    if (v.category === "ads") {
      if (!v.channel || !(v.channel in channels)) ctx.addIssue({ code: "custom", message: "Выберите канал рекламы" });
    } else if (v.title.length < 2) ctx.addIssue({ code: "custom", message: "Назовите расход: что оплатили" });
  });
export type ExpenseFormInput = z.input<typeof expenseSchema>;


/**
 * Реклама записывается в расходы по каналам маркетинга (по ним считаются стоимость заявки и ROMI), всё остальное — в
 * расходы магазина. Название рекламы уходит в заметку записи канала.
 */
async function save(d: z.output<typeof expenseSchema>, createdById: string): Promise<{ id: string; entity: "marketing_spend" | "expense" }> {
  const c = container();
  if (d.category === "ads") {
    const id = await c.marketing.spend.add({ channel: d.channel!, day: d.day, amount: d.amount, note: [d.title, d.note].filter(Boolean).join(" — ").slice(0, 120), createdById });
    return { id, entity: "marketing_spend" };
  }
  const id = await c.workspace.expenses.add({ day: d.day, category: d.category, title: d.title, amount: d.amount, quantity: d.quantity, note: d.note, createdById });
  return { id, entity: "expense" };
}

/** Новый расход. Право «Вести расходы», запись — в журнал действий. */
export async function addExpenseAction(input: ExpenseFormInput): Promise<Result> {
  const staff = await assertStaff("finance.manage");
  const parsed = expenseSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const saved = await save(parsed.data, staff.user.id);
  await audit(staff, "expense.add", saved.entity, saved.id, { day: parsed.data.day, category: parsed.data.category, amount: parsed.data.amount, title: parsed.data.title });
  return { ok: true };
}

/** Правка расхода магазина (рекламу по каналу не правят — удаляют и вносят заново: у неё другой набор полей). */
export async function updateExpenseAction(id: string, input: ExpenseFormInput): Promise<Result> {
  const staff = await assertStaff("finance.manage");
  const parsed = expenseSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const d = parsed.data;
  if (d.category === "ads") return { ok: false, error: "Рекламу внесите отдельной записью: у неё канал вместо названия" };
  const expenses = container().workspace.expenses;
  const before = await expenses.find(uuid.parse(id));
  if (!before) return { ok: false, error: "Расход уже удалён — обновите страницу" };
  await expenses.update(before.id, { day: d.day, category: d.category, title: d.title, amount: d.amount, quantity: d.quantity, note: d.note });
  await audit(staff, "expense.update", "expense", before.id, { from: { day: before.day, category: before.category, amount: before.amount, title: before.title }, to: { day: d.day, category: d.category, amount: d.amount, title: d.title } });
  return { ok: true };
}

export async function removeExpenseAction(id: string, source: "expense" | "ads"): Promise<Result> {
  const staff = await assertStaff("finance.manage");
  const c = container();
  const key = uuid.parse(id);
  const removed = source === "ads" ? await c.marketing.spend.remove(key) : await c.workspace.expenses.remove(key);
  if (!removed) return { ok: false, error: "Расход уже удалён — обновите страницу" };
  await audit(staff, "expense.delete", source === "ads" ? "marketing_spend" : "expense", key, removed);
  return { ok: true };
}

const importSchema = z
  .array(
    z.object({
      category: z.enum(expenseCategoryKeys as [string, ...string[]]),
      day,
      amount: z.coerce.number().int().min(1).max(100_000_000),
      title: z.string().trim().min(1).max(120),
    }),
  )
  .min(1, "Нет строк для записи")
  .max(300, "За один раз — не больше 300 строк");

/**
 * Несколько расходов разом — список из таблицы, разобранный и проверенный на экране (категорию каждой строки можно
 * поправить). Реклама уходит в расходы по каналам: канал — по названию (TikTok, блогеры, иначе Instagram).
 */
export async function importExpensesAction(rows: z.input<typeof importSchema>): Promise<{ ok: true; count: number } | { ok: false; error: string }> {
  const staff = await assertStaff("finance.manage");
  const parsed = importSchema.safeParse(rows);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message === "Invalid input" ? "В списке есть строка с ошибкой — проверьте дату и сумму" : parsed.error.issues[0].message };
  const c = container();
  const ads = parsed.data.filter((r) => r.category === "ads");
  const rest = parsed.data.filter((r) => r.category !== "ads");
  await c.workspace.expenses.addMany(rest.map((r) => ({ day: r.day, category: r.category, title: r.title, amount: r.amount, quantity: null, note: "", createdById: staff.user.id })));
  for (const r of ads) await c.marketing.spend.add({ channel: guessAdChannel(r.title), day: r.day, amount: r.amount, note: r.title, createdById: staff.user.id });
  await audit(staff, "expense.import", "expense", null, { rows: parsed.data.length, sum: parsed.data.reduce((s, r) => s + r.amount, 0) });
  return { ok: true, count: parsed.data.length };
}
