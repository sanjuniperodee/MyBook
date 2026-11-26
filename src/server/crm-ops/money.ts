import "server-only";
import { z } from "zod";
import { can } from "@/server/access";
import { container } from "@/server/container";
import { financePeriod } from "@/modules/reporting/ui/finance-screen";
import { storeTimeZone } from "@/shared/domain/time";
import { op } from "./op";

/**
 * Сборщики денежных страниц CRM (ADR 0012, A5 — Раздел 5): финансы, расходы, прибыль, реестр продаж, заявки. Период
 * считается здесь из того же ввода (пресет, даты), что у страницы, — по времени магазина.
 */
const periodInput = z.object({ p: z.string().max(20).optional(), from: z.string().max(20).optional(), to: z.string().max(20).optional() });
const periodOf = (q: z.output<typeof periodInput>) => {
  const tz = storeTimeZone();
  return { tz, period: financePeriod({ preset: q.p, from: q.from, to: q.to, now: new Date(), tz }) };
};
const loadProfit = async (q: z.output<typeof periodInput>) => {
  const { tz, period } = periodOf(q);
  return (await import("@/server/money-flow")).loadProfit(period, tz);
};

export const reads = {
  "money.finance": op(["analytics.view"], periodInput, async (q, staff) => {
    const { period } = periodOf(q);
    // Строка «Деньги за период» (как в «Прибыли»): руководству с правом финансов.
    const showFlow = staff.scope === "all" && can(staff, "finance.view");
    const [data, admins, profit] = await Promise.all([container().reporting.finance({ from: period.prev.from, to: period.to }), container().access.queries.allStaff(), showFlow ? loadProfit(q) : null]);
    return { data, admins, profit };
  }),

  "money.expenses": op(["finance.view"], periodInput, async (q) => {
    const { period } = periodOf(q);
    const [rows, admins] = await Promise.all([container().reporting.expenses(period.first, period.last), container().access.queries.allStaff()]);
    return { rows, admins };
  }),

  "money.profit": op(["finance.view"], periodInput, async (q) => {
    const [profit, dealFields] = await Promise.all([loadProfit(q), import("@/modules/workspace").then((w) => w.listFields("deal"))]);
    return { profit, dealFields };
  }),

  "money.sales": op(["analytics.view"], periodInput, async (q) => {
    const { getSetting, listFields } = await import("@/modules/workspace");
    const { period } = periodOf(q);
    const [rows, admins, feeSetting, dealFields] = await Promise.all([container().reporting.salesRegister({ from: period.from, to: period.to }), container().access.queries.allStaff(), getSetting("finance.fees"), listFields("deal")]);
    return { rows, admins, feeSetting, dealFields };
  }),

  "money.leads": op(["analytics.view"], periodInput, async (q) => {
    const { period } = periodOf(q);
    const [data, admins] = await Promise.all([container().reporting.leadStats({ from: period.prev.from, to: period.to, first: period.first, last: period.last }), container().access.queries.allStaff()]);
    return { data, admins };
  }),
};
