// Хэши чеков для уже записанных платежей (миграция 0101): npm run receipts:hash            — посчитать и записать
//                                                        npm run receipts:hash -- --dry   — только показать
// Платежи заказов (order_payments.receipt_sha256) и чеки сделок (crm_receipts.sha256) без хэша: файл читается из
// хранилища, SHA-256 содержимого записывается. Новый платёж с тем же чеком после этого не примется. В конце — какие чеки
// уже приложены к нескольким живым платежам (тот же приём, что в заказе №110): их разбирает руководитель.
import { sql } from "drizzle-orm";
import { pool } from "@/shared/infrastructure/db";
import { executor } from "@/shared/infrastructure/database";
import { getFile } from "@/shared/infrastructure/storage";
import { receiptSha256 } from "@/shared/infrastructure/receiptUses";

const dry = process.argv.includes("--dry");

type Row = { id: string; key: string };

async function fill(label: string, rows: Row[], save: (id: string, sha: string) => Promise<unknown>) {
  let done = 0;
  let missing = 0;
  for (const r of rows) {
    let bytes: Buffer;
    try {
      bytes = await getFile(r.key);
    } catch {
      missing++;
      console.warn(`${label}: нет файла ${r.key}`);
      continue;
    }
    if (!dry) await save(r.id, receiptSha256(bytes));
    done++;
  }
  console.log(`${label}: ${dry ? "посчитано бы" : "записано"} ${done} из ${rows.length}${missing ? `, без файла ${missing}` : ""}`);
}

const orderRows = (await executor().execute<Row>(sql`select id, receipt_storage_key as key from order_payments where receipt_storage_key is not null and receipt_sha256 is null`)).rows;
await fill("Платежи заказов", orderRows, (id, sha) => executor().execute(sql`update order_payments set receipt_sha256 = ${sha} where id = ${id}`));

const dealRows = (await executor().execute<Row>(sql`select id, storage_key as key from crm_receipts where sha256 is null`)).rows;
await fill("Чеки сделок", dealRows, (id, sha) => executor().execute(sql`update crm_receipts set sha256 = ${sha} where id = ${id}`));

// Один чек — у нескольких живых платежей: показать, чтобы руководитель разобрал (отменить ошибочный — в карточке заказа).
// «пакет» — разные сделки одного клиента (один перевод за несколько книг, так можно); остальное — как в заказе №110.
const dups = await executor().execute<{ sha: string; uses: string; package: boolean }>(sql`
  with u as (
    select op.receipt_sha256 as sha, o.user_id as client, coalesce((select d.id::text from crm_deals d where d.order_id = o.id limit 1), o.id::text) as purchase,
      'заказ №' || o.number || ': ' || op.amount || ' ₸ от ' || to_char(op.paid_at, 'DD.MM.YYYY') as use
    from order_payments op join orders o on o.id = op.order_id
    where op.receipt_sha256 is not null and op.voided_at is null
    union all
    select r.sha256, d.client_id, d.id::text, 'сделка Д' || d.number || ': ' || p.amount || ' ₸ от ' || to_char(p.paid_at, 'DD.MM.YYYY')
    from crm_receipts r join crm_payments p on p.id = r.payment_id join crm_deals d on d.id = r.deal_id
    where r.sha256 is not null
  )
  select sha, string_agg(use, '; ') as uses, (count(distinct client) = 1 and bool_and(client is not null) and count(distinct purchase) = count(*)) as package
  from u group by sha having count(*) > 1`);
if (dups.rows.length) {
  console.log(`\nЧеки, приложенные к нескольким платежам (${dups.rows.length}):`);
  for (const d of dups.rows) console.log(`- ${d.package ? "[пакет одного клиента] " : ""}${d.uses}`);
} else console.log("\nПовторных чеков среди живых платежей нет.");

await pool.end();
