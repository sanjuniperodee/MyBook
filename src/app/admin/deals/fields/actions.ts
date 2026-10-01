"use server";

import { revalidatePath } from "next/cache";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { crmFields, customFieldTypes } from "@/lib/db/schema";
import { assertStaff, audit } from "@/server/access";
import { normalizeSlug } from "@/lib/crm/channels";

export type FieldState = { ok?: string; error?: string };

const schema = z.object({
  id: z.union([z.literal(""), z.string().uuid()]).default(""),
  entity: z.enum(["deal", "client"]),
  label: z.string().trim().min(1, "Название поля").max(40),
  type: z.enum(customFieldTypes),
  options: z.string().max(1000).default(""),
});

export async function saveFieldAction(_: FieldState, form: FormData): Promise<FieldState> {
  const staff = await assertStaff("settings.manage");
  const parsed = schema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const d = parsed.data;
  const options = [...new Set(d.options.split(/[,\n]/).map((o) => o.trim()).filter(Boolean))].slice(0, 30).map((o) => o.slice(0, 60));
  if (d.type === "select" && options.length < 2) return { error: "У списка должно быть хотя бы 2 варианта (через запятую)" };
  if (d.id) {
    await db.update(crmFields).set({ label: d.label, type: d.type, options: d.type === "select" ? options : [], updatedAt: new Date() }).where(eq(crmFields.id, d.id));
  } else {
    let key = normalizeSlug(d.label).replace(/-/g, "_") || "field";
    // Ключ неизменяемый и уникальный в рамках сущности.
    for (let i = 2; await db.query.crmFields.findFirst({ where: and(eq(crmFields.entity, d.entity), eq(crmFields.key, key)), columns: { id: true } }); i++) key = `${key.replace(/_\d+$/, "")}_${i}`;
    const [{ pos }] = await db.select({ pos: sql<number>`coalesce(max(${crmFields.position}), 0)::int` }).from(crmFields).where(eq(crmFields.entity, d.entity));
    await db.insert(crmFields).values({ entity: d.entity, key, label: d.label, type: d.type, options: d.type === "select" ? options : [], position: pos + 1 });
  }
  await audit(staff, "settings.update", "field", d.id || null, { label: d.label, entity: d.entity });
  revalidatePath("/admin/deals/fields");
  return { ok: "Сохранено" };
}

/** Поле удаляется из настроек; уже записанные значения остаются в сделках, но больше не показываются. */
export async function deleteFieldAction(id: string) {
  const staff = await assertStaff("settings.manage");
  const [f] = await db.delete(crmFields).where(eq(crmFields.id, z.string().uuid().parse(id))).returning();
  if (f) await audit(staff, "settings.update", "field", id, { deleted: f.label });
  revalidatePath("/admin/deals/fields");
}
