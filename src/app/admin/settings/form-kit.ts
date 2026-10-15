import "server-only";
import { fromEnv, type SettingKey } from "@/modules/workspace";

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
