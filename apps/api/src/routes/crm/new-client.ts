/**
 * «Новый клиент» в приложении CRM: справочники формы и создание — то же действие, что страница /admin/clients/new
 * (createClientAction: аккаунт, сделки пакета, предоплата, заметка с условиями, задачи, журнал); чек предоплаты — тот же
 * маршрут сайта (/api/admin/deals/<id>/receipts).
 */
import { getVisiblePlans } from "@/config/site";
import { apiStaff } from "@/server/api";
import { can, canAssignOthers } from "@/server/access";
import { container } from "@/server/container";
import { discountLimit } from "@/server/discount";
import { payFormOptions } from "@/server/pay-form";
import { staffOptions } from "@/modules/access/ui";
import { planLabels } from "@/modules/ordering/ui/labels";
import { buildNewClientForm, CRM_LOCALES, refusedResponse } from "@/modules/sales/ui/crm-forms";
import { channels, manualChannels } from "@/shared/domain/channels";
import { createClientAction } from "@/server/crm-actions/clients-new";
import { POST as receiptRoute } from "@/server/site-handlers/admin/deals-id-receipts";
import type { Handlers } from "../../app";
import { siteFileRoute } from "./site-route";

export const crmNewClientHandlers: Pick<Handlers, "crmClientNewOptions" | "crmClientCreate" | "crmDealReceipt"> = {
  async crmClientNewOptions({ req }) {
    const staff = await apiStaff(req, "clients.create");
    const q = container().sales.queries;
    const [stages, pipelines, admins, maxDiscount, payForms] = await Promise.all([q.listStages(), q.listPipelines(), container().access.queries.allStaff(), discountLimit(staff), payFormOptions()]);
    const open = stages.filter((s) => s.kind === "open");
    const options = staffOptions(admins);
    return {
      channels: manualChannels.map((id) => ({ id, label: channels[id] })),
      locales: [...CRM_LOCALES],
      plans: getVisiblePlans().map((p) => ({ id: p.id, label: planLabels[p.id], price: p.price })),
      payForms,
      stages: open.map((s) => ({ id: s.id, label: pipelines.length > 1 ? `${pipelines.find((x) => x.id === s.pipelineId)?.name} · ${s.name}` : s.name })),
      defaultStageId: open.find((s) => s.name === "Взяли в работу")?.id ?? open[0]?.id ?? null,
      managers: canAssignOthers(staff) ? options : options.filter((a) => a.id === staff.user.id),
      me: staff.user.id,
      canAssign: canAssignOthers(staff),
      canDeal: can(staff, "deals.edit"),
      maxDiscountPercent: maxDiscount,
    };
  },

  async crmClientCreate({ req, input }) {
    await apiStaff(req, "clients.create");
    // Поля формы сайта: то же разбор и те же правила (телефон, канал, тариф, предоплата не больше договорённости, скидка).
    const form = buildNewClientForm(input.body);
    const r = await createClientAction({}, form);
    if (!r.done) return refusedResponse(r.error ?? "Не удалось завести клиента");
    const d = r.done;
    return {
      clientId: d.clientId,
      clientName: d.clientName,
      dealId: d.dealId,
      dealNumber: d.dealNumber,
      parts: d.parts.map((p) => ({ dealId: p.dealId, dealNumber: p.dealNumber, agreed: p.agreed, prepaid: p.prepaid, paymentId: p.paymentId })),
      count: d.count,
      loginText: d.loginText,
      password: d.password,
      loginUrl: d.loginUrl,
      message: d.message,
      agreed: d.agreed,
      prepaid: d.prepaid,
      remainder: d.remainder,
      tasks: d.tasks,
    };
  },

  async crmDealReceipt({ req, input }) {
    const { res, data } = await siteFileRoute(receiptRoute, req, input.dealId, { amount: input.amount, paymentId: input.paymentId }, input.files[0]);
    if (!data) return res;
    return { ok: true, message: "Чек приложен" };
  },
};
