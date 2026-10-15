import "server-only";
import { z } from "zod";
import { admin } from "@/i18n/admin";
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

/** Текстовое поле формы: нет поля — пустая строка (как String(form.get(name) ?? "")); файл вместо текста — ошибка. */
export const formText = z.string().default("");

/** Поля FormData как объект — для z.object(...).safeParse. */
export const formObject = (form: FormData) => Object.fromEntries(form);

/** Форма только из текстовых полей: файл вместо текста — ошибка. Для форм настроек, где поля читаются по одному. */
export const textForm = (form: FormData) => z.record(z.string(), z.string()).safeParse(formObject(form));

/** Текст ошибки для формы, которую подменили (файл вместо текста, поле не того вида) — админка, по-русски. */
export const BAD_FORM = admin.badForm;
