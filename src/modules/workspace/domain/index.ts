import { contextError } from "@/shared/domain";
import type { CustomFieldType } from "@/shared/domain/customFields";
import { normalizeSlug } from "@/shared/domain/slug";

export type FieldEntity = "deal" | "client";

/** message — текст для сотрудника. */
export const WorkspaceError = contextError<"fieldOptions">("workspace", "WorkspaceError");
export type WorkspaceError = InstanceType<typeof WorkspaceError>;

/** Варианты поля-списка: без повторов и пустых, не больше 30, у списка — минимум два. */
export function selectOptions(type: CustomFieldType, raw: string): string[] {
  if (type !== "select") return [];
  // Повторы — без учёта регистра: «Да» и «да» — один вариант, остаётся первый (B12).
  const seen = new Set<string>();
  const options = raw
    .split(/[,\n]/)
    .map((o) => o.trim())
    .filter((o) => o && !seen.has(o.toLowerCase()) && seen.add(o.toLowerCase()))
    .slice(0, 30)
    .map((o) => o.slice(0, 60));
  if (options.length < 2) throw new WorkspaceError("fieldOptions", "У списка должно быть хотя бы 2 варианта (через запятую)");
  return options;
}

/**
 * Ключ поля из названия: латиница через «_»; неизменяемый и уникальный в рамках сущности. ь и ъ не транслитерируются
 * и становятся разделителем («Подъезд» → pod_ezd) — так и оставлено: ключи уже сохранённых полей в БД, и другая
 * транслитерация дала бы новым полям ключи, несовместимые с похожими старыми.
 */
export function fieldKey(label: string, taken: (key: string) => boolean) {
  const base = normalizeSlug(label).replace(/-/g, "_") || "field";
  let key = base;
  for (let i = 2; taken(key); i++) key = `${base.replace(/_\d+$/, "")}_${i}`;
  return key;
}
export * from "./notifyPrefs";
