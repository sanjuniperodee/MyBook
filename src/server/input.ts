import "server-only";
import { z } from "zod";
import { HttpError } from "./api";

/**
 * Общие схемы входа для действий и роутов (решение 7): мусор вместо id отсекается до запроса к базе —
 * роут отвечает 400 с текстом, а не 500 от Postgres («invalid input syntax for type uuid»).
 */

/** id сущности (UUID). */
export const uuid = z.string().uuid();

/** Параметр пути роута ([id], [pid]…): не UUID → 400 badRequest. */
export function idParam(value: string): string {
  const parsed = uuid.safeParse(value);
  if (!parsed.success) throw new HttpError(400, "badRequest");
  return parsed.data;
}
