import type { Clock, LiveFeed, SettingsReader, StaffNotifier } from "@/shared/application";
import { CallsService, TelephonyService, type CallSideEffects, type SalesGateway } from "./application";
import { DrizzleCallQueries, DrizzleCallRepository, crmCallTimeline, drizzleStaff } from "./infrastructure/persistence";
import { zadarmaProvider, type TelephonySettingKey } from "./infrastructure/zadarma";
import { crmCallEffects } from "./infrastructure/effects";

export { TelephonyError, type CallEvent } from "./domain";
export type { SalesGateway as TelephonySalesGateway, CallSideEffects } from "./application";

/** Публичный фасад контекста «Телефония»: журнал звонков из АТС, звонки из CRM, веб-телефон, записи. */
export class TelephonyModule {
  readonly calls: CallsService;
  readonly phone: TelephonyService;
  readonly queries = new DrizzleCallQueries();

  /** Настройки АТС, уведомления о пропущенных и живое обновление журнала — порты рабочего пространства. */
  constructor(
    deps: { clock: Clock; sales: SalesGateway; settings: SettingsReader<TelephonySettingKey>; notifier: StaffNotifier<"calls.view">; live: LiveFeed } & Pick<CallSideEffects, "isBlocked" | "missedRules">,
  ) {
    this.phone = new TelephonyService(zadarmaProvider(deps.settings));
    this.calls = new CallsService(new DrizzleCallRepository(), drizzleStaff, deps.sales, crmCallTimeline, crmCallEffects(deps), deps.clock);
  }
}
