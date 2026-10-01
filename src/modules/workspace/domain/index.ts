import { contextError } from "@/shared/domain";
import { normalizeSlug } from "@/modules/marketing/domain/channels";

export const customFieldTypes = ["text", "number", "date", "select", "checkbox"] as const;
export type CustomFieldType = (typeof customFieldTypes)[number];
export type FieldEntity = "deal" | "client";

/** message — текст для сотрудника. */
export const WorkspaceError = contextError<"fieldOptions">("workspace", "WorkspaceError");
export type WorkspaceError = InstanceType<typeof WorkspaceError>;

/** Варианты поля-списка: без повторов и пустых, не больше 30, у списка — минимум два. */
export function selectOptions(type: CustomFieldType, raw: string): string[] {
  if (type !== "select") return [];
  const options = [...new Set(raw.split(/[,\n]/).map((o) => o.trim()).filter(Boolean))].slice(0, 30).map((o) => o.slice(0, 60));
  if (options.length < 2) throw new WorkspaceError("fieldOptions", "У списка должно быть хотя бы 2 варианта (через запятую)");
  return options;
}

/** Ключ поля из названия: латиница через «_»; неизменяемый и уникальный в рамках сущности. */
export function fieldKey(label: string, taken: (key: string) => boolean) {
  const base = normalizeSlug(label).replace(/-/g, "_") || "field";
  let key = base;
  for (let i = 2; taken(key); i++) key = `${base.replace(/_\d+$/, "")}_${i}`;
  return key;
}
