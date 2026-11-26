import "server-only";
import { z } from "zod";
import { can, staffViewer } from "@/server/access";
import { container } from "@/server/container";
import { financePeriod } from "@/modules/reporting/ui/finance-screen";
import { storeTimeZone } from "@/shared/domain/time";
import { op } from "./op";

/**
 * Каркас CRM и главная (ADR 0012, A5 — Раздел 5): живые значки и телефония каркаса, «Мой день», сводка руководителя.
 * Выход на смену при заходе — действие autoShiftOnVisitAction (src/server/crm-actions/shell.ts), не чтение.
 */
export const reads = {
  "shell.layout": op("shell", z.object({}).strict(), async (_, staff) => {
    const calls = can(staff, "calls.make");
    const ext = staff.user.sipExtension;
    const [live, phone, waCalls, pbx] = await Promise.all([
      container().reporting.live(staff.context),
      calls ? container().telephony.phone.webphoneAvailable(ext) : false,
      calls ? container().telephony.whatsapp.enabled() : false,
      // Звонок через АТС есть только с Zadarma и внутренним номером; нет — «Позвонить» звонит в WhatsApp.
      calls && ext ? container().telephony.phone.currentProvider().then((p) => p === "zadarma") : false,
    ]);
    return { live, phone, waCalls, pbx };
  }),

  "shell.myDay": op([], z.object({}).strict(), async (_, staff) => {
    const [{ currentMonth }, { getSetting }] = await Promise.all([import("@/modules/sales/domain/plans"), import("@/modules/workspace")]);
    const me = staff.user.id;
    const viewer = staffViewer(staff);
    const [day, plans, slaRaw, hoursRaw, provider, lists] = await Promise.all([
      container().reporting.myDay(viewer, { chats: can(staff, "chats.view"), calls: can(staff, "calls.view"), deals: can(staff, "deals.view") }),
      container().sales.queries.planProgress(currentMonth(), [me]),
      getSetting("crm.slaMinutes"),
      getSetting("crm.workHours"),
      can(staff, "calls.make") ? container().telephony.phone.currentProvider() : null,
      can(staff, "deals.view") ? container().reporting.managerListCounts(viewer) : null,
    ]);
    return { day, plan: plans.get(me) ?? null, slaRaw, hoursRaw, provider, lists };
  }),

  "shell.dashboard": op(["analytics.view"], z.object({ p: z.string().max(20).optional(), from: z.string().max(20).optional(), to: z.string().max(20).optional() }), async (q, staff) => {
    const [{ getSetting }, { loadProfit }] = await Promise.all([import("@/modules/workspace"), import("@/server/money-flow")]);
    const tz = storeTimeZone();
    const period = financePeriod({ preset: q.p, from: q.from, to: q.to, now: new Date(), tz });
    const [channelsReport, profit, dashboard, dealAttention] = await Promise.all([
      container().marketing.service.report({ from: period.from, to: period.to, first: period.first, last: period.last }),
      loadProfit(period, tz),
      container().reporting.dashboard({ from: period.from, to: period.to, prev: period.prev }, staffViewer(staff)),
      getSetting("crm.slaMinutes").then((sla) => container().reporting.attention(staffViewer(staff), Number(sla) || 15)),
    ]);
    return { channelsReport, profit, dashboard, dealAttention };
  }),
};
