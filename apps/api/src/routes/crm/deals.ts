/**
 * Сделка в приложении CRM: форма правки и сохранение — те же действия, что у карточки сделки на сайте
 * (updateDealAction, setDealAgreedPlanAction, setDealAgreedGiftsAction): права, «только свои», лимит скидки, журнал.
 */
import { getPlans } from "@/config/site";
import { container } from "@/server/container";
import { apiStaff, HttpError } from "@/server/api";
import { can, canWork } from "@/server/access";
import { discountLimit } from "@/server/discount";
import { listFields } from "@/modules/workspace";
import { planLabels } from "@/modules/ordering/ui/labels";
import { buildDealUpdateForm, fieldsOut, fieldsToForm, giftChoices, refusedResponse } from "@/modules/sales/ui/crm-forms";
import { dealSourceLabels, dealSources } from "@/shared/domain/dealSources";
import { setDealAgreedGiftsAction, setDealAgreedPlanAction, updateDealAction } from "@/server/crm-actions/deals";
import type { Handlers } from "../../app";

async function findDeal(id: string) {
  const deal = await container().sales.deals.findById(id);
  if (!deal) throw new HttpError(404, "notFound");
  return deal;
}

export const crmDealHandlers: Pick<Handlers, "crmDealForm" | "crmDealUpdate" | "crmDealPlan" | "crmDealGifts"> = {
  async crmDealForm({ req, input }) {
    const staff = await apiStaff(req, "deals.view");
    const deal = await findDeal(input.dealId);
    // Чужую сделку роли «только свои» не показываем, как и на сайте.
    if (!staff.context.canSee(deal.assigneeId)) throw new HttpError(404, "notFound");
    const c = container();
    const [defs, plan, gifts, maxDiscount] = await Promise.all([listFields("deal"), c.sales.agreedPlan.get(deal.id), c.sales.agreedGifts.get(deal.id), discountLimit(staff)]);
    const seesContacts = can(staff, "clients.contacts");
    return {
      id: deal.id,
      number: deal.number,
      title: deal.title,
      contactName: deal.contactName,
      phone: seesContacts ? (deal.contactPhone ?? "") : null,
      email: seesContacts ? (deal.contactEmail ?? "") : null,
      extraPhones: seesContacts ? deal.extraPhones : [],
      canEditContacts: seesContacts,
      amount: deal.amount,
      maxDiscountPercent: maxDiscount,
      source: deal.source,
      sources: dealSources.map((id) => ({ id, label: dealSourceLabels[id] })),
      tags: deal.tags,
      fields: fieldsOut(defs, deal.customFields),
      canEdit: can(staff, "deals.edit") && canWork(staff, deal.assigneeId),
      plan: plan ?? null,
      plans: getPlans()
        .filter((p) => !p.hidden || p.id === plan)
        .map((p) => ({ id: p.id, label: planLabels[p.id], price: p.price })),
      gifts: [...gifts],
      giftOptions: giftChoices(plan ?? null),
      agreementLocked: !!deal.orderId,
    };
  },

  async crmDealUpdate({ req, input }) {
    const staff = await apiStaff(req, "deals.edit");
    const deal = await findDeal(input.dealId);
    // Форма сайта целиком: чего нет в правке — прежние значения (иначе теги и доп. номера стёрлись бы).
    const form = buildDealUpdateForm(deal, input.body, can(staff, "clients.contacts"));
    if (input.body.fields) fieldsToForm(form, await listFields("deal"), input.body.fields);
    const r = await updateDealAction({}, form);
    if (r.error) return refusedResponse(r.error);
    return { ok: true, message: r.ok ?? null };
  },

  async crmDealPlan({ req, input }) {
    await apiStaff(req, "deals.edit");
    const r = await setDealAgreedPlanAction(input.dealId, input.body.plan);
    return r.ok ? { ok: true, message: "Тариф сохранён" } : refusedResponse(r.message ?? "Не удалось сохранить тариф");
  },

  async crmDealGifts({ req, input }) {
    await apiStaff(req, "deals.edit");
    const r = await setDealAgreedGiftsAction(input.dealId, input.body.gifts);
    return r.ok ? { ok: true, message: "Сохранено" } : refusedResponse(r.message ?? "Не удалось сохранить");
  },
};
