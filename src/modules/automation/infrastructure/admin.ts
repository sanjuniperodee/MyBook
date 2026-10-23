import "server-only";
import { asc, desc, eq } from "drizzle-orm";
import { crmAutomationRuns, crmAutomations } from "@/shared/infrastructure/db/schema";
import { executor } from "@/shared/infrastructure/database";
import { readRunDetails, relevantConditions, RUNS_LIST_LIMIT, type RuleAction } from "../domain";

/** Настройка правил CRM (раздел «Автоматизации»). */
export const rulesAdmin = {
  list: () => executor().select().from(crmAutomations).orderBy(asc(crmAutomations.createdAt)),
  async find(id: string) {
    const [r] = await executor().select().from(crmAutomations).where(eq(crmAutomations.id, id)).limit(1);
    return r ?? null;
  },
  /** Журнал правила (automation-13): последние срабатывания — по индексу crm_auto_runs_rule_time_idx. */
  async runs(ruleId: string, limit = RUNS_LIST_LIMIT) {
    const rows = await executor()
      .select({ id: crmAutomationRuns.id, subject: crmAutomationRuns.subject, status: crmAutomationRuns.status, details: crmAutomationRuns.details, createdAt: crmAutomationRuns.createdAt })
      .from(crmAutomationRuns)
      .where(eq(crmAutomationRuns.automationId, ruleId))
      .orderBy(desc(crmAutomationRuns.createdAt))
      .limit(limit);
    return rows.map((r) => ({ ...r, details: readRunDetails(r.details) }));
  },
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
