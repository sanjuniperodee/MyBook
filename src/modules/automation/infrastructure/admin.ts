import "server-only";
import { asc, eq } from "drizzle-orm";
import { crmAutomations } from "@/shared/infrastructure/db/schema";
import { executor } from "@/shared/infrastructure/database";
import { relevantConditions, type RuleAction } from "../domain";

/** Настройка правил CRM (раздел «Автоматизации»). */
export const rulesAdmin = {
  list: () => executor().select().from(crmAutomations).orderBy(asc(crmAutomations.createdAt)),
  async save(input: { id: string | null; name: string; trigger: string; conditions: Parameters<typeof relevantConditions>[1]; actions: RuleAction[]; active: boolean }) {
    // Сохраняем только осмысленные для события условия.
    const values = { name: input.name, trigger: input.trigger, conditions: relevantConditions(input.trigger, input.conditions), actions: input.actions, active: input.active, updatedAt: new Date() };
    if (input.id) await executor().update(crmAutomations).set(values).where(eq(crmAutomations.id, input.id));
    else await executor().insert(crmAutomations).values(values);
  },
  setActive: async (id: string, active: boolean) => void (await executor().update(crmAutomations).set({ active, updatedAt: new Date() }).where(eq(crmAutomations.id, id))),
  async delete(id: string) {
    const [a] = await executor().delete(crmAutomations).where(eq(crmAutomations.id, id)).returning({ name: crmAutomations.name });
    return a ?? null;
  },
};
