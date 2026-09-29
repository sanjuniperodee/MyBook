// Создаёт администратора или выдаёт права существующему пользователю. Работает без TypeScript —
// в том числе внутри Docker-образа: docker compose exec app node scripts/create-admin.mjs email 'пароль'
import bcrypt from "bcryptjs";
import pg from "pg";

const [email, password] = process.argv.slice(2);
if (!email) {
  console.error("Использование: node scripts/create-admin.mjs <email> [пароль]");
  process.exit(1);
}
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL ?? "postgres://mybook:mybook@localhost:5432/mybook" });
try {
  const { rows } = await pool.query("select id from users where lower(email) = lower($1)", [email]);
  if (rows.length) {
    if (password) await pool.query("update users set role = 'admin', password_hash = $2 where id = $1", [rows[0].id, await bcrypt.hash(password, 12)]);
    else await pool.query("update users set role = 'admin' where id = $1", [rows[0].id]);
    console.log(`Пользователь ${email} теперь администратор`);
  } else {
    if (!password || password.length < 8) throw new Error("Для нового пользователя укажите пароль не короче 8 символов");
    await pool.query("insert into users (email, password_hash, name, role) values (lower($1), $2, 'Администратор', 'admin')", [email, await bcrypt.hash(password, 12)]);
    console.log(`Администратор ${email} создан`);
  }
} catch (e) {
  console.error(e.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
