import type { Clock, CustomFieldsReader, SettingsReader, StaffNotifier, WorkSchedule } from "@/shared/application";
import { consoleLogger } from "@/shared/application";
import { AutomationEngine, type AutomationEffects, type SalesGateway } from "./application";
import { appInfo, crmEffects, settingsHolidays, type AutomationSettingKey } from "./infrastructure/adapters";
import { DrizzleRuleRepository, DrizzleSubjectLoader, SqlScheduledSource } from "./infrastructure/persistence";
import { rulesAdmin } from "./infrastructure/admin";

export type { TriggerContext, AutomationTrigger, Holiday } from "./domain";
export { DEFAULT_HOLIDAYS, HOLIDAYS_MAX, holidayIdFor, holidaysError, parseHolidays, runStatusLabels, stepResultLabels, RUNS_LIST_LIMIT, type RunStatus, type RunStep } from "./domain";
export type { RetryResult } from "./application";
export type { SalesGateway } from "./application";
export type { AutomationSettingKey } from "./infrastructure/adapters";

/** Публичный фасад контекста «Автоматизации» (цифровая воронка CRM). */
export class AutomationModule {
  readonly engine: AutomationEngine;
  readonly rules = rulesAdmin;

  /**
   * Задачи и записи в истории сделки — контекст Clients; уведомления сотрудникам, график работы, свои поля сделки и
   * список праздников — порты рабочего пространства.
   */
  constructor(
    deps: {
      clock: Clock;
      sales: SalesGateway;
      createTask: AutomationEffects["createTask"];
      sendMessage: AutomationEffects["sendMessage"];
      canMessageNow: AutomationEffects["canMessageNow"];
      addNote: AutomationEffects["addNote"];
      whatsappStaff?: AutomationEffects["whatsappStaff"];
      notifier: StaffNotifier<"deals.view" | "team.manage">;
      schedule: WorkSchedule;
      fields: CustomFieldsReader;
      settings: SettingsReader<AutomationSettingKey>;
    },
  ) {
    const effects = crmEffects(deps, deps.notifier);
    this.engine = new AutomationEngine(
      new DrizzleRuleRepository(),
      new DrizzleSubjectLoader(deps.fields),
      effects,
      deps.sales,
      deps.schedule,
      new SqlScheduledSource(),
      appInfo,
      deps.clock,
      consoleLogger("automations"),
      settingsHolidays(deps.settings),
    );
  }
}
