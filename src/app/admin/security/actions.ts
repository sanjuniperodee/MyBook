"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import QRCode from "qrcode";
import { z } from "zod";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { assertStaff, assertStaffShell, audit, can, ForbiddenError } from "@/lib/crm/rbac";
import { getSetting, saveSettings } from "@/lib/crm/settings";
import { ipAllowed, parseAllowlist } from "@/lib/crm/ip";
import { trustedClientIp, rateLimit } from "@/lib/rate-limit";
import { confirmSetup, disableTwoFactor, regenerateBackupCodes, startSetup, verifySecondFactor } from "@/lib/crm/two-factor";
import { otpauthUrl } from "@/lib/crm/totp";

type Result<T = object> = ({ ok: true } & T) | { ok: false; message: string };

/** Шаг 1: новый секрет и QR-код для приложения. */
export async function startTwoFactorAction(): Promise<Result<{ secret: string; qr: string }>> {
  const staff = await assertStaffShell();
  if (staff.user.totpEnabledAt) return { ok: false, message: "2FA уже включена" };
  const secret = await startSetup(staff.user.id);
  const qr = await QRCode.toDataURL(otpauthUrl(secret, staff.user.email), { margin: 1, width: 220 });
  return { ok: true, secret, qr };
}

/** Шаг 2: код из приложения — включаем 2FA и показываем резервные коды. */
export async function confirmTwoFactorAction(code: string): Promise<Result<{ codes: string[] }>> {
  const staff = await assertStaffShell();
  if (!rateLimit(`2fa-setup:${staff.user.id}`, 10, 600_000)) return { ok: false, message: "Слишком много попыток — подождите 10 минут" };
  const user = await db.query.users.findFirst({ where: eq(users.id, staff.user.id) });
  const codes = user ? await confirmSetup(user, z.string().max(12).parse(code)) : null;
  if (!codes) return { ok: false, message: "Код не подошёл. Проверьте, что время на телефоне точное, и введите свежий код." };
  await audit(staff, "security.2fa_on", "user", staff.user.id);
  revalidatePath("/admin/security");
  return { ok: true, codes };
}

async function checkCode(userId: string, code: string) {
  if (!rateLimit(`2fa-manage:${userId}`, 10, 600_000)) return "Слишком много попыток — подождите 10 минут";
  const user = await db.query.users.findFirst({ where: eq(users.id, userId) });
  if (!user || !(await verifySecondFactor(user, z.string().max(12).parse(code)))) return "Неверный код";
  return null;
}

export async function newBackupCodesAction(code: string): Promise<Result<{ codes: string[] }>> {
  const staff = await assertStaff();
  const err = await checkCode(staff.user.id, code);
  if (err) return { ok: false, message: err };
  const codes = await regenerateBackupCodes(staff.user.id);
  await audit(staff, "security.2fa_backup", "user", staff.user.id);
  return { ok: true, codes };
}

export async function disableTwoFactorAction(code: string): Promise<Result> {
  const staff = await assertStaff();
  if ((await getSetting("security.require2fa")) === "on" && !staff.isOwner) return { ok: false, message: "Руководитель сделал 2FA обязательной — отключить её нельзя" };
  const err = await checkCode(staff.user.id, code);
  if (err) return { ok: false, message: err };
  await disableTwoFactor(staff.user.id);
  await audit(staff, "security.2fa_off", "user", staff.user.id);
  revalidatePath("/admin/security");
  return { ok: true };
}

/** Сотрудник потерял телефон и резервные коды — руководитель сбрасывает ему 2FA. */
export async function resetStaffTwoFactorAction(userId: string): Promise<Result> {
  const staff = await assertStaff("team.manage");
  const id = z.string().uuid().parse(userId);
  if (id === staff.user.id) return { ok: false, message: "Свою 2FA отключайте в блоке выше" };
  const target = await db.query.users.findFirst({ where: eq(users.id, id), columns: { role: true } });
  if (target?.role !== "admin") return { ok: false, message: "Сотрудник не найден" };
  await disableTwoFactor(id);
  await audit(staff, "security.2fa_reset", "user", id);
  revalidatePath("/admin/security");
  return { ok: true };
}

export async function saveSecurityAction(_: { ok?: string; error?: string }, form: FormData): Promise<{ ok?: string; error?: string }> {
  const staff = await assertStaff("settings.manage");
  if (!can(staff, "team.manage")) throw new ForbiddenError();
  const text = String(form.get("ipAllowlist") ?? "").slice(0, 4000);
  const { rules, invalid } = parseAllowlist(text);
  if (invalid.length) return { error: `Не похоже на IP-адрес или подсеть: ${invalid.slice(0, 3).join(", ")}` };
  const ip = await trustedClientIp();
  // Защита от самоблокировки: сохранить список без своего текущего адреса нельзя.
  if (rules.length && !ipAllowed(ip, rules)) return { error: `Ваш текущий адрес ${ip} не входит в список — после сохранения вы потеряете доступ к CRM. Добавьте его.` };
  const require2fa = form.get("require2fa") === "on";
  if (require2fa && !staff.user.totpEnabledAt) return { error: "Сначала включите 2FA себе — иначе после сохранения вы сами не сможете работать." };
  await saveSettings({ "security.ipAllowlist": rules.map((r) => r.raw).join("\n"), "security.require2fa": require2fa ? "on" : "off" }, staff.user.id);
  await audit(staff, "settings.update", "settings", "security", { require2fa, ipRules: rules.length });
  revalidatePath("/admin/security");
  return { ok: "Сохранено" };
}
