import "server-only";
import type { LiveFeed, StaffNotifier } from "@/shared/application";
import type { CallSideEffects } from "../application";

/** Уведомления и живое обновление — порты рабочего пространства; спам-лист и правила приходят из других контекстов. */
export const crmCallEffects = (deps: Pick<CallSideEffects, "isBlocked" | "missedRules"> & { notifier: StaffNotifier<"calls.view">; live: LiveFeed }): CallSideEffects => ({
  isBlocked: deps.isBlocked,
  missedRules: deps.missedRules,
  notifyMissed: (assigneeId, n) => deps.notifier.notifyOwnerOr(assigneeId, "calls.view", { kind: "call", ...n }),
  callChanged: () => void deps.live.publish({ type: "call" }),
});
