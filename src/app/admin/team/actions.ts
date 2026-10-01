"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { crmPlans } from "@/lib/db/schema";
import { assertStaff, audit } from "@/server/access";
import { AccessError } from "@/modules/access";
import { IdentityError } from "@/modules/identity";
import { container } from "@/server/container";

export interface TeamState {
  error?: string;
  ok?: string;
}

function revalidateTeam() {
  revalidatePath("/admin/team");
  revalidatePath("/admin/team/roles");
}

const extensionSchema = z
  .string()
  .trim()
  .max(10)
  .regex(/^\d*$/, "Внутренний номер — только цифры")
  .transform((v) => v || null);

/** Нарушение правил доступа — текстом для руководителя, остальное пробрасываем. */
async function run<T>(fn: () => Promise<T>): Promise<{ ok: true; value: T } | { ok: false; error: string }> {
  try {
    return { ok: true, value: await fn() };
  } catch (err) {
    if (err instanceof AccessError || err instanceof IdentityError) return { ok: false, error: err.message };
    throw err;
  }
}

async function orThrow<T>(fn: () => Promise<T>): Promise<T> {
  const r = await run(fn);
  if (!r.ok) throw new Error(r.error);
  return r.value;
}

const team = () => container().access.team;

export async function createStaffAction(_: TeamState, form: FormData): Promise<TeamState> {
  const staff = await assertStaff("team.manage");
  const parsed = z
    .object({
      email: z.string().trim().toLowerCase().email("Проверьте адрес почты").max(200),
      name: z.string().trim().max(100).default(""),
      password: z.string().max(200).default(""),
      roleId: z.string().uuid("Выберите роль"),
      extension: extensionSchema.default(""),
    })
    .safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const r = await run(() => team().add(staff.context, parsed.data));
  if (!r.ok) return { error: r.error };
  revalidateTeam();
  return { ok: r.value };
}

export async function setStaffRoleAction(userId: string, roleId: string) {
  const staff = await assertStaff("team.manage");
  await orThrow(() => team().changeRole(staff.context, z.string().uuid().parse(userId), z.string().uuid().parse(roleId)));
  revalidateTeam();
}

export async function setStaffExtensionAction(userId: string, extension: string) {
  const staff = await assertStaff("team.manage");
  await orThrow(() => team().setExtension(staff.context, z.string().uuid().parse(userId), extensionSchema.parse(extension)));
  revalidateTeam();
}

export async function setStaffDisabledAction(userId: string, disabled: boolean) {
  const staff = await assertStaff("team.manage");
  await orThrow(() => team().setDisabled(staff.context, z.string().uuid().parse(userId), disabled));
  revalidateTeam();
}

/** Забрать доступ к CRM: аккаунт становится обычным клиентским. */
export async function revokeStaffAction(userId: string) {
  const staff = await assertStaff("team.manage");
  await orThrow(() => team().revoke(staff.context, z.string().uuid().parse(userId)));
  revalidateTeam();
}

export async function resetStaffPasswordAction(userId: string): Promise<{ ok: boolean; message: string }> {
  const staff = await assertStaff("team.manage");
  const r = await run(() => team().resetPassword(staff.context, z.string().uuid().parse(userId)));
  return r.ok ? { ok: true, message: r.value } : { ok: false, message: r.error };
}

// ─── роли ────────────────────────────────────────────────────────────────────

export async function saveRoleAction(_: TeamState, form: FormData): Promise<TeamState> {
  const staff = await assertStaff("team.manage");
  const parsed = z
    .object({
      id: z.string().uuid().optional().or(z.literal("")),
      name: z.string().trim().min(2, "Название роли — хотя бы 2 символа").max(60),
      scope: z.enum(["all", "own"]),
    })
    .safeParse({ id: form.get("id") ?? "", name: form.get("name"), scope: form.get("scope") });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const r = await run(() => container().access.roles.save(staff.context, staff.user.crmRoleId, { id: parsed.data.id || undefined, name: parsed.data.name, scope: parsed.data.scope, permissions: form.getAll("permissions").map(String) }));
  if (!r.ok) return { error: r.error };
  revalidateTeam();
  return { ok: "Роль сохранена" };
}

export async function deleteRoleAction(roleId: string) {
  const staff = await assertStaff("team.manage");
  await orThrow(() => container().access.roles.delete(staff.context, z.string().uuid().parse(roleId)));
  revalidateTeam();
}

/** План продаж сотрудника на месяц. */
export async function savePlanAction(userId: string, month: string, amount: number, deals: number) {
  const staff = await assertStaff("team.manage");
  const id = z.string().uuid().parse(userId);
  const m = z.string().regex(/^\d{4}-\d{2}$/).parse(month);
  const a = z.number().int().min(0).max(1_000_000_000).parse(amount);
  const d = z.number().int().min(0).max(100_000).parse(deals);
  await db
    .insert(crmPlans)
    .values({ userId: id, month: m, amount: a, deals: d })
    .onConflictDoUpdate({ target: [crmPlans.userId, crmPlans.month], set: { amount: a, deals: d, updatedAt: new Date() } });
  await audit(staff, "plan.update", "user", id, { month: m, amount: a, deals: d });
  revalidatePath("/admin/team/plans");
}
