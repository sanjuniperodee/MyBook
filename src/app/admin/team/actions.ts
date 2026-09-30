"use server";

import { revalidatePath } from "next/cache";
import { randomBytes } from "node:crypto";
import { and, eq, isNull, ne, or, sql } from "drizzle-orm";
import { z } from "zod";
import { hashPassword } from "@/lib/auth";
import { db } from "@/lib/db";
import { crmRoles, sessions, users } from "@/lib/db/schema";
import { assertStaff, audit, type Staff } from "@/lib/crm/rbac";
import { isPermission } from "@/lib/crm/permissions";

export interface TeamState {
  error?: string;
  ok?: string;
}

const generatePassword = () => randomBytes(9).toString("base64url");

function revalidateTeam() {
  revalidatePath("/admin/team");
  revalidatePath("/admin/team/roles");
}

/** Роль «Руководитель» (системная). */
async function ownerRoleId() {
  const r = await db.query.crmRoles.findFirst({ where: eq(crmRoles.key, "owner"), columns: { id: true } });
  return r?.id ?? null;
}

/** Сколько активных руководителей останется, если исключить userId. Нельзя остаться без руководителя. */
async function activeOwnersExcept(userId: string) {
  const owner = await ownerRoleId();
  const [{ n }] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(users)
    .where(and(eq(users.role, "admin"), eq(users.staffDisabled, false), ne(users.id, userId), owner ? or(isNull(users.crmRoleId), eq(users.crmRoleId, owner)) : isNull(users.crmRoleId)));
  return n;
}

async function isOwnerUser(u: { crmRoleId: string | null }) {
  return !u.crmRoleId || u.crmRoleId === (await ownerRoleId());
}

const extensionSchema = z
  .string()
  .trim()
  .max(10)
  .regex(/^\d*$/, "Внутренний номер — только цифры")
  .transform((v) => v || null);

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
  const { email, name, roleId, extension } = parsed.data;
  if (parsed.data.password && parsed.data.password.length < 8) return { error: "Пароль — минимум 8 символов" };
  const role = await db.query.crmRoles.findFirst({ where: eq(crmRoles.id, roleId) });
  if (!role) return { error: "Роль не найдена" };
  // Выдать роль руководителя может только руководитель.
  if (role.key === "owner" && !staff.isOwner) return { error: "Назначить руководителя может только руководитель" };

  const existing = await db.query.users.findFirst({ where: sql`lower(${users.email}) = ${email}` });
  if (existing) {
    if (existing.id === staff.user.id) return { error: "Свою роль меняет другой руководитель" };
    const password = parsed.data.password || null;
    await db
      .update(users)
      .set({ role: "admin", crmRoleId: roleId, sipExtension: extension, staffDisabled: false, ...(password ? { passwordHash: await hashPassword(password) } : {}) })
      .where(eq(users.id, existing.id));
    if (password) await db.delete(sessions).where(eq(sessions.userId, existing.id));
    await audit(staff, "staff.grant", "user", existing.id, { role: role.name });
    revalidateTeam();
    return { ok: `${email} теперь в команде: ${role.name}${password ? `. Новый пароль: ${password}` : ""}` };
  }
  const password = parsed.data.password || generatePassword();
  const [u] = await db
    .insert(users)
    .values({ email, name: name || email.split("@")[0], passwordHash: await hashPassword(password), role: "admin", crmRoleId: roleId, sipExtension: extension })
    .returning({ id: users.id });
  await audit(staff, "staff.create", "user", u.id, { role: role.name });
  revalidateTeam();
  return { ok: `Сотрудник добавлен. Логин: ${email} · Пароль: ${password} (показан один раз)` };
}

async function loadMember(staff: Staff, userId: string) {
  const id = z.string().uuid().parse(userId);
  const u = await db.query.users.findFirst({ where: eq(users.id, id) });
  if (!u || u.role !== "admin") throw new Error("Сотрудник не найден");
  if (u.id === staff.user.id) throw new Error("Свои доступы меняет другой руководитель");
  if ((await isOwnerUser(u)) && !staff.isOwner) throw new Error("Менять доступы руководителя может только руководитель");
  return u;
}

export async function setStaffRoleAction(userId: string, roleId: string) {
  const staff = await assertStaff("team.manage");
  const u = await loadMember(staff, userId);
  const role = await db.query.crmRoles.findFirst({ where: eq(crmRoles.id, z.string().uuid().parse(roleId)) });
  if (!role) throw new Error("Роль не найдена");
  if (role.key === "owner" && !staff.isOwner) throw new Error("Назначить руководителя может только руководитель");
  if ((await isOwnerUser(u)) && role.key !== "owner" && (await activeOwnersExcept(u.id)) === 0) throw new Error("Должен остаться хотя бы один руководитель");
  await db.update(users).set({ crmRoleId: role.id }).where(eq(users.id, u.id));
  await audit(staff, "staff.role", "user", u.id, { role: role.name });
  revalidateTeam();
}

export async function setStaffExtensionAction(userId: string, extension: string) {
  const staff = await assertStaff("team.manage");
  const id = z.string().uuid().parse(userId);
  const ext = extensionSchema.parse(extension);
  if (ext) {
    const taken = await db.query.users.findFirst({ where: and(eq(users.sipExtension, ext), ne(users.id, id)), columns: { email: true } });
    if (taken) throw new Error(`Номер ${ext} уже у ${taken.email}`);
  }
  await db.update(users).set({ sipExtension: ext }).where(and(eq(users.id, id), eq(users.role, "admin")));
  await audit(staff, "staff.extension", "user", id, { extension: ext });
  revalidateTeam();
}

export async function setStaffDisabledAction(userId: string, disabled: boolean) {
  const staff = await assertStaff("team.manage");
  const u = await loadMember(staff, userId);
  if (disabled && (await isOwnerUser(u)) && (await activeOwnersExcept(u.id)) === 0) throw new Error("Должен остаться хотя бы один руководитель");
  await db.update(users).set({ staffDisabled: disabled }).where(eq(users.id, u.id));
  // Отключённого сразу выкидываем из всех сессий.
  if (disabled) await db.delete(sessions).where(eq(sessions.userId, u.id));
  await audit(staff, disabled ? "staff.disable" : "staff.enable", "user", u.id);
  revalidateTeam();
}

/** Забрать доступ к CRM: аккаунт становится обычным клиентским. */
export async function revokeStaffAction(userId: string) {
  const staff = await assertStaff("team.manage");
  const u = await loadMember(staff, userId);
  if ((await isOwnerUser(u)) && (await activeOwnersExcept(u.id)) === 0) throw new Error("Должен остаться хотя бы один руководитель");
  await db.update(users).set({ role: "user", crmRoleId: null, sipExtension: null, staffDisabled: false }).where(eq(users.id, u.id));
  await db.delete(sessions).where(eq(sessions.userId, u.id));
  await audit(staff, "staff.revoke", "user", u.id);
  revalidateTeam();
}

export async function resetStaffPasswordAction(userId: string): Promise<{ ok: boolean; message: string }> {
  const staff = await assertStaff("team.manage");
  try {
    const u = await loadMember(staff, userId);
    const password = generatePassword();
    await db.update(users).set({ passwordHash: await hashPassword(password) }).where(eq(users.id, u.id));
    await db.delete(sessions).where(eq(sessions.userId, u.id));
    await audit(staff, "password.reset", "user", u.id);
    return { ok: true, message: `Новый пароль для ${u.email}: ${password}` };
  } catch (e) {
    return { ok: false, message: (e as Error).message };
  }
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
  const permissions = form.getAll("permissions").map(String).filter(isPermission);
  const { id, name, scope } = parsed.data;
  if (id) {
    const role = await db.query.crmRoles.findFirst({ where: eq(crmRoles.id, id) });
    if (!role) return { error: "Роль не найдена" };
    if (role.key === "owner") return { error: "У руководителя всегда все права" };
    // Нельзя лишить себя управления командой (иначе некому будет вернуть доступ).
    if (staff.user.crmRoleId === role.id && !permissions.includes("team.manage")) return { error: "Нельзя убрать у своей роли право управлять командой" };
    await db.update(crmRoles).set({ name, scope, permissions }).where(eq(crmRoles.id, id));
    await audit(staff, "role.update", "role", id, { name, scope, permissions });
  } else {
    const [r] = await db.insert(crmRoles).values({ name, scope, permissions }).returning({ id: crmRoles.id });
    await audit(staff, "role.create", "role", r.id, { name, scope, permissions });
  }
  revalidateTeam();
  return { ok: "Роль сохранена" };
}

export async function deleteRoleAction(roleId: string) {
  const staff = await assertStaff("team.manage");
  const role = await db.query.crmRoles.findFirst({ where: eq(crmRoles.id, z.string().uuid().parse(roleId)) });
  if (!role) return;
  if (role.key) throw new Error("Системную роль удалить нельзя");
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(users).where(eq(users.crmRoleId, role.id));
  if (n) throw new Error(`Роль назначена сотрудникам (${n}). Сначала смените им роль.`);
  await db.delete(crmRoles).where(eq(crmRoles.id, role.id));
  await audit(staff, "role.delete", "role", role.id, { name: role.name });
  revalidateTeam();
}

