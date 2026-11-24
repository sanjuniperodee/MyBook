import type { z } from "zod";
import type { CustomField } from "@mybook/contracts";
import type { CrmField } from "@/shared/infrastructure/db/schema";
import type { CustomFieldValues } from "@/shared/domain/customFields";

/** Отказ действия CRM (чужая запись, лимит скидки, заказ уже есть) — 400 с текстом для сотрудника. */
export const refused = (message: string) => Response.json({ error: message, code: "refused" }, { status: 400, headers: { "cache-control": "no-store" } });

/** Свои поля для формы: описание и значение строкой (как в форме сайта). */
export function fieldsOut(defs: CrmField[], values: CustomFieldValues): z.output<typeof CustomField>[] {
  return defs.map((f) => {
    const v = values[f.key];
    const value = v === null || v === undefined ? "" : f.type === "checkbox" ? (v === true ? "true" : "false") : String(v);
    return { key: f.key, label: f.label, type: f.type, options: f.options, value };
  });
}

/**
 * Значения своих полей из API → поля формы сайта (cf_<key>), которые разбирает readFieldValues: флажку нужен
 * cf_<key>__present и "on". Неизвестные ключи пропускаются (их отбросил бы и сайт).
 */
export function fieldsToForm(form: FormData, defs: CrmField[], values: Record<string, string>) {
  for (const f of defs) {
    if (!(f.key in values)) continue;
    const v = values[f.key];
    if (f.type === "checkbox") {
      form.set(`cf_${f.key}__present`, "1");
      if (v === "true") form.set(`cf_${f.key}`, "on");
    } else form.set(`cf_${f.key}`, v);
  }
}
