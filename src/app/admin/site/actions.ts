"use server";

import { revalidatePath } from "next/cache";
import { registrationOpen } from "@/config/site";
import { assertStaff, audit } from "@/server/access";
import { ensureCatalog, saveRegistration } from "@/server/catalog";

export interface SiteState {
  error?: string;
  ok?: string;
}

/**
 * Регистрация клиентов на сайте. Закрыта: страница /register объясняет это, кнопки «Создать книгу» и «Зарегистрироваться» скрыты,
 * на лендингах вместо них — вход, новые аккаунты не создаются. Уже зарегистрированные клиенты входят как обычно;
 * менеджеры по-прежнему заводят клиентов вручную (CRM → Клиенты → Новый клиент).
 */
export async function setRegistrationAction(_: SiteState, form: FormData): Promise<SiteState> {
  const staff = await assertStaff("settings.manage");
  await ensureCatalog();
  const open = form.get("registration") === "on";
  const before = registrationOpen();
  await saveRegistration(open, staff.user.id);
  await audit(staff, "site.registration", "settings", "site.registration", { from: before, to: open });
  revalidatePath("/", "layout");
  revalidatePath("/admin/site");
  return { ok: open ? "Регистрация открыта: страница и кнопки снова на сайте." : "Регистрация закрыта: кнопки скрыты, новые аккаунты не создаются." };
}
