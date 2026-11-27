import { Controller, Inject, Req } from "@nestjs/common";
import type { FastifyRequest } from "fastify";
import type { Output, Parsed } from "@mybook/contracts";
import { getPlans } from "@/config/site";
import type { Locale } from "@/i18n/config";
import { planLabels } from "@/modules/ordering/ui/labels";
import {
  buildDealClientCreateForm,
  buildDealUpdateForm,
  fieldsOut,
  fieldsToForm,
  formatDealLinkRow,
  giftChoices,
  isNextRedirect,
  refusedResponse,
} from "@/modules/sales/ui/crm-forms";
import { channels, manualChannels } from "@/shared/domain/channels";
import { dealSourceLabels, dealSources } from "@/shared/domain/dealSources";
import type { StaffMember } from "../../core/auth/staff";
import { CurrentStaff, Permissions } from "../../core/auth/staff.decorators";
import { APP_CONFIG, type AppConfig } from "../../core/config/app-config";
import { ApiError } from "../../core/errors/api-error";
import { clientIp } from "../../core/http/client-ip";
import { Input, RequestLocale, SessionToken } from "../../core/http/decorators";
import { Endpoint } from "../../core/http/endpoint";
import { CRM_DEALS_PORTS, type CrmDealsPorts, type CrmRequestMeta } from "./crm-core.tokens";

/**
 * Контекст 4A — сделки CRM (10 маршрутов API v1): форма правки, сохранение, тариф/подарки договорённости и действия
 * карточки «Ещё» (клиент из сделки, привязка/отвязка, слияние дублей, перенос воронки, удаление).
 */
@Controller()
export class CrmDealsController {
  constructor(
    @Inject(CRM_DEALS_PORTS) private readonly deals: CrmDealsPorts,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  private metaOf(staff: StaffMember, token: string | null, req: FastifyRequest, locale: Locale): CrmRequestMeta {
    return { staff, token, ip: clientIp(req, this.config.edgeIpSecret), locale };
  }

  private async findDealOrThrow(dealId: string) {
    const deal = await this.deals.findDeal(dealId);
    if (!deal) throw new ApiError(404, "notFound");
    return deal;
  }

  @Endpoint("crmDealForm")
  @Permissions("deals.view")
  async dealForm(@CurrentStaff() staff: StaffMember, @Input() input: Parsed<"crmDealForm">): Promise<Output<"crmDealForm">> {
    const deal = await this.findDealOrThrow(input.dealId);
    // Чужую сделку роли «только свои» не показываем, как и на сайте.
    if (!staff.context.canSee(deal.assigneeId)) throw new ApiError(404, "notFound");
    const [defs, plan, gifts, maxDiscount] = await Promise.all([
      this.deals.listFields("deal"),
      this.deals.agreedPlan(deal.id),
      this.deals.agreedGifts(deal.id),
      this.deals.discountLimit(staff),
    ]);
    const seesContacts = staff.context.can("clients.contacts");
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
      note: deal.note ?? "",
      fields: fieldsOut(defs, deal.customFields),
      canEdit: staff.context.can("deals.edit") && staff.context.canWork(deal.assigneeId),
      plan: plan ?? null,
      plans: getPlans()
        .filter((p) => !p.hidden || p.id === plan)
        .map((p) => ({ id: p.id, label: planLabels[p.id], price: p.price })),
      gifts: [...gifts],
      giftOptions: giftChoices(plan ?? null),
      agreementLocked: !!deal.orderId,
    };
  }

  @Endpoint("crmDealUpdate")
  @Permissions("deals.edit")
  async dealUpdate(
    @CurrentStaff() staff: StaffMember,
    @SessionToken() token: string | null,
    @Req() req: FastifyRequest,
    @RequestLocale() locale: Locale,
    @Input() input: Parsed<"crmDealUpdate">,
  ): Promise<Output<"crmDealUpdate"> | Response> {
    const deal = await this.findDealOrThrow(input.dealId);
    const form = buildDealUpdateForm(deal, input.body, staff.context.can("clients.contacts"));
    if (input.body.fields) fieldsToForm(form, await this.deals.listFields("deal"), input.body.fields);
    const r = await this.deals.updateDeal(this.metaOf(staff, token, req, locale), form);
    if (r.error) return refusedResponse(r.error);
    return { ok: true, message: r.ok ?? null };
  }

  @Endpoint("crmDealPlan")
  @Permissions("deals.edit")
  async dealPlan(
    @CurrentStaff() staff: StaffMember,
    @SessionToken() token: string | null,
    @Req() req: FastifyRequest,
    @RequestLocale() locale: Locale,
    @Input() input: Parsed<"crmDealPlan">,
  ): Promise<Output<"crmDealPlan"> | Response> {
    const r = await this.deals.setAgreedPlan(this.metaOf(staff, token, req, locale), input.dealId, input.body.plan);
    return r.ok ? { ok: true, message: "Тариф сохранён" } : refusedResponse(r.message ?? "Не удалось сохранить тариф");
  }

  @Endpoint("crmDealGifts")
  @Permissions("deals.edit")
  async dealGifts(
    @CurrentStaff() staff: StaffMember,
    @SessionToken() token: string | null,
    @Req() req: FastifyRequest,
    @RequestLocale() locale: Locale,
    @Input() input: Parsed<"crmDealGifts">,
  ): Promise<Output<"crmDealGifts"> | Response> {
    const r = await this.deals.setAgreedGifts(this.metaOf(staff, token, req, locale), input.dealId, input.body.gifts);
    return r.ok ? { ok: true, message: "Сохранено" } : refusedResponse(r.message ?? "Не удалось сохранить");
  }

  @Endpoint("crmDealExtras")
  @Permissions("deals.view")
  async dealExtras(@CurrentStaff() staff: StaffMember, @Input() input: Parsed<"crmDealExtras">): Promise<Output<"crmDealExtras">> {
    const deal = await this.deals.dealById(input.dealId);
    if (!deal || !staff.context.canSee(deal.assigneeId)) throw new ApiError(404, "notFound");
    const [duplicates, suggestedId, pipelines, stages] = await Promise.all([
      this.deals.duplicates(deal),
      !deal.clientId && deal.contactPhone ? this.deals.findClientByPhone(deal.contactPhone) : null,
      this.deals.listPipelines(),
      this.deals.listStages(),
    ]);
    const suggested = suggestedId ? await this.deals.clientBrief(suggestedId) : null;
    const works = staff.context.canWork(deal.assigneeId);
    return {
      clientId: deal.clientId ?? null,
      suggested: suggested && suggestedId ? { id: suggestedId, name: suggested.name || suggested.email || "Клиент" } : null,
      canCreateClient: !deal.clientId && !suggested && !!deal.contactPhone && staff.context.can("clients.create") && works,
      canLink: staff.context.can("deals.edit", "clients.view") && works,
      channels: manualChannels.map((k) => ({ id: k, label: channels[k] })),
      duplicates: duplicates.open.filter((r) => staff.context.canSee(r.deal.assigneeId)).map(formatDealLinkRow),
      canMerge: staff.context.can("deals.edit", "deals.delete") && works,
      past: duplicates.past.filter((r) => staff.context.canSee(r.deal.assigneeId)).map(formatDealLinkRow),
      pipelines: pipelines.map((p) => ({ id: p.id, label: p.name })),
      pipelineId: stages.find((s) => s.id === deal.stageId)?.pipelineId ?? pipelines[0]?.id ?? "",
      canMovePipeline: staff.context.can("deals.edit") && works && pipelines.length > 1,
      canDelete: staff.context.can("deals.delete") && works,
    };
  }

  @Endpoint("crmDealClientCreate")
  @Permissions("clients.create")
  async dealClientCreate(
    @CurrentStaff() staff: StaffMember,
    @SessionToken() token: string | null,
    @Req() req: FastifyRequest,
    @RequestLocale() locale: Locale,
    @Input() input: Parsed<"crmDealClientCreate">,
  ): Promise<Output<"crmDealClientCreate"> | Response> {
    const form = buildDealClientCreateForm(input.body);
    const r = await this.deals.createClientFromDeal(this.metaOf(staff, token, req, locale), input.dealId, form);
    if (!r.done) return refusedResponse(r.error ?? "Не удалось завести клиента");
    return { clientId: r.done.clientId, login: r.done.loginText, password: r.done.password, message: r.done.message };
  }

  @Endpoint("crmDealClientLink")
  @Permissions("deals.edit")
  async dealClientLink(
    @CurrentStaff() staff: StaffMember,
    @SessionToken() token: string | null,
    @Req() req: FastifyRequest,
    @RequestLocale() locale: Locale,
    @Input() input: Parsed<"crmDealClientLink">,
  ): Promise<Output<"crmDealClientLink"> | Response> {
    const r = await this.deals.linkDealClient(this.metaOf(staff, token, req, locale), input.dealId, input.body.clientId);
    if (!r.ok) return refusedResponse(r.message ?? "Не удалось привязать");
    return { ok: true, message: input.body.clientId ? "Сделка привязана к клиенту" : "Сделка отвязана от клиента" };
  }

  @Endpoint("crmDealMerge")
  @Permissions("deals.edit")
  async dealMerge(
    @CurrentStaff() staff: StaffMember,
    @SessionToken() token: string | null,
    @Req() req: FastifyRequest,
    @RequestLocale() locale: Locale,
    @Input() input: Parsed<"crmDealMerge">,
  ): Promise<Output<"crmDealMerge"> | Response> {
    const r = await this.deals.mergeDeal(this.metaOf(staff, token, req, locale), input.dealId, input.body.sourceId);
    if (r?.error) return refusedResponse(r.error);
    return { ok: true, message: "Сделки объединены" };
  }

  @Endpoint("crmDealPipeline")
  @Permissions("deals.edit")
  async dealPipeline(
    @CurrentStaff() staff: StaffMember,
    @SessionToken() token: string | null,
    @Req() req: FastifyRequest,
    @RequestLocale() locale: Locale,
    @Input() input: Parsed<"crmDealPipeline">,
  ): Promise<Output<"crmDealPipeline"> | Response> {
    try {
      await this.deals.movePipeline(this.metaOf(staff, token, req, locale), input.dealId, input.body.pipelineId);
    } catch (err) {
      if (err instanceof Error && /этапов/.test(err.message)) return refusedResponse(err.message);
      throw err;
    }
    return { ok: true, message: "Сделка перенесена в другую воронку" };
  }

  @Endpoint("crmDealDelete")
  @Permissions("deals.delete")
  async dealDelete(
    @CurrentStaff() staff: StaffMember,
    @SessionToken() token: string | null,
    @Req() req: FastifyRequest,
    @RequestLocale() locale: Locale,
    @Input() input: Parsed<"crmDealDelete">,
  ): Promise<Output<"crmDealDelete"> | Response> {
    try {
      const r = await this.deals.deleteDeal(this.metaOf(staff, token, req, locale), input.dealId);
      if (r?.error) return refusedResponse(r.error);
    } catch (err) {
      if (!isNextRedirect(err)) throw err;
    }
    return { ok: true, message: "Сделка удалена" };
  }
}
