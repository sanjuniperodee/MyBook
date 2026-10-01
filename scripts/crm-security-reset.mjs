// Аварийный доступ к CRM: снимает список разрешённых IP и обязательную 2FA,
// а с --email ещё и сбрасывает 2FA сотруднику (потерял телефон и резервные коды).
//   node scripts/crm-security-reset.mjs [--email адрес]
//   docker compose exec app node scripts/crm-security-reset.mjs --email owner@example.com
import pg from "pg";

const args = process.argv.slice(2);
const i = args.indexOf("--email");
const email = i >= 0 ? args[i + 1] : null;
if (i >= 0 && !email) {
  console.error("Использование: node scripts/crm-security-reset.mjs [--email адрес]");
  process.exit(1);
}
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL ?? "postgres://mybook:mybook@localhost:5432/mybook" });
try {
  const { rowCount } = await pool.query("delete from crm_settings where key in ('security.ipAllowlist', 'security.require2fa')");
  console.log(rowCount ? "Ограничения по IP и обязательная 2FA сняты" : "Ограничений по IP и обязательной 2FA не было");
  if (email) {
    const r = await pool.query("update users set totp_secret = null, totp_enabled_at = null, totp_backup = '{}' where lower(email) = lower($1) and role = 'admin' returning id", [email]);
    console.log(r.rowCount ? `2FA сотрудника ${email} сброшена — войдите по паролю` : `Сотрудник ${email} не найден`);
  }
  await pool.query("insert into crm_audit (action, entity, details) values ('security.reset', 'settings', $1)", [JSON.stringify({ email, via: "script" })]).catch(() => {});
  console.log("Изменения применятся в течение 10 секунд (кэш настроек).");
} catch (e) {
  console.error(e.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
