import type { Clock } from "@/shared/application";
import { consoleLogger } from "@/shared/application";
import { AutomationEngine, type SalesGateway } from "./application";
import { appInfo, crmEffects, crmWorkSchedule } from "./infrastructure/adapters";
import { DrizzleRuleRepository, DrizzleSubjectLoader, SqlScheduledSource } from "./infrastructure/persistence";

export { matches, type TriggerContext, type AutomationTrigger } from "./domain";
export type { SalesGateway } from "./application";

/** Публичный фасад контекста «Автоматизации» (цифровая воронка CRM). */
export class AutomationModule {
  readonly engine: AutomationEngine;

  constructor(deps: { clock: Clock; sales: SalesGateway; sendMessage: (conversationId: string, text: string) => Promise<void> }) {
    this.engine = new AutomationEngine(new DrizzleRuleRepository(), new DrizzleSubjectLoader(), crmEffects(deps.sendMessage), deps.sales, crmWorkSchedule, new SqlScheduledSource(), appInfo, deps.clock, consoleLogger("automations"));
  }
}
