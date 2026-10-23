import "server-only";
import { sql, type SQL } from "drizzle-orm";
import { phoneKey } from "@/shared/domain/phone";

/**
 * Что искать по телефону во вводе поиска (contacts-d1): полный номер — по последним 10 цифрам, как сравнивают номера
 * везде в CRM (phoneKey: «8 701 123 45 67», «+7 (701) 123-45-67» и «77011234567» — одно и то же); кусок от 4 цифр —
 * подстрокой, и с «8» в начале — ещё и как с «7». Меньше 4 цифр — не телефон.
 */
export function phoneTerms(term: string): { key: string } | { parts: string[] } | null {
  const digits = term.replace(/\D/g, "");
  if (digits.length >= 10) return { key: phoneKey(digits) };
  if (digits.length < 4) return null;
  return { parts: [...new Set([digits, digits.startsWith("8") ? `7${digits.slice(1)}` : digits])] };
}

const digitsOf = (col: unknown) => sql`regexp_replace(coalesce(${col}, ''), '\\D', '', 'g')`;

/** Телефон в колонке (любой формат записи). */
export function phoneMatch(col: unknown, term: string): SQL | undefined {
  const t = phoneTerms(term);
  if (!t) return undefined;
  if ("key" in t) return sql`right(${digitsOf(col)}, 10) = ${t.key}`;
  return sql`(${sql.join(t.parts.map((p) => sql`${digitsOf(col)} like ${`%${p}%`}`), sql` or `)})`;
}

/** Телефон среди дополнительных (массив нормализованных цифр — contacts-6). */
export function extraPhoneMatch(col: unknown, term: string): SQL | undefined {
  const t = phoneTerms(term);
  if (!t) return undefined;
  if ("key" in t) return sql`exists (select 1 from unnest(${col}) p where right(p, 10) = ${t.key})`;
  return sql`exists (select 1 from unnest(${col}) p where ${sql.join(t.parts.map((x) => sql`p like ${`%${x}%`}`), sql` or `)})`;
}

/** Тег (массив) — по части слова, без учёта регистра (deals-3). */
export function tagMatch(col: unknown, term: string): SQL | undefined {
  const t = term.trim().replace(/^#/, "");
  if (t.length < 2) return undefined;
  return sql`exists (select 1 from unnest(${col}) t where t ilike ${`%${t}%`})`;
}
