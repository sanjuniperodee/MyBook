import "server-only";
import type { z } from "zod";
import type { Permission } from "@/shared/domain/permissions";
import type { Staff } from "@/server/access";

/**
 * Операция CRM (ADR 0012, A5 — Раздел 5): кто может звать (права сотрудника или «каркас» — сотрудник, которому
 * осталось настроить 2FA), схема входа и сам код — тот, что раньше стоял в странице или server action. Один и тот же
 * код выполняет сайт с БД и mybook-api, права проверяет registry.runCrmOp до вызова.
 */
export type Guard = readonly Permission[] | "shell";

export interface CrmOp<S extends z.ZodType = z.ZodType, O = unknown> {
  guard: Guard;
  input: S;
  run(input: z.output<S>, staff: Staff): Promise<O>;
}

export function op<S extends z.ZodType, O>(guard: Guard, input: S, run: (input: z.output<S>, staff: Staff) => Promise<O>): CrmOp<S, O> {
  return { guard, input, run };
}
