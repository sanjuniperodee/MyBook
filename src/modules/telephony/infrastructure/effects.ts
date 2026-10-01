import "server-only";
import { notifyOwnerOr } from "@/lib/crm/notify";
import { publish } from "@/lib/crm/realtime";
import type { CallSideEffects } from "../application";

/** Уведомления и живое обновление — адаптеры CRM; спам-лист и правила приходят из других контекстов. */
export const crmCallEffects = (deps: Pick<CallSideEffects, "isBlocked" | "missedRules">): CallSideEffects => ({
  ...deps,
  notifyMissed: (assigneeId, n) => notifyOwnerOr(assigneeId, "calls.view", { kind: "call", ...n }),
  callChanged: () => void publish({ type: "call" }),
});
