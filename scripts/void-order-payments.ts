// Отменить ошибочные записи журнала денег заказа по поручению владельца (сверка чеков), как кнопка «Отменить» в заказе:
//   npm run payments:void -- --reason "фиктивная пара: …" <id платежа> [<id> …]          — отменить
//   npm run payments:void -- --dry --reason "…" <id> …                                    — только показать
// Несколько id — записи одного заказа, одной операцией (фиктивная пара «платёж + возврат»): заказ пересчитывается по итогу.
// Записи остаются в журнале с пометкой «отменён» и причиной; в журнал действий — order.payment_void без сотрудника.
import { container } from "../src/server/container";
import { pool } from "@/shared/infrastructure/db";

const args = process.argv.slice(2);
const dry = args.includes("--dry");
const at = args.indexOf("--reason");
const reason = at >= 0 ? (args[at + 1] ?? "") : "";
const ids = args.filter((a, i) => !a.startsWith("--") && i !== at + 1);
if (reason.trim().length < 3 || !ids.length) {
  console.error('нужны --reason "…" и id платежей');
  process.exit(1);
}

const c = container();
const rows = await Promise.all(ids.map((id) => c.ordering.payments.find(id)));
for (const [i, p] of rows.entries()) console.log(p ? `${p.id}: ${p.kind} ${p.amount} ₸, ${p.method}, заказ ${p.orderId}${p.voidedAt ? " — уже отменён" : ""}` : `${ids[i]}: не найден`);
if (!dry) {
  const r = await c.ordering.payments.voidPayment({ paymentId: ids[0], also: ids.slice(1), reason, actor: { label: "сверка чеков по поручению владельца", userId: null } });
  await c.access.audit.record({ actorId: null, action: "order.payment_void", entity: "order", entityId: r.payment.orderId, details: { payments: ids, reason, by: "сверка чеков", received: r.received, reopened: r.reopened } });
  console.log(`отменено: ${ids.length}; получено по заказу ${r.received} ₸${r.reopened ? ", заказ снова ждёт доплату" : ""}`);
}
await pool.end();
