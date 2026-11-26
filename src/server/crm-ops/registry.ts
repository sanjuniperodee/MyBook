import "server-only";
import { HttpError } from "@/server/api";
import { assertStaff, assertStaffShell } from "@/server/access";
import type { CrmOp } from "./op";
import type { z } from "zod";

/**
 * Реестр сборщиков данных страниц CRM по областям (ADR 0012, A5 — Раздел 5): имя `<область>.<операция>`, область
 * грузится по требованию. Операции не меняют данные (при PARITY_MODE=shadow их зовут дважды).
 */
const areas = {
} as const;

type Areas = { [K in keyof typeof areas]: Awaited<ReturnType<(typeof areas)[K]>> };
type UnionToIntersection<U> = (U extends unknown ? (x: U) => void : never) extends (x: infer I) => void ? I : never;
export type CrmReads = UnionToIntersection<Areas[keyof Areas]["reads"]>;
export type OpInput<D> = D extends CrmOp<infer S, unknown> ? z.input<S> : never;
export type OpOutput<D> = D extends CrmOp<z.ZodType, infer O> ? O : never;

/** Сборщик данных страницы: права сотрудника, схема входа, код операции. */
export async function runCrmOp(name: string, args: unknown): Promise<unknown> {
  const area = name.slice(0, name.indexOf("."));
  const loaders: Record<string, () => Promise<unknown>> = areas;
  const load = Object.hasOwn(loaders, area) ? loaders[area] : undefined;
  if (!load) throw new HttpError(404, "notFound");
  const table = ((await load()) as { reads: Record<string, CrmOp> }).reads;
  const def = Object.hasOwn(table, name) ? table[name] : undefined;
  if (!def) throw new HttpError(404, "notFound");
  const staff = def.guard === "shell" ? await assertStaffShell() : await assertStaff(...def.guard);
  const parsed = def.input.safeParse(args);
  if (!parsed.success) throw new HttpError(400, "badRequest");
  return def.run(parsed.data, staff);
}
