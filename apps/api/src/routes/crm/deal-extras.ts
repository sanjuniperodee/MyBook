/**
 * Сделка в приложении CRM — то, что раньше открывалось карточкой CRM: клиент (завести из сделки, привязать, отвязать), дубли
 * контакта (слить в эту), прошлые сделки, перенос в другую воронку, удаление. Те же действия, что у карточки сделки сайта.
 */
import { apiStaff, HttpError } from "@/server/api";
import { can, canWork } from "@/server/access";
import { container } from "@/server/container";
import { buildDealClientCreateForm, formatDealLinkRow, isNextRedirect, refusedResponse } from "@/modules/sales/ui/crm-forms";
import { channels, manualChannels } from "@/shared/domain/channels";
import { createClientFromDealAction, deleteDealAction, linkDealClientAction, mergeDealAction, movePipelineAction } from "@/server/crm-actions/deals";
import type { Handlers } from "../../app";

type Extras = "crmDealExtras" | "crmDealClientCreate" | "crmDealClientLink" | "crmDealMerge" | "crmDealPipeline" | "crmDealDelete";

export const crmDealExtraHandlers: Pick<Handlers, Extras> = {
  async crmDealExtras({ req, input }) {
    const staff = await apiStaff(req, "deals.view");
    const c = container();
    const deal = await c.reporting.dealById(input.dealId);
    if (!deal || !staff.context.canSee(deal.assigneeId)) throw new HttpError(404, "notFound");
    const [duplicates, suggestedId, pipelines, stages] = await Promise.all([
      c.sales.queries.duplicates(deal),
      !deal.clientId && deal.contactPhone ? c.sales.deals.findClientByPhone(deal.contactPhone) : null,
      c.sales.queries.listPipelines(),
      c.sales.queries.listStages(),
    ]);
    const suggested = suggestedId ? await c.reporting.clientBrief(suggestedId) : null;
    const works = canWork(staff, deal.assigneeId);
    return {
      clientId: deal.clientId ?? null,
      suggested: suggested ? { id: suggestedId!, name: suggested.name || suggested.email || "Клиент" } : null,
      canCreateClient: !deal.clientId && !suggested && !!deal.contactPhone && can(staff, "clients.create") && works,
      canLink: can(staff, "deals.edit", "clients.view") && works,
      channels: manualChannels.map((k) => ({ id: k, label: channels[k] })),
      duplicates: duplicates.open.filter((r) => staff.context.canSee(r.deal.assigneeId)).map(formatDealLinkRow),
      canMerge: can(staff, "deals.edit", "deals.delete") && works,
      past: duplicates.past.filter((r) => staff.context.canSee(r.deal.assigneeId)).map(formatDealLinkRow),
      pipelines: pipelines.map((p) => ({ id: p.id, label: p.name })),
      pipelineId: stages.find((s) => s.id === deal.stageId)?.pipelineId ?? pipelines[0]?.id ?? "",
      canMovePipeline: can(staff, "deals.edit") && works && pipelines.length > 1,
      canDelete: can(staff, "deals.delete") && works,
    };
  },

  async crmDealClientCreate({ req, input }) {
    await apiStaff(req, "clients.create");
    const form = buildDealClientCreateForm(input.body);
    const r = await createClientFromDealAction(input.dealId, {}, form);
    if (!r.done) return refusedResponse(r.error ?? "Не удалось завести клиента");
    return { clientId: r.done.clientId, login: r.done.loginText, password: r.done.password, message: r.done.message };
  },

  async crmDealClientLink({ req, input }) {
    await apiStaff(req, "deals.edit");
    const r = await linkDealClientAction(input.dealId, input.body.clientId);
    if (!r.ok) return refusedResponse(r.message ?? "Не удалось привязать");
    return { ok: true as const, message: input.body.clientId ? "Сделка привязана к клиенту" : "Сделка отвязана от клиента" };
  },

  async crmDealMerge({ req, input }) {
    await apiStaff(req, "deals.edit");
    const r = await mergeDealAction(input.dealId, input.body.sourceId);
    if (r?.error) return refusedResponse(r.error);
    return { ok: true as const, message: "Сделки объединены" };
  },

  async crmDealPipeline({ req, input }) {
    await apiStaff(req, "deals.edit");
    try {
      await movePipelineAction(input.dealId, input.body.pipelineId);
    } catch (err) {
      if (err instanceof Error && /этапов/.test(err.message)) return refusedResponse(err.message);
      throw err;
    }
    return { ok: true as const, message: "Сделка перенесена в другую воронку" };
  },

  async crmDealDelete({ req, input }) {
    await apiStaff(req, "deals.delete");
    try {
      const r = await deleteDealAction(input.dealId);
      if (r?.error) return refusedResponse(r.error);
    } catch (err) {
      if (!isNextRedirect(err)) throw err;
    }
    return { ok: true as const, message: "Сделка удалена" };
  },
};
