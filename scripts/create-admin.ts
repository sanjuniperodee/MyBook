/**
 * Создаёт администратора или выдаёт права существующему пользователю.
 * Запуск: npm run create-admin -- admin@example.com 'пароль'
 */
import { sql } from "drizzle-orm";
import { db, pool } from "../src/lib/db";
import { users } from "../src/lib/db/schema";
import { hashPassword } from "../src/lib/auth";

async function main() {
  const [email, password] = process.argv.slice(2);
  if (!email) throw new Error("Использование: npm run create-admin -- <email> [пароль]");
  const existing = await db.query.users.findFirst({ where: sql`lower(${users.email}) = ${email.toLowerCase()}` });
  if (existing) {
    await db.update(users).set({ role: "admin", ...(password ? { passwordHash: await hashPassword(password) } : {}) }).where(sql`${users.id} = ${existing.id}`);
    console.log(`Пользователь ${email} теперь администратор`);
    return;
  }
  if (!password || password.length < 8) throw new Error("Для нового пользователя укажите пароль не короче 8 символов");
  await db.insert(users).values({ email: email.toLowerCase(), passwordHash: await hashPassword(password), name: "Администратор", role: "admin" });
  console.log(`Администратор ${email} создан`);
}

main()
  .catch((e) => {
    console.error(e.message);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
