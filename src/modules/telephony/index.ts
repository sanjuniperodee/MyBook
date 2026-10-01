import type { Clock } from "@/shared/application";
import { CallsService, TelephonyService, type CallSideEffects, type SalesGateway } from "./application";
import { DrizzleCallQueries, DrizzleCallRepository, crmCallTimeline, drizzleStaff } from "./infrastructure/persistence";
import { zadarmaProvider } from "./infrastructure/zadarma";
import { crmCallEffects } from "./infrastructure/effects";

export { TelephonyError, type CallEvent } from "./domain";
export type { SalesGateway as TelephonySalesGateway, CallSideEffects } from "./application";

/** Публичный фасад контекста «Телефония»: журнал звонков из АТС, звонки из CRM, веб-телефон, записи. */
export class TelephonyModule {
  readonly calls: CallsService;
  readonly phone = new TelephonyService(zadarmaProvider);
  readonly queries = new DrizzleCallQueries();

  constructor(deps: { clock: Clock; sales: SalesGateway } & Pick<CallSideEffects, "isBlocked" | "missedRules">) {
    this.calls = new CallsService(new DrizzleCallRepository(), drizzleStaff, deps.sales, crmCallTimeline, crmCallEffects(deps), deps.clock);
  }
}
