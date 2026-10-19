"use server";

import { revalidatePath } from "next/cache";
import QRCode from "qrcode";
import { z } from "zod";
import { uuid } from "@/server/input";
import { assertStaff, assertStaffShell, audit, can, ForbiddenError, type Staff } from "@/server/access";
import { container } from "@/server/container";
import { staffActionError } from "@/server/errors";
import { trustedClientIp, rateLimit } from "@/server/rateLimit";
import { AccessError } from "@/modules/access";
import { IdentityError } from "@/modules/identity";
import { BAD_FORM, textForm } from "@/server/input";

type Result<T = object> = ({ ok: true } & T) | { ok: false; message: string };

const code = z.string().max(12);
const identity = () => container().identity.accounts;

/** Ошибка аккаунта или правил доступа — текстом в ответ формы, остальное пробрасываем. */
async function fail(err: unknown): Promise<{ ok: false; message: string }> {
  const message = staffActionError(err, IdentityError, AccessError);
  if (message === null) throw err;
  return { ok: false, message };
}

async function limited(staff: Staff, key: string) {
  return !await rateLimit(`${key}:${staff.user.id}`, 10, 600_000);
}

/** Шаг 1: новый секрет и QR-код для приложения. */
export async function startTwoFactorAction(): Promise<Result<{ secret: string; qr: string }>> {
  const staff = await assertStaffShell();
  try {
    const { secret, otpauthUrl } = await identity().beginTwoFactor(staff.user.id);
    return { ok: true, secret, qr: await QRCode.toDataURL(otpauthUrl, { margin: 1, width: 220 }) };
  } catch (err) {
    return fail(err);
  }
}

/** Шаг 2: код из приложения — включаем 2FA и показываем резервные коды. */
export async function confirmTwoFactorAction(input: string): Promise<Result<{ codes: string[] }>> {
  const staff = await assertStaffShell();
  if (await limited(staff, "2fa-setup")) return { ok: false, message: "Слишком много попыток — подождите 10 минут" };
  try {
    const codes = await identity().confirmTwoFactor(staff.user.id, code.parse(input));
    await audit(staff, "security.2fa_on", "user", staff.user.id);
    revalidatePath("/admin/security");
    return { ok: true, codes };
  } catch (err) {
    return fail(err);
  }
}

export async function newBackupCodesAction(input: string): Promise<Result<{ codes: string[] }>> {
  const staff = await assertStaff();
  if (await limited(staff, "2fa-manage")) return { ok: false, message: "Слишком много попыток — подождите 10 минут" };
  try {
    const codes = await identity().regenerateBackupCodes(staff.user.id, code.parse(input));
    await audit(staff, "security.2fa_backup", "user", staff.user.id);
    return { ok: true, codes };
  } catch (err) {
    return fail(err);
  }
}

export async function disableTwoFactorAction(input: string): Promise<Result> {
  const staff = await assertStaff();
  if ((await container().access.security.load()).require2fa && !staff.isOwner) return { ok: false, message: "Руководитель сделал 2FA обязательной — отключить её нельзя" };
  if (await limited(staff, "2fa-manage")) return { ok: false, message: "Слишком много попыток — подождите 10 минут" };
  try {
    await identity().disableTwoFactor(staff.user.id, code.parse(input));
    await audit(staff, "security.2fa_off", "user", staff.user.id);
    revalidatePath("/admin/security");
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}

/** Сотрудник потерял телефон и резервные коды — руководитель сбрасывает ему 2FA. */
export async function resetStaffTwoFactorAction(userId: string): Promise<Result> {
  const staff = await assertStaff("team.manage");
  try {
    await container().access.team.resetTwoFactor(staff.context, uuid.parse(userId));
    revalidatePath("/admin/security");
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}

export async function saveSecurityAction(_: { ok?: string; error?: string }, form: FormData): Promise<{ ok?: string; error?: string }> {
  const staff = await assertStaff("settings.manage");
  if (!can(staff, "team.manage")) throw new ForbiddenError();
  if (!textForm(form).success) return { error: BAD_FORM };
  try {
    await container().access.security.save(staff.context, {
      allowlist: String(form.get("ipAllowlist") ?? ""),
      require2fa: form.get("require2fa") === "on",
      editorIp: await trustedClientIp(),
      editorHasTwoFactor: !!staff.user.totpEnabledAt,
    });
  } catch (err) {
    const error = staffActionError(err, AccessError);
    if (error === null) throw err;
    return { error };
  }
  revalidatePath("/admin/security");
  return { ok: "Сохранено" };
}
