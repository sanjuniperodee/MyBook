import type { Clock, Logger, SettingsReader, StaffNotifier } from "@/shared/application";
import { OpsAlertsService, OpsHealthService } from "./application/OpsHealthService";
import { PulseRecorder } from "./application/PulseRecorder";
import type { OpsSettingKey } from "./application/ports";
import { drizzleOpsAlerts, drizzleOpsFacts, drizzlePulseStore } from "./infrastructure/persistence";

export type { PulsePass } from "./application/PulseRecorder";
export type { OpsSettingKey } from "./application/ports";
export type { OpsSnapshot, OpsStreamView, OpsJobView, OpsMetricView, OpsSignal } from "./domain/health";

/**
 * Публичный фасад контекста «Наблюдаемость»: пульс фоновых заданий (планировщик, сверки, сборка файлов для печати),
 * сводка очередей «Фон и очереди» и уведомление руководителей о потоке в сбое.
 */
export class MonitoringModule {
  readonly pulses: PulseRecorder;
  readonly health: OpsHealthService;
  readonly alerts: OpsAlertsService;

  constructor(deps: { clock: Clock; logger: Logger; settings: SettingsReader<OpsSettingKey>; notifier: StaffNotifier<"settings.manage"> }) {
    this.pulses = new PulseRecorder(drizzlePulseStore, deps.clock, deps.logger);
    this.health = new OpsHealthService(drizzlePulseStore, drizzleOpsFacts, deps.settings, deps.clock);
    this.alerts = new OpsAlertsService(this.health, drizzleOpsAlerts, deps.notifier, deps.clock, deps.logger);
  }
}
