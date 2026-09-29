"use server";

import { and, eq, gt, isNull, sql } from "drizzle-orm";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { passwordResets, sessions, users } from "@/lib/db/schema";
import { createSession, destroySession, hashPassword, hashToken, newToken, safeNextPath, verifyPassword } from "@/lib/auth";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { env } from "@/lib/env";
import { emailLayout, sendMail } from "@/lib/mail";
import { isThemeId } from "@/lib/content/themes";

export interface FormState {
  error?: string;
  ok?: boolean;
  message?: string;
}

const emailSchema = z.string().trim().toLowerCase().email("Проверьте адрес почты").max(200);
const passwordSchema = z.string().min(8, "Пароль — минимум 8 символов").max(200);

function findUserByEmail(email: string) {
  return db.query.users.findFirst({ where: sql`lower(${users.email}) = ${email.toLowerCase()}` });
}

export async function registerAction(_: FormState, form: FormData): Promise<FormState> {
  const parsed = z
    .object({
      name: z.string().trim().min(1, "Как вас зовут?").max(100),
      email: emailSchema,
      password: passwordSchema,
      consent: z.literal("on", { message: "Нужно согласие с условиями" }),
    })
    .safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  if (!rateLimit(`register:${await clientIp()}`, 10, 3600_000)) return { error: "Слишком много попыток. Попробуйте позже." };

  const { name, email, password } = parsed.data;
  if (await findUserByEmail(email)) return { error: "Этот e-mail уже зарегистрирован. Войдите в аккаунт." };
  const [user] = await db
    .insert(users)
    .values({ name, email, passwordHash: await hashPassword(password), role: env.adminEmails.includes(email) ? "admin" : "user" })
    .returning();
  await createSession(user.id);
  const theme = String(form.get("theme") ?? "");
  redirect(isThemeId(theme) ? `/books/new?theme=${theme}` : "/books/new");
}

export async function loginAction(_: FormState, form: FormData): Promise<FormState> {
  const email = emailSchema.safeParse(form.get("email"));
  const password = String(form.get("password") ?? "");
  if (!email.success || !password) return { error: "Введите e-mail и пароль" };
  const ip = await clientIp();
  if (!rateLimit(`login:${ip}`, 30, 900_000) || !rateLimit(`login:${email.data}`, 10, 900_000)) {
    return { error: "Слишком много попыток входа. Подождите 15 минут." };
  }
  const user = await findUserByEmail(email.data);
  if (!user || !(await verifyPassword(password, user.passwordHash))) return { error: "Неверный e-mail или пароль" };
  if (user.role !== "admin" && env.adminEmails.includes(user.email.toLowerCase())) {
    await db.update(users).set({ role: "admin" }).where(eq(users.id, user.id));
  }
  await createSession(user.id);
  redirect(safeNextPath(form.get("next")));
}

export async function logoutAction() {
  await destroySession();
  redirect("/");
}

export async function forgotAction(_: FormState, form: FormData): Promise<FormState> {
  const email = emailSchema.safeParse(form.get("email"));
  if (!email.success) return { error: "Проверьте адрес почты" };
  if (!rateLimit(`forgot:${await clientIp()}`, 5, 3600_000)) return { error: "Слишком много запросов. Попробуйте позже." };
  const user = await findUserByEmail(email.data);
  if (user) {
    const token = newToken();
    await db.insert(passwordResets).values({ id: hashToken(token), userId: user.id, expiresAt: new Date(Date.now() + 3600_000) });
    const url = `${env.appUrl}/reset/${token}`;
    await sendMail(
      user.email,
      "Восстановление пароля",
      emailLayout({
        title: "Восстановление пароля",
        paragraphs: [`Здравствуйте${user.name ? `, ${user.name}` : ""}!`, "Чтобы задать новый пароль, нажмите на кнопку ниже. Ссылка действует 1 час."],
        button: { label: "Задать новый пароль", url },
        footnote: "Если вы не запрашивали восстановление, просто проигнорируйте это письмо.",
      }),
    );
  }
  return { ok: true, message: "Если такой e-mail зарегистрирован, мы отправили на него ссылку для восстановления." };
}

export async function resetAction(_: FormState, form: FormData): Promise<FormState> {
  const token = String(form.get("token") ?? "");
  const password = passwordSchema.safeParse(form.get("password"));
  if (!password.success) return { error: password.error.issues[0].message };
  const [reset] = await db
    .select()
    .from(passwordResets)
    .where(and(eq(passwordResets.id, hashToken(token)), gt(passwordResets.expiresAt, new Date()), isNull(passwordResets.usedAt)))
    .limit(1);
  if (!reset) return { error: "Ссылка устарела или уже использована. Запросите новую." };
  await db.update(users).set({ passwordHash: await hashPassword(password.data) }).where(eq(users.id, reset.userId));
  await db.update(passwordResets).set({ usedAt: new Date() }).where(eq(passwordResets.id, reset.id));
  await db.delete(sessions).where(eq(sessions.userId, reset.userId));
  await createSession(reset.userId);
  redirect("/books");
}
