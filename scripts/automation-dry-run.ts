// Предпросмотр правил по времени: кого правило возьмёт прямо сейчас, ничего не делая (только чтение).
//   npm run automation:dry-run                — все правила по времени, включённые и выключенные
//   npm run automation:dry-run -- <id|часть названия>  — одно правило
// Показывает число кандидатов (без лимита «в день» — сколько ждёт всего), сколько правило возьмёт за сегодня с учётом
// лимита и первые сделки. Перед включением правила — чтобы первый запуск не завёл лавину задач или сообщений.
import { sql } from "drizzle-orm";
import { pool } from "@/shared/infrastructure/db";
import { executor } from "@/shared/infrastructure/database";
import { getSetting } from "@/modules/workspace/infrastructure/settings";
import { SqlScheduledSource } from "@/modules/automation/infrastructure/persistence";
import {
  anniversaryQuery,
  conditionNumber,
  eventDateQuery,
  HOLIDAY_DEFAULTS,
  HOLIDAY_LIMITS,
  holidayWindows,
  idleQuery,
  parseHolidays,
  silentQuery,
  upcomingHolidays,
  type AutomationRule,
} from "@/modules/automation/domain";
import { zonedDay } from "@/shared/domain/time";

const ALL = 5000;
const filter = process.argv[2]?.trim().toLowerCase() || null;
const src = new SqlScheduledSource();
const now = new Date();
const today = zonedDay(now);

type Row = { id: string; name: string; trigger: string; active: boolean; conditions: AutomationRule["conditions"]; actions: AutomationRule["actions"] };
const { rows } = await pool.query<Row>("select id, name, trigger, active, conditions, actions from crm_automations order by created_at");

async function deals(ids: (string | null)[]) {
  const list = ids.filter((x): x is string => !!x).slice(0, 15);
  const every = ids.filter((x): x is string => !!x);
  if (!list.length) return [];
  const r = await executor().execute<{ number: number; title: string; stage: string; assignee: string | null }>(
    sql`select d.number, d.title, s.name as stage, u.name as assignee from crm_deals d join crm_stages s on s.id = d.stage_id left join users u on u.id = d.assignee_id where d.id in (${sql.join(
      list.map((x) => sql`${x}::uuid`),
      sql`, `,
    )}) order by d.number desc`,
  );
  const spread = await executor().execute<{ stage: string; n: number }>(
    sql`select s.name as stage, count(*)::int as n from crm_deals d join crm_stages s on s.id = d.stage_id where d.id in (${sql.join(
      every.map((x) => sql`${x}::uuid`),
      sql`, `,
    )}) group by s.name, s.position order by s.position`,
  );
  return [`  по этапам: ${spread.rows.map((x) => `${x.stage} ${x.n}`).join(", ")}`, ...r.rows.map((d) => `  Д${d.number} · ${d.title.slice(0, 50)} · ${d.stage} · ${d.assignee ?? "ничья"}`)];
}

for (const rule of rows) {
  if (filter && rule.id !== filter && !rule.name.toLowerCase().includes(filter)) continue;
  const head = `\n■ ${rule.name} [${rule.trigger}] ${rule.active ? "ВКЛ" : "выкл"} ${JSON.stringify(rule.conditions)}`;
  let total: number | null = null;
  let take: number | null = null;
  let sample: string[] = [];
  const fired = await src.firedOn(rule.id, today);
  switch (rule.trigger) {
    case "deal.idle": {
      const q = idleQuery(rule, now);
      const r = await src.idleDeals(rule.id, { before: q.before, stageId: q.stageId, limit: ALL });
      total = r.length;
      take = Math.max(0, Math.min(total, q.perDay - fired));
      sample = await deals(r.map((x) => x.dealId));
      break;
    }
    case "message.silent": {
      const q = silentQuery(rule, now);
      const r = await src.silent(rule.id, { ...q, limit: ALL });
      total = r.length;
      take = Math.max(0, Math.min(total, q.perDay - fired));
      sample = await deals(r.map((x) => x.dealId));
      break;
    }
    case "deal.event_date_near": {
      const r = await src.eventDates(rule.id, eventDateQuery(rule, today));
      total = r.length;
      take = total;
      sample = (await deals(r.map((x) => x.dealId))).concat(r.slice(0, 15).map((x) => `  · ${x.date} ${x.occasion}`));
      break;
    }
    case "occasion.anniversary": {
      const q = anniversaryQuery(rule);
      const r = await src.anniversaries(rule.id, today, q.daysBefore, q.repurchaseDays);
      total = r.length;
      take = total;
      sample = r.slice(0, 15).map((x) => `  ${x.orderId ? "заказ" : "сделка"} · ${x.date} · ${x.occasion} · ${x.recipient ?? ""}`);
      break;
    }
    case "occasion.holiday": {
      const list = parseHolidays(await getSetting("automation.holidays"));
      const daysBefore = conditionNumber(rule, "daysBefore", HOLIDAY_DEFAULTS.daysBefore, HOLIDAY_LIMITS.daysBefore);
      const windowDays = conditionNumber(rule, "windowDays", HOLIDAY_DEFAULTS.windowDays, HOLIDAY_LIMITS.windowDays);
      const perDay = conditionNumber(rule, "perDay", HOLIDAY_DEFAULTS.perDay, HOLIDAY_LIMITS.perDay);
      const upcoming = upcomingHolidays(list, today, daysBefore, rule.conditions?.holiday ? String(rule.conditions.holiday) : null);
      total = 0;
      for (const u of upcoming) {
        const w = holidayWindows(u, windowDays, daysBefore);
        const r = await src.holidayBuyers(rule.id, { holiday: u.holiday, date: u.date, ...w, limit: ALL });
        total += r.length;
        sample.push(`  ${u.holiday.ru} ${u.date}: ${r.length} клиентов (покупки ${w.from}…${w.to}, сезон с ${w.seasonFrom})`);
      }
      if (!upcoming.length) sample.push(`  праздников в ближайшие ${daysBefore} дней нет`);
      take = Math.max(0, Math.min(total, perDay - fired));
      break;
    }
    case "client.inactive": {
      const r = await src.inactiveClients(rule.id, conditionNumber(rule, "days", 5));
      total = r.length;
      take = total;
      sample = await deals(r.map((x) => x.dealId));
      break;
    }
    default:
      continue;
  }
  console.log(head);
  console.log(`  кандидатов сейчас: ${total}; сработало сегодня: ${fired}; возьмёт в этот проход: ${take}`);
  for (const a of rule.actions) console.log(`  действие: ${a.type}${a.text ? ` — «${a.text.slice(0, 120)}…»` : a.title ? ` — «${a.title}»` : ""}`);
  for (const s of sample) console.log(s);
}
await pool.end();
