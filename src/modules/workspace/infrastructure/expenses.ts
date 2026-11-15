import "server-only";
import { eq } from "drizzle-orm";
import { executor } from "@/shared/infrastructure/database";
import { financeExpenses } from "@/shared/infrastructure/db/schema";

export interface ExpenseInput {
  day: string;
  category: string;
  title: string;
  amount: number;
  quantity: number | null;
  note: string;
}

/**
 * Расходы магазина, кроме рекламы (та — в расходах по каналам маркетинга): запись, правка, удаление. Правила (кто может,
 * что допустимо в полях) — в действиях страницы «Расходы»; здесь только хранение. Удаление возвращает строку — для журнала.
 */
export const expenses = {
  async add(row: ExpenseInput & { createdById: string }): Promise<string> {
    const [r] = await executor().insert(financeExpenses).values(row).returning({ id: financeExpenses.id });
    return r.id;
  },

  /** Несколько расходов разом (вставка из таблицы) — одной командой: либо все, либо ни одного. */
  async addMany(rows: (ExpenseInput & { createdById: string })[]): Promise<number> {
    if (!rows.length) return 0;
    const saved = await executor().insert(financeExpenses).values(rows).returning({ id: financeExpenses.id });
    return saved.length;
  },

  async find(id: string) {
    const [r] = await executor().select().from(financeExpenses).where(eq(financeExpenses.id, id)).limit(1);
    return r ?? null;
  },

  async update(id: string, row: ExpenseInput): Promise<boolean> {
    const saved = await executor().update(financeExpenses).set(row).where(eq(financeExpenses.id, id)).returning({ id: financeExpenses.id });
    return saved.length > 0;
  },

  async remove(id: string) {
    const [r] = await executor()
      .delete(financeExpenses)
      .where(eq(financeExpenses.id, id))
      .returning({ day: financeExpenses.day, category: financeExpenses.category, title: financeExpenses.title, amount: financeExpenses.amount });
    return r ?? null;
  },
};
