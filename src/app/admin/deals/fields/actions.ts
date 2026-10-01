"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { container } from "@/server/container";
import { customFieldTypes, WorkspaceError } from "@/modules/workspace";
import { assertStaff, audit } from "@/server/access";

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
  try {
    await container().workspace.fields.save({ id: d.id || null, entity: d.entity, label: d.label, type: d.type, options: d.options });
  } catch (err) {
    if (WorkspaceError.is(err)) return { error: err.message };
    throw err;
  }
  await audit(staff, "settings.update", "field", d.id || null, { label: d.label, entity: d.entity });
  revalidatePath("/admin/deals/fields");
  return { ok: "Сохранено" };
}

/** Поле удаляется из настроек; уже записанные значения остаются в сделках, но больше не показываются. */
export async function deleteFieldAction(id: string) {
  const staff = await assertStaff("settings.manage");
  const f = await container().workspace.fields.delete(z.string().uuid().parse(id));
  if (f) await audit(staff, "settings.update", "field", id, { deleted: f.label });
  revalidatePath("/admin/deals/fields");
}
