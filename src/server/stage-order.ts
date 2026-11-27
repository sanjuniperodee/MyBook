import "server-only";
import { container } from "@/server/container";
import { getSetting } from "@/modules/workspace";
import { lostReasons } from "@/modules/sales/domain/meta";
import { parseStageOrder, stageOrderMove, waitingStageIds, type StageOrderConfig, type StageOrderDeal } from "@/shared/domain/stageOrder";

/** За один проход (раз в минуту): не больше стольких переводов и стольких разборов переписки моделью (до 180 в час). */
export const STAGE_ORDER_MOVES = 40;
export const STAGE_ORDER_AI = 3;

interface Candidate extends StageOrderDeal {
  id: string;
  number: number;
  clientId: string | null;
}

export interface StageOrderVerdict {
  verdict: "refused" | "later" | "warm" | "silent" | "active" | "spam";
  reason: string | null;
  later: string | null;
  note: string;
}

export interface StageOrderDeps {
  config(): Promise<StageOrderConfig>;
  /** Основная воронка: её первый этап «в работе» и этап отказа. */
  funnel(): Promise<{ pipelineId: string; entryStageId: string; lostStageId: string; openStageIds: string[] } | null>;
  candidates(f: { pipelineId: string; stageIds: string[]; entryStageId: string }): Promise<Candidate[]>;
  /** Сделки на этих этапах, по которым пришли деньги, а заказа ещё нет: сколько оплачено. */
  paid(f: { pipelineId: string; stageIds: string[] }): Promise<{ id: string; clientId: string | null; paid: number }[]>;
  /** Модель помощника подключена: замолчавшие заявки ждут её вывода, а не уходят в «не отвечает» сразу все. */
  aiReady(): Promise<boolean>;
  /** Вывод модели по переписке сделки; null — нет переписки или ответ не разобран. */
  assess(dealId: string): Promise<StageOrderVerdict | null>;
  move(dealId: string, stageId: string, lostReason: string | null): Promise<void>;
  note(deal: { id: string; clientId: string | null }, text: string): Promise<void>;
  logError(err: unknown): void;
}

export interface StageOrderResult {
  /** Переведено по оплате. */
  paid: number;
  work: number;
  silent: number;
  lost: number;
  assessed: number;
}

/**
 * «Порядок в воронке»: сделки сами идут по этапам вслед за перепиской и оплатой (настройка на странице «Этапы воронки»).
 * Пришла оплата (предоплата при заведении клиента, платёж, счёт) — сделка уходит на этап из настройки.
 * Простые переходы — по правилам (stageOrderMove): ответили на новую заявку или клиент написал снова → «в работе»; клиент
 * молчит давно на этапе «не отвечает» → отказ. Когда клиент замолчал на silentDays дней, переписку один раз читает модель
 * помощника: ясный отказ — сразу в «Отказ» с причиной из списка воронки, не покупатель — «Спам / ошибка», иначе — на этап
 * «не отвечает»; её вывод одной строкой ложится в ленту сделки. За проход модель читает несколько переписок — остальные
 * замолчавшие ждут следующего прохода. Модель не подключена или ошиблась — заявка идёт на «не отвечает» без вывода.
 * Сделки с оплатой, заказом и открытой задачей сотрудника не трогаем: у них свой путь или план менеджера (задачи правил не в счёт).
 */
export async function stageOrderPass(d: StageOrderDeps, now = new Date()): Promise<StageOrderResult | null> {
  const cfg = await d.config();
  if (!cfg.on) return null;
  const funnel = await d.funnel();
  // Этапы из настройки удалили или перенесли в другую воронку — молча ничего не делаем: порядок включат заново.
  if (!funnel || !funnel.openStageIds.includes(cfg.workStageId) || !funnel.openStageIds.includes(cfg.silentStageId)) return null;
  // Этапы «дожим», «напомнить позже», «рассылки» — только если они в основной воронке «в работе» (их могли удалить).
  const extra = waitingStageIds(cfg).filter((id) => funnel.openStageIds.includes(id));
  const stageIds = [...new Set([funnel.entryStageId, cfg.workStageId, ...extra])];
  const has = (id: string) => !!id && extra.includes(id);
  const result: StageOrderResult = { paid: 0, work: 0, silent: 0, lost: 0, assessed: 0 };
  let moves = 0;
  // Оплата — первой: клиенту завели кабинет с предоплатой или он оплатил счёт, сделка сразу уходит на свой этап.
  if (cfg.paidStageId && funnel.openStageIds.includes(cfg.paidStageId)) {
    for (const deal of await d.paid({ pipelineId: funnel.pipelineId, stageIds: stageIds.filter((id) => id !== cfg.paidStageId) })) {
      if (moves >= STAGE_ORDER_MOVES) break;
      try {
        await d.move(deal.id, cfg.paidStageId, null);
        await d.note(deal, `Порядок в воронке: по сделке получена оплата ${deal.paid.toLocaleString("ru-RU")} ₸.`);
        result.paid++;
        moves++;
      } catch (err) {
        d.logError(err);
      }
    }
  }
  const ai = await d.aiReady();
  for (const deal of await d.candidates({ pipelineId: funnel.pipelineId, stageIds, entryStageId: funnel.entryStageId })) {
    if (moves >= STAGE_ORDER_MOVES) break;
    const move = stageOrderMove(deal, cfg, now);
    if (!move) continue;
    // Лимит модели на проход исчерпан — замолчавшая заявка ждёт следующего прохода (через минуту), чтобы получить вывод.
    if (move.to === "silent" && ai && result.assessed >= STAGE_ORDER_AI) continue;
    try {
      if (move.to === "work") {
        await d.move(deal.id, cfg.workStageId, null);
        result.work++;
      } else if (move.to === "mailing" && has(cfg.mailingStageId)) {
        await d.move(deal.id, cfg.mailingStageId, null);
        await d.note(deal, `Порядок в воронке: ${move.why}.`);
        result.silent++;
      } else if (move.to === "lost" || move.to === "mailing") {
        await d.move(deal.id, funnel.lostStageId, cfg.lostReason);
        await d.note(deal, `Порядок в воронке: ${move.why} — закрыта отказом «${cfg.lostReason}».`);
        result.lost++;
      } else {
        // Клиент замолчал: переписку читает модель (пока есть лимит прохода) — отказ с причиной лучше, чем «не отвечает».
        const verdict = ai ? await d.assess(deal.id).catch((err) => (d.logError(err), null)) : null;
        if (ai) result.assessed++;
        const summary = verdict?.note ? ` Вывод по переписке: ${verdict.note}` : "";
        if (verdict?.verdict === "refused" && verdict.reason) {
          await d.move(deal.id, funnel.lostStageId, verdict.reason);
          await d.note(deal, `Порядок в воронке: клиент отказался — «${verdict.reason}».${summary}`);
          result.lost++;
        } else if (verdict?.verdict === "spam") {
          await d.move(deal.id, funnel.lostStageId, "Спам / ошибка");
          await d.note(deal, `Порядок в воронке: не покупатель — «Спам / ошибка».${summary}`);
          result.lost++;
        } else {
          // Тёплые — на свои этапы: «подумаю / позже» → «напомнить позже», знает цену и не решил → «дожим».
          const to = verdict?.verdict === "later" && has(cfg.laterStageId) ? cfg.laterStageId : verdict?.verdict === "warm" && has(cfg.pushStageId) ? cfg.pushStageId : cfg.silentStageId;
          const where = to === cfg.laterStageId ? "клиент обещал вернуться" : to === cfg.pushStageId ? "клиент интересовался и не решил — дожать" : move.why;
          if (deal.stageId !== to) await d.move(deal.id, to, null);
          await d.note(deal, `Порядок в воронке: ${where}.${verdict?.later ? ` Обещал вернуться: ${verdict.later}.` : ""}${summary}`);
          result.silent++;
        }
      }
      moves++;
    } catch (err) {
      d.logError(err);
    }
  }
  return result;
}

/** Порты из контекстов: настройки, воронка и сделки продаж, переписка (выборка), помощник (модель). */
export function stageOrderDeps(): StageOrderDeps {
  const c = container();
  return {
    config: async () => parseStageOrder(await getSetting("crm.stageOrder")),
    async funnel() {
      const [pipeline] = await c.sales.queries.listPipelines();
      if (!pipeline) return null;
      const stages = await c.sales.queries.listStages(pipeline.id);
      const open = stages.filter((s) => s.kind === "open");
      const lost = stages.find((s) => s.kind === "lost");
      if (!open.length || !lost) return null;
      return { pipelineId: pipeline.id, entryStageId: open[0].id, lostStageId: lost.id, openStageIds: open.map((s) => s.id) };
    },
    candidates: (f) => c.reporting.stageOrderCandidates(f),
    paid: (f) => c.reporting.stageOrderPaid(f),
    aiReady: () => c.assistant.service.configured(),
    async assess(dealId) {
      // Причины отказа — из списка воронки, кроме «Не отвечает» и спама: их ставит сам проход.
      return c.assistant.service.assessDeal(dealId, lostReasons.filter((r) => r !== "Не отвечает" && !/^спам/i.test(r)));
    },
    move: async (dealId, stageId, lostReason) => void (await c.sales.deals.move(dealId, stageId, null, lostReason)),
    note: async (deal, text) => void (await c.sales.deals.note(deal, text, null)),
    logError: (err) => console.error("[stage order]", err),
  };
}
