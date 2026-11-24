/**
 * Сделка в приложении CRM: форма правки и сохранение — те же действия, что у карточки сделки на сайте
 * (updateDealAction, setDealAgreedPlanAction, setDealAgreedGiftsAction): права, «только свои», лимит скидки, журнал.
 */
import { getPlans, giftsForPlan } from "@/config/site";
import { container } from "@/server/container";
import { apiStaff, HttpError } from "@/server/api";
import { can, canWork } from "@/server/access";
import { discountLimit } from "@/server/discount";
import { listFields } from "@/modules/workspace";
import { planLabels } from "@/modules/ordering/ui/labels";
import { dealSourceLabels, dealSources } from "@/shared/domain/dealSources";
import { setDealAgreedGiftsAction, setDealAgreedPlanAction, updateDealAction } from "@/app/admin/deals/actions";
import type { Handlers } from "../../app";
import { fieldsOut, fieldsToForm, refused } from "./common";

const GIFT_LABELS: Record<string, string> = { giftwrap: "Подарочная упаковка", delivery: "Доставка" };
const giftChoices = (plan: string | null) => (plan ? giftsForPlan(plan) : ["giftwrap", "delivery"]).map((id) => ({ id, label: GIFT_LABELS[id] ?? id }));

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
    const b = input.body;
    // Форма сайта целиком: чего нет в правке — прежние значения (иначе теги и доп. номера стёрлись бы).
    const form = new FormData();
    form.set("id", deal.id);
    form.set("title", b.title ?? deal.title);
    form.set("contactName", b.contactName ?? deal.contactName);
    form.set("amount", String(b.amount ?? deal.amount));
    form.set("source", b.source ?? deal.source);
    form.set("tags", (b.tags ?? deal.tags).join(","));
    if (can(staff, "clients.contacts") && (b.phone !== undefined || b.email !== undefined || b.extraPhones !== undefined)) {
      form.set("contactPhone", b.phone ?? deal.contactPhone ?? "");
      form.set("contactEmail", b.email ?? deal.contactEmail ?? "");
      form.set("extraPhones", (b.extraPhones ?? deal.extraPhones).join("\n"));
    }
    if (b.fields) fieldsToForm(form, await listFields("deal"), b.fields);
    const r = await updateDealAction({}, form);
    if (r.error) return refused(r.error);
    return { ok: true, message: r.ok ?? null };
  },

  async crmDealPlan({ req, input }) {
    await apiStaff(req, "deals.edit");
    const r = await setDealAgreedPlanAction(input.dealId, input.body.plan);
    return r.ok ? { ok: true, message: "Тариф сохранён" } : refused(r.message ?? "Не удалось сохранить тариф");
  },

  async crmDealGifts({ req, input }) {
    await apiStaff(req, "deals.edit");
    const r = await setDealAgreedGiftsAction(input.dealId, input.body.gifts);
    return r.ok ? { ok: true, message: "Сохранено" } : refused(r.message ?? "Не удалось сохранить");
  },
};
