import "server-only";
import { z } from "zod";
import { fromEnv, type SettingKey } from "@/modules/workspace";
import { BAD_FORM, formObject, formText, textForm } from "@/server/input";

/** Адрес API: пусто или http(s)://… */
export const apiUrl = z.string().refine((v) => !v || /^https?:\/\/[^\s]+$/.test(v), "Адрес API должен начинаться с https://");

/** Название модели AI: пусто или латиница, цифры и . : / - _ @ */
export const modelName = formText.transform((v) => v.trim()).refine((v) => !v || /^[\w.:/@-]{1,100}$/.test(v), "Название модели — латиница, цифры и символы . : / - _");

/** Форма настроек через zod: файл вместо текста — BAD_FORM; иначе первая ошибка схемы. */
export function parseForm<S extends z.ZodType>(schema: S, form: FormData): { data: z.output<S>; error?: undefined } | { error: string } {
  if (!textForm(form).success) return { error: BAD_FORM };
  const parsed = schema.safeParse(formObject(form));
  return parsed.success ? { data: parsed.data } : { error: parsed.error.issues[0].message };
}

/** Пустое поле секрета = «не менять»; чтобы удалить ключ, есть отдельная галочка. */
export function secretValue(form: FormData, name: string, key: SettingKey): Partial<Record<SettingKey, string>> {
  if (fromEnv(key)) return {};
  if (form.get(`${name}Clear`) === "on") return { [key]: "" };
  const v = String(form.get(name) ?? "").trim();
  return v ? { [key]: v } : {};
}

/** Значение настройки, если она не задана переменной окружения (тогда поле в админке только для чтения). */
export function unlessEnv(key: SettingKey, value: string): Partial<Record<SettingKey, string>> {
  return fromEnv(key) ? {} : { [key]: value };
}
