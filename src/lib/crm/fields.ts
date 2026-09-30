import "server-only";
import { and, asc, eq } from "drizzle-orm";
import { db } from "../db";
import { crmFields, type CrmField, type CustomValues } from "../db/schema";

export async function listFields(entity: "deal" | "client"): Promise<CrmField[]> {
  return db.select().from(crmFields).where(eq(crmFields.entity, entity)).orderBy(asc(crmFields.position), asc(crmFields.createdAt));
}

/** Значения своих полей из формы (поля с именем cf_<key>). Неизвестные ключи и мусор отбрасываются. */
export function readFieldValues(fields: CrmField[], form: FormData, current: CustomValues = {}): CustomValues {
  const out: CustomValues = { ...current };
  for (const f of fields) {
    const name = `cf_${f.key}`;
    if (f.type === "checkbox") {
      if (form.has(`${name}__present`)) out[f.key] = form.get(name) === "on";
      continue;
    }
    if (!form.has(name)) continue;
    const raw = String(form.get(name) ?? "").trim().slice(0, 500);
    if (!raw) {
      delete out[f.key];
      continue;
    }
    if (f.type === "number") {
      const n = Number(raw.replace(",", ".").replace(/\s/g, ""));
      if (Number.isFinite(n)) out[f.key] = n;
    } else if (f.type === "date") {
      if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) out[f.key] = raw;
    } else if (f.type === "select") {
      if (f.options.includes(raw)) out[f.key] = raw;
    } else out[f.key] = raw;
  }
  return out;
}

/** «Для кого» → «бабушка Роза»: переменные своих полей для шаблонов ({Для кого}, {Дата события}). */
export function fieldVars(fields: CrmField[], values: CustomValues | null | undefined): Record<string, string> {
  const vars: Record<string, string> = {};
  for (const f of fields) {
    const v = values?.[f.key];
    if (v === undefined || v === null || v === "") continue;
    vars[f.label] = f.type === "date" && typeof v === "string" ? v.split("-").reverse().join(".") : f.type === "checkbox" ? (v ? "да" : "нет") : String(v);
  }
  return vars;
}

export async function fieldByKey(entity: "deal" | "client", key: string) {
  return (await db.query.crmFields.findFirst({ where: and(eq(crmFields.entity, entity), eq(crmFields.key, key)) })) ?? null;
}
