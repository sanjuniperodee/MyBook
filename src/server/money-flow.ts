import "server-only";
import { container } from "@/server/container";
import { getSetting } from "@/modules/workspace";
import type { FinancePeriod } from "@/modules/reporting/ui/finance-screen";
import { profitScreen } from "@/modules/reporting/ui/profit-screen";
import { parseFeeRates, parseTaxRate } from "@/shared/domain/expenses";
import { zonedDay } from "@/shared/domain/time";

/**
 * Отчёт о прибыли периода — один расчёт для «Прибыли», строки «Деньги за период» в «Финансах» и «Аналитике продаж»:
 * те же деньги (как в «Финансах»), расходы, комиссии по формам оплаты и налог из настроек.
 */
export async function loadProfit(period: FinancePeriod, tz: string) {
  const prev = { ...period.prev, first: zonedDay(period.prev.from, tz), last: zonedDay(new Date(period.prev.to.getTime() - 1), tz) };
  const [data, feeSetting, taxSetting] = await Promise.all([container().reporting.profit({ from: period.from, to: period.to, first: period.first, last: period.last, prev }), getSetting("finance.fees"), getSetting("finance.taxRate")]);
  const feeRates = parseFeeRates(feeSetting);
  const taxRate = parseTaxRate(taxSetting);
  return { screen: profitScreen({ period, ...data, feeRates, taxRate, tz }), data, feeRates, taxRate };
}
