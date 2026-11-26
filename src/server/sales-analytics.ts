/**
 * «Аналитика продаж» (admin/analytics): загрузка и расчёт — одни для страницы сайта и API v1 (crmAnalytics). Период — как в
 * «Финансах» и «Прибыли», деньги — из того же расчёта (loadProfit); воронка и каналы — по сделкам, созданным за период;
 * скорость ответа людей — в рабочих минутах (бот и правила — отдельно).
 */
import { container } from "@/server/container";
import { mins, num, pct } from "@/lib/crm/numbers";

export { mins, num, pct };
import { loadProfit } from "@/server/money-flow";
import { financePeriod } from "@/modules/reporting/ui/finance-screen";
import { storeTimeZone } from "@/shared/domain/time";
import { currentMonth } from "@/modules/sales";
import { can, type Staff } from "@/server/access";
import { staffLabel } from "@/shared/domain/staff";
import { channelOf, channels, toAttribution } from "@/shared/domain/channels";
import { getSetting } from "@/modules/workspace";
import { parseWorkHours } from "@/shared/domain/schedule";
import { responseStats, type ResponseGroup } from "@/modules/reporting/ui/response-stats";
import { shiftMinutes, slaMinutes, waitLabel } from "@/modules/reporting/ui/response-wait";

type Row = Record<string, unknown>;


export async function loadSalesAnalytics(staff: Staff, q: { p?: string; from?: string; to?: string; pl?: string }) {
  const pipelines = await container().sales.queries.listPipelines();
  const pipeline = pipelines.find((x) => x.id === q.pl) ?? pipelines[0];
  // Период — как в «Финансах» и «Прибыли»: те же пресеты и свои даты, деньги — из того же расчёта.
  const tz = storeTimeZone();
  const period = financePeriod({ preset: q.p, from: q.from, to: q.to, now: new Date(), tz });
  const showProfit = staff.scope === "all" && can(staff, "finance.view");
  const [stages, admins, { totals, prevTotals, bySource, byStage, lost, managers, responses, calls, awaiting, reached, stageTime }, hoursRaw, slaRaw, profit] = await Promise.all([
    container().sales.queries.listStages(pipeline.id),
    container().access.queries.allStaff(),
    container().reporting.salesAnalytics(pipeline.id, { from: period.from, to: period.to, prev: period.prev }),
    getSetting("crm.workHours"),
    getSetting("crm.slaMinutes"),
    loadProfit(period, tz),
  ]);
  const flow = profit.screen.flow;
  // Деньги по менеджерам — те же строки, что в «Финансах» («По менеджерам»): поступления минус возвраты за период.
  const moneyByManager = new Map<string, number>();
  for (const m of profit.data.money) {
    if (m.at < period.from || m.at >= period.to || !m.managerId) continue;
    moneyByManager.set(m.managerId, (moneyByManager.get(m.managerId) ?? 0) + (m.kind === "refund" ? -m.amount : m.amount));
  }
  // Скорость ответа людей в рабочих минутах (analytics-2): бот и правила — отдельно, заметки — не ответ, итог — по всем.
  const hours = parseWorkHours(hoursRaw);
  const sla = slaMinutes(slaRaw);
  const shift = shiftMinutes(hours);
  const resp = responseStats(
    responses.rows.map((r) => ({ conversationId: r.conversation_id, asked: new Date(r.asked), human: r.human ? new Date(r.human) : null, author: r.author_id, bot: r.bot ? new Date(r.bot) : null })),
    hours,
    sla,
    new Date(),
  );
  const workMins = (m: number | null) => (m === null ? "—" : waitLabel(Math.round(m), shift));
  const share = (x: number | null) => (x === null ? "—" : `${Math.round(x * 100)}%`);
  const reachedStage = (st: { kind: string; position: number }) => reached.rows.filter((r) => r.won || (st.kind === "open" && r.max_open !== null && r.max_open >= st.position)).length;
  const plans = await container().sales.queries.planProgress(currentMonth());
  const timeByStage = new Map(stageTime.rows.map((r) => [r.stage_id, r]));

  const t = totals.rows[0] ?? {};
  const p = prevTotals.rows[0] ?? {};
  const names = new Map(admins.map((a) => [a.id, staffLabel(a)]));

  // Каналы привлечения сделок: по UTM, если есть, иначе по источнику сделки (чат, звонок).
  const channelRows = [
    ...bySource.rows
      .reduce((acc, r) => {
        const key = channelOf(toAttribution(r.utm), String(r.source));
        const cur = acc.get(key) ?? { key, label: channels[key], created: 0, won: 0, revenue: 0 };
        cur.created++;
        // Деньги по ручным сделкам: с первого платежа сделка — продажа на сумму принятых денег; без платежей — успешная сделка на её сумму.
        if (num(r.paid) > 0) {
          cur.won++;
          cur.revenue += num(r.paid);
        } else if (r.won) {
          cur.won++;
          cur.revenue += num(r.amount);
        }
        return acc.set(key, cur);
      }, new Map<string, { key: string; label: string; created: number; won: number; revenue: number }>())
      .values(),
  ].sort((a, b) => b.revenue - a.revenue || b.created - a.created);
  const stageRows = new Map(byStage.rows.map((r) => [String(r.stage_id), r]));
  const c = calls.rows[0] ?? {};
  const team = managers.rows
    .map((r: Row): Row & { name: string; resp: ResponseGroup | undefined } => ({ ...r, received: moneyByManager.get(String(r.id)) ?? 0, name: names.get(String(r.id)) ?? "—", resp: resp.byAuthor.get(String(r.id)) }))
    .filter((r) => num(r.deals) || num(r.won) || num(r.messages) || num(r.phone_messages) || num(r.calls) || num(r.open) || num(r.received))
    .sort((a, b) => num(b.revenue) - num(a.revenue) || num(b.won) - num(a.won));

  const inWork = stages.filter((st) => st.kind === "open").reduce((sum, st) => sum + num(stageRows.get(st.id)?.n), 0);
  const planPct = (id: string) => {
    const pl = plans.get(id);
    return pl?.planAmount ? `${Math.round((pl.factAmount / pl.planAmount) * 100)}%` : "—";
  };

  const base = reached.rows.length;
  const wonReached = reached.rows.filter((r) => r.won).length;
  const funnel = stages
    .filter((st) => st.kind !== "lost")
    .map((st, i, list) => {
      const n = st.kind === "won" ? wonReached : reachedStage(st);
      const prevN = i > 0 ? (list[i - 1].kind === "won" ? wonReached : reachedStage(list[i - 1])) : null;
      return { st, n, prevN, time: timeByStage.get(st.id) };
    });
  const maxRevenue = Math.max(...channelRows.map((r) => r.revenue), 0);
  const maxTeamRevenue = Math.max(...team.map((r) => num(r.revenue)), 0);

  return { pipelines, pipeline, period, tz, showProfit, stages, profit, flow, resp, sla, shift, workMins, share, plans, t, p, channelRows, stageRows, c, team, inWork, planPct, base, funnel, maxRevenue, maxTeamRevenue, lost, awaiting };
}
