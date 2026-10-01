import "server-only";
import { notifyOwnerOr } from "@/modules/workspace";
import { publish } from "@/modules/workspace";
import type { CallSideEffects } from "../application";

/** Уведомления и живое обновление — адаптеры CRM; спам-лист и правила приходят из других контекстов. */
export const crmCallEffects = (deps: Pick<CallSideEffects, "isBlocked" | "missedRules">): CallSideEffects => ({
  ...deps,
  notifyMissed: (assigneeId, n) => notifyOwnerOr(assigneeId, "calls.view", { kind: "call", ...n }),
  callChanged: () => void publish({ type: "call" }),
});
