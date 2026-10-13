"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { OrderingError } from "@/modules/ordering";
import { assertStaff, audit } from "@/server/access";
import { container } from "@/server/container";

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };

/** Ошибки подключения кассира — по-русски, как остальная админка. */
function kaspiError(err: unknown): { ok: false; error: string } {
  if (OrderingError.is(err)) {
    if (err.code === "phoneInvalid") return { ok: false, error: "Укажите номер кассира Kaspi Pay: +7 7XX XXX XX XX" };
    if (err.code === "kaspiNotConnected") return { ok: false, error: "Сначала подключите кассира Kaspi" };
    if (err.code === "kaspiUnavailable") return { ok: false, error: `Kaspi: ${err.message}` };
  }
  throw err;
}

/** Шаг 1: SMS-код на номер кассира Kaspi Pay. */
export async function requestKaspiCodeAction(phone: string): Promise<Result<{ processId: string }>> {
  await assertStaff("settings.manage");
  try {
    const { processId } = await container().ordering.kaspiSetup.requestCode(z.string().max(32).parse(phone));
    return { ok: true, processId };
  } catch (err) {
    return kaspiError(err);
  }
}

/** Шаг 2: код из SMS — сессия кассира сохраняется, оплата через Kaspi включается. */
export async function confirmKaspiCodeAction(processId: string, otp: string): Promise<Result<{ orgName: string }>> {
  const staff = await assertStaff("settings.manage");
  const input = z.object({ processId: z.string().min(1).max(200), otp: z.string().regex(/^\d{4,8}$/, "Код из SMS — 4–8 цифр") }).safeParse({ processId, otp: otp.trim() });
  if (!input.success) return { ok: false, error: input.error.issues[0].message };
  try {
    const { orgName } = await container().ordering.kaspiSetup.confirmCode(input.data.processId, input.data.otp, staff.user.id);
    await audit(staff, "settings.update", "settings", "kaspi", { connected: true, orgName });
    revalidatePath("/admin/settings");
    return { ok: true, orgName };
  } catch (err) {
    return kaspiError(err);
  }
}

export async function setKaspiEnabledAction(enabled: boolean): Promise<Result> {
  const staff = await assertStaff("settings.manage");
  try {
    await container().ordering.kaspiSetup.setEnabled(z.boolean().parse(enabled), staff.user.id);
    await audit(staff, "settings.update", "settings", "kaspi", { enabled });
    revalidatePath("/admin/settings");
    return { ok: true };
  } catch (err) {
    return kaspiError(err);
  }
}

/** Адрес сервиса kaspi-pos-automation; сразу проверяем, отвечает ли он. */
export async function saveKaspiApiUrlAction(apiUrl: string): Promise<Result<{ reachable: boolean }>> {
  const staff = await assertStaff("settings.manage");
  const input = z
    .string()
    .trim()
    .max(300)
    .regex(/^https?:\/\/[^\s]+$/, "Адрес сервиса должен начинаться с http:// или https://")
    .safeParse(apiUrl);
  if (!input.success) return { ok: false, error: input.error.issues[0].message };
  const reachable = await container().ordering.kaspiSetup.setApiUrl(input.data, staff.user.id);
  await audit(staff, "settings.update", "settings", "kaspi", { apiUrl: input.data });
  revalidatePath("/admin/settings");
  return { ok: true, reachable };
}

/** Состояние для карточки: отвечает ли сервис, жива ли сессия кассира. */
export async function kaspiStatusAction() {
  await assertStaff("settings.manage");
  return container().ordering.kaspiSetup.status();
}

/** Отключить кассира: оплата через Kaspi выключается, сессия удаляется (клиентам снова показывается перевод по номеру). */
export async function disconnectKaspiAction(): Promise<Result> {
  const staff = await assertStaff("settings.manage");
  await container().ordering.kaspiSetup.disconnect(staff.user.id);
  await audit(staff, "settings.update", "settings", "kaspi", { connected: false });
  revalidatePath("/admin/settings");
  return { ok: true };
}
