"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { and, eq, ne } from "drizzle-orm";
import { z } from "zod";
import { hashPassword, hashToken, requireUser, verifyPassword } from "@/lib/auth";
import { db } from "@/lib/db";
import { sessions, users } from "@/lib/db/schema";
import { clientIp, rateLimit } from "@/lib/rate-limit";

export interface AccountState {
  error?: string;
  ok?: string;
}

export async function updateProfileAction(_: AccountState, form: FormData): Promise<AccountState> {
  const user = await requireUser();
  const parsed = z
    .object({
      name: z.string().trim().min(1, "Укажите имя").max(100),
      phone: z.union([z.literal(""), z.string().trim().regex(/^[+\d][\d\s()-]{9,20}$/, "Проверьте номер телефона")]),
    })
    .safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  await db.update(users).set({ name: parsed.data.name, phone: parsed.data.phone || null }).where(eq(users.id, user.id));
  revalidatePath("/account");
  return { ok: "Данные сохранены" };
}

export async function changePasswordAction(_: AccountState, form: FormData): Promise<AccountState> {
  const user = await requireUser();
  if (!rateLimit(`pwd:${user.id}:${await clientIp()}`, 10, 900_000)) return { error: "Слишком много попыток. Подождите 15 минут." };
  const current = String(form.get("current") ?? "");
  const next = String(form.get("next") ?? "");
  if (next.length < 8) return { error: "Новый пароль — минимум 8 символов" };
  if (!(await verifyPassword(current, user.passwordHash))) return { error: "Текущий пароль указан неверно" };
  await db.update(users).set({ passwordHash: await hashPassword(next) }).where(eq(users.id, user.id));
  // Выходим на всех остальных устройствах, текущая сессия остаётся.
  const token = (await cookies()).get("mb_session")?.value;
  await db.delete(sessions).where(token ? and(eq(sessions.userId, user.id), ne(sessions.id, hashToken(token))) : eq(sessions.userId, user.id));
  return { ok: "Пароль изменён. На других устройствах нужно будет войти заново." };
}
