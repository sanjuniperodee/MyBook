import type { Clock, LiveFeed, SettingsReader, StaffNotifier } from "@/shared/application";
import { CallsService, TelephonyService, WhatsappCallsService, recordingDays, type CallSideEffects, type SalesGateway, type WhatsappCallGateway } from "./application";
import { DrizzleCallQueries, DrizzleCallRepository, clearRecording, crmCallTimeline, drizzleStaff, expiredWhatsappRecordings } from "./infrastructure/persistence";
import { zadarmaProvider, type TelephonySettingKey } from "./infrastructure/zadarma";
import { crmCallEffects } from "./infrastructure/effects";
import { localCallRecordings } from "./infrastructure/recordings";

export { TelephonyError, type CallEvent } from "./domain";
export type { SalesGateway as TelephonySalesGateway, CallSideEffects, WhatsappCallGateway } from "./application";
export { WHATSAPP, WHATSAPP_HEARTBEAT_MS, WHATSAPP_RECORDING_DAYS, WHATSAPP_SILENT_MS, recordingDays } from "./application";

/** Публичный фасад контекста «Телефония»: журнал звонков из АТС, звонки из CRM, веб-телефон, записи, звонки WhatsApp. */
export class TelephonyModule {
  readonly calls: CallsService;
  readonly phone: TelephonyService;
  readonly whatsapp: WhatsappCallsService;
  readonly queries = new DrizzleCallQueries();

  /** Настройки АТС, уведомления о пропущенных и живое обновление журнала — порты рабочего пространства. */
  constructor(
    deps: { clock: Clock; sales: SalesGateway; settings: SettingsReader<TelephonySettingKey>; notifier: StaffNotifier<"calls.view">; live: LiveFeed; whatsapp: WhatsappCallGateway } & Pick<CallSideEffects, "isBlocked" | "missedRules" | "missedChat">,
  ) {
    const repo = new DrizzleCallRepository();
    this.phone = new TelephonyService(zadarmaProvider(deps.settings));
    this.calls = new CallsService(repo, drizzleStaff, deps.sales, crmCallTimeline, crmCallEffects(deps), deps.clock);
    this.whatsapp = new WhatsappCallsService(this.calls, repo, deps.whatsapp, deps.clock, localCallRecordings);
    this.#deps = deps;
  }

  readonly #deps: { clock: Clock; settings: SettingsReader<TelephonySettingKey> };

  /**
   * Уборка записей разговоров WhatsApp старше срока («Интеграции» → «Мессенджеры» → «Звонки WhatsApp», по умолчанию
   * 90 дней, 0 — без срока): файлы удаляются, звонок в журнале остаётся без записи. За проход — до limit звонков.
   */
  async purgeRecordings(limit = 200): Promise<number> {
    const days = recordingDays(await this.#deps.settings.get("calls.recordingDays"));
    if (!days) return 0;
    const before = new Date(this.#deps.clock.now().getTime() - days * 86_400_000);
    let removed = 0;
    for (const id of await expiredWhatsappRecordings(before, limit)) {
      await localCallRecordings.remove(id);
      await clearRecording(id);
      removed++;
    }
    return removed;
  }
}
