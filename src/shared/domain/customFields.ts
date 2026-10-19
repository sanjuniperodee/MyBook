/** Свои поля сделки и клиента (как в amoCRM): настраиваются в рабочем пространстве CRM, читаются многими модулями. */
export type CustomFieldEntity = "deal" | "client";

/** Типы своих полей: колонка crm_fields.type хранит один из них. */
export const customFieldTypes = ["text", "number", "date", "select", "checkbox"] as const;
export type CustomFieldType = (typeof customFieldTypes)[number];

/** Своё поле: повод, дата события, для кого… */
export interface CustomFieldDef {
  /** Ключ в customFields; не меняется после создания. */
  key: string;
  label: string;
  /** text | number | date | select | checkbox */
  type: string;
  /** Варианты поля-списка. */
  options: string[];
}

/** Значения своих полей по ключам (customFields сделки и клиента). */
export type CustomFieldValues = Record<string, string | number | boolean | null>;

/** «Для кого» → «бабушка Роза»: переменные своих полей для шаблонов ({Для кого}, {Дата события}) — см. fillTemplate. */
export function fieldVars(fields: Pick<CustomFieldDef, "key" | "label" | "type">[], values: CustomFieldValues | null | undefined): Record<string, string> {
  const vars: Record<string, string> = {};
  for (const f of fields) {
    const v = values?.[f.key];
    if (v === undefined || v === null || v === "") continue;
    vars[f.label] = f.type === "date" && typeof v === "string" ? v.split("-").reverse().join(".") : f.type === "checkbox" ? (v ? "да" : "нет") : String(v);
  }
  return vars;
}
