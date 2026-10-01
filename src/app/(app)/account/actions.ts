"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser, sessionToken } from "@/server/auth";
import { container } from "@/server/container";
import { IdentityError } from "@/modules/identity";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { getMessages } from "@/i18n/server";

export interface AccountState {
  error?: string;
  ok?: string;
}

export async function updateProfileAction(_: AccountState, form: FormData): Promise<AccountState> {
  const user = await requireUser();
  const t = (await getMessages()).orders.account;
  const parsed = z
    .object({
      name: z.string().trim().min(1, t.errors.name).max(100),
      phone: z.union([z.literal(""), z.string().trim().regex(/^[+\d][\d\s()-]{9,20}$/, t.errors.phone)]),
    })
    .safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  await container().identity.accounts.updateProfile(user.id, parsed.data.name, parsed.data.phone || null);
  revalidatePath("/account");
  return { ok: t.saved };
}

export async function changePasswordAction(_: AccountState, form: FormData): Promise<AccountState> {
  const user = await requireUser();
  const t = (await getMessages()).orders.account;
  if (!rateLimit(`pwd:${user.id}:${await clientIp()}`, 10, 900_000)) return { error: t.errors.tooMany };
  try {
    // Выходим на всех остальных устройствах, текущая сессия остаётся.
    await container().identity.accounts.changePassword(user.id, String(form.get("current") ?? ""), String(form.get("next") ?? ""), await sessionToken());
  } catch (err) {
    if (err instanceof IdentityError) return { error: err.code === "password" ? t.errors.short : t.errors.wrong };
    throw err;
  }
  return { ok: t.changed };
}
