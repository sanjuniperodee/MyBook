// Предпросмотр автописем в WhatsApp (notify.whatsapp): сколько клиентов без почты получили бы каждое письмо прямо
// сейчас, если его включить. Только чтение. npm run lifecycle:dry-run
import { sql } from "drizzle-orm";
import { pool } from "@/shared/infrastructure/db";
import { executor } from "@/shared/infrastructure/database";
import { DrizzleLifecycleSource } from "@/modules/notifications/infrastructure/persistence";
import { draftEmails, DAY } from "@/modules/notifications/domain";
import { isPhoneStubEmail } from "@/shared/domain/phone";

const now = new Date();
const src = new DrizzleLifecycleSource();
const before = (days: number) => new Date(now.getTime() - days * DAY);
const sent = async (userId: string, key: string) =>
  ((await executor().execute<{ n: number }>(sql`select count(*)::int as n from email_log where user_id = ${userId}::uuid and key = ${key}`)).rows[0]?.n ?? 0) > 0;
const hasWhatsapp = async (userId: string) =>
  ((await executor().execute<{ n: number }>(sql`select count(*)::int as n from crm_conversations where client_id = ${userId}::uuid and channel in ('whatsapp', 'wapi')`)).rows[0]?.n ?? 0) > 0;

// Как sendToClient: в последнюю переписку WhatsApp клиента не пишем, если за двое суток писал менеджер, а за сутки — бот,
// правило или уведомление о заказе (recent). Такие письма откладываются до следующих проходов.
const recent = async (userId: string) =>
  ((await executor().execute<{ n: number }>(sql`select count(*)::int as n from crm_messages m
    where m.conversation_id = (select c.id from crm_conversations c where c.client_id = ${userId}::uuid and c.channel in ('whatsapp', 'wapi')
      order by c.last_message_at desc nulls last, c.id desc limit 1)
    and m.direction = 'out' and not m.internal
    and m.created_at >= now() - case when m.source is null then interval '48 hours' else interval '24 hours' end`)).rows[0]?.n ?? 0) > 0;

const counts: Record<string, { n: number; noChat: number; recent: number; sample: string[] }> = {};
const add = async (kind: string, userId: string, label: string) => {
  const c = (counts[kind] ??= { n: 0, noChat: 0, recent: 0, sample: [] });
  if (!(await hasWhatsapp(userId))) return void c.noChat++;
  if (await recent(userId)) return void c.recent++;
  c.n++;
  if (c.sample.length < 8) c.sample.push(label);
};
const touched = new Set<string>();
for (const c of await src.draftCandidates(before(1))) {
  if (!isPhoneStubEmail(c.recipient.email) || touched.has(c.recipient.id)) continue;
  for (const e of draftEmails(c.book, now)) {
    if (await sent(c.recipient.id, e.key)) continue;
    if (e.kind === "deadline" || e.kind === "almost") {
      await add(e.kind, c.recipient.id, `${c.recipient.name ?? ""} · «${c.book.title}»`);
      touched.add(c.recipient.id);
    }
    break;
  }
}
for (const o of await src.unpaidOrders(before(1))) {
  if (!isPhoneStubEmail(o.recipient.email) || (await sent(o.recipient.id, `unpaid:${o.orderId}`))) continue;
  await add("unpaid", o.recipient.id, `№${o.number} ${o.amount} ₸`);
}
for (const o of await src.reviewDue(before(3), before(7))) {
  if (!isPhoneStubEmail(o.recipient.email) || (await sent(o.recipient.id, `review:${o.orderId}`))) continue;
  await add("review", o.recipient.id, `№${o.number}`);
}
for (const [k, v] of Object.entries(counts)) console.log(`${k}: ${v.n} уйдут сейчас; ${v.recent} отложатся — недавно писали; ${v.noChat} без переписки WhatsApp — не уйдут\n  ${v.sample.join("\n  ")}`);
if (!Object.keys(counts).length) console.log("никому");
await pool.end();
