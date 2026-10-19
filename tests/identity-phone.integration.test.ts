import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { db, pool } from "@/shared/infrastructure/db";
import { DrizzleUserRepository } from "@/modules/identity/infrastructure/persistence";

/**
 * Поиск клиента по телефону на настоящем PostgreSQL: номера в базе лежат в разном виде («+7 701 123 45 67», «8701…»).
 * Запуск: INTEGRATION=1 npx vitest run tests/identity-phone.integration.test.ts (база из DATABASE_URL).
 */
const run = process.env.INTEGRATION === "1" ? describe : describe.skip;
const tag = `ph${Date.now()}`;

run("identity: клиенты по телефону (PostgreSQL)", () => {
  const phone = `7${String(Date.now()).slice(-10)}`;
  const pretty = `+${phone[0]} ${phone.slice(1, 4)} ${phone.slice(4, 7)} ${phone.slice(7, 9)} ${phone.slice(9)}`;

  beforeAll(async () => {
    await db.execute(sql`insert into users (email, password_hash, name, phone) values (${tag + "@t.kz"}, 'x', 'Клиент', ${pretty})`);
  });
  afterAll(async () => {
    await db.execute(sql`delete from users where email like ${tag + "%"}`);
    await pool.end();
  });

  it("находит номер, записанный с пробелами и плюсом, — и по цифрам 7…, и по 8…", async () => {
    const repo = new DrizzleUserRepository();
    expect((await repo.findClientsByPhone(phone)).map((u) => u.email)).toEqual([`${tag}@t.kz`]);
    expect((await repo.findClientsByPhone(`8${phone.slice(1)}`)).map((u) => u.email)).toEqual([`${tag}@t.kz`]);
  });
});
