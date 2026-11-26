import "server-only";
import { notFound } from "next/navigation";
import { z } from "zod";
import { admin } from "@/i18n/admin";

/** Общие схемы входа страниц и действий веба (то же, что src/server/input.ts бэкенда, без ошибок HTTP-маршрутов). */
export const uuid = z.string().uuid();

/** id из адреса страницы ([id]): не UUID — 404, как у несуществующей записи. */
export function pageId(value: string): string {
  if (!uuid.safeParse(value).success) notFound();
  return value;
}

/** Текстовое поле формы: нет поля — пустая строка; файл вместо текста — ошибка. */
export const formText = z.string().default("");

/** Поля FormData как объект — для z.object(...).safeParse. */
export const formObject = (form: FormData) => Object.fromEntries(form);

/** Форма только из текстовых полей: файл вместо текста — ошибка. */
export const textForm = (form: FormData) => z.record(z.string(), z.string()).safeParse(formObject(form));

/** Текст ошибки для подменённой формы — админка, по-русски. */
export const BAD_FORM = admin.badForm;
