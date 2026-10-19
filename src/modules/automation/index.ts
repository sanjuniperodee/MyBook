import type { Clock, CustomFieldsReader, StaffNotifier, WorkSchedule } from "@/shared/application";
import { consoleLogger } from "@/shared/application";
import { AutomationEngine, type AutomationEffects, type SalesGateway } from "./application";
import { appInfo, crmEffects } from "./infrastructure/adapters";
import { DrizzleRuleRepository, DrizzleSubjectLoader, SqlScheduledSource } from "./infrastructure/persistence";
import { rulesAdmin } from "./infrastructure/admin";

export type { TriggerContext, AutomationTrigger } from "./domain";
export type { SalesGateway } from "./application";

/** Публичный фасад контекста «Автоматизации» (цифровая воронка CRM). */
export class AutomationModule {
  readonly engine: AutomationEngine;
  readonly rules = rulesAdmin;

  /** Уведомления сотрудникам, график работы и свои поля сделки (переменные шаблонов) — порты рабочего пространства. */
  constructor(
    deps: { clock: Clock; sales: SalesGateway; sendMessage: AutomationEffects["sendMessage"]; canMessageNow: AutomationEffects["canMessageNow"]; notifier: StaffNotifier<"deals.view">; schedule: WorkSchedule; fields: CustomFieldsReader },
  ) {
    const effects = crmEffects(deps.sendMessage, deps.canMessageNow, deps.notifier);
    this.engine = new AutomationEngine(new DrizzleRuleRepository(), new DrizzleSubjectLoader(deps.fields), effects, deps.sales, deps.schedule, new SqlScheduledSource(), appInfo, deps.clock, consoleLogger("automations"));
  }
}
