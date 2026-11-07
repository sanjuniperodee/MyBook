import "server-only";
import { and, eq, isNull } from "drizzle-orm";
import { executor } from "@/shared/infrastructure/database";
import { financeIssueResolutions } from "@/shared/infrastructure/db/schema";

export interface FinanceResolutionInput {
  key: string;
  amount: number;
  note: string;
  title: string;
  ref: string;
  client: string;
  href: string | null;
  managerId: string | null;
  resolvedById: string;
}

/**
 * Решения по случаям «Финансы» → «Нужно вернуть или зачесть»: «Отметить решённым» с комментарием и «Отменить решение».
 * Правила (кто, какой случай, сумма совпала) — в действии «Финансов»; здесь только запись. Отмена не удаляет запись.
 */
export const financeResolutions = {
  /** Действующее решение для ключа и суммы уже есть (двойное нажатие) — null. */
  async resolve(r: FinanceResolutionInput): Promise<{ id: string } | null> {
    const rows = await executor()
      .insert(financeIssueResolutions)
      .values({ key: r.key, amount: r.amount, note: r.note, title: r.title, ref: r.ref, client: r.client, href: r.href, managerId: r.managerId, resolvedById: r.resolvedById })
      .onConflictDoNothing()
      .returning({ id: financeIssueResolutions.id });
    return rows[0] ?? null;
  },

  /** Действующее решение по id (отменённое — null). */
  async find(id: string) {
    const [r] = await executor()
      .select()
      .from(financeIssueResolutions)
      .where(and(eq(financeIssueResolutions.id, id), isNull(financeIssueResolutions.undoneAt)))
      .limit(1);
    return r ?? null;
  },

  /** Отменить решение: случай вернётся в очередь, если он ещё в данных. Уже отменённое — null. */
  async undo(id: string, byId: string, at: Date) {
    const [r] = await executor()
      .update(financeIssueResolutions)
      .set({ undoneById: byId, undoneAt: at })
      .where(and(eq(financeIssueResolutions.id, id), isNull(financeIssueResolutions.undoneAt)))
      .returning();
    return r ?? null;
  },
};
